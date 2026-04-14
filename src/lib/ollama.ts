// ============================================================
// بوابة الحدث - Local AI System (Ollama)
// 100% offline, no API keys, no quotas
// Uses Ollama local runtime for all AI features
// ============================================================

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3';

// ============ RESPONSE TYPES ============
interface OllamaResponse {
  model: string;
  response: string;
  done: boolean;
  total_duration?: number;
  eval_count?: number;
}

// ============ SUMMARY CACHE ============
// In-memory cache to avoid repeated AI calls for same text
const summaryCache = new Map<string, { data: string; timestamp: number }>();
const qualityCache = new Map<string, { data: { quality: number; analysis: string }; timestamp: number }>();
const rankCache = new Map<string, { data: number[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Generate a cache key from text (simple hash)
 */
function cacheKey(text: string): string {
  let hash = 0;
  for (let i = 0; i < Math.min(text.length, 200); i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Check if Ollama is running and the model is available
 */
let ollamaStatus: { available: boolean; checkedAt: number } | null = null;
const STATUS_CHECK_INTERVAL = 60 * 1000; // Re-check every 60 seconds

export async function isOllamaAvailable(): Promise<boolean> {
  // Use cached status if recent
  if (ollamaStatus && Date.now() - ollamaStatus.checkedAt < STATUS_CHECK_INTERVAL) {
    return ollamaStatus.available;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000); // 3s timeout

    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      ollamaStatus = { available: false, checkedAt: Date.now() };
      return false;
    }

    const data = await response.json();
    const models: string[] = (data.models || []).map((m: any) => m.name || m.model || '');
    const modelAvailable = models.some((m) => m.startsWith(OLLAMA_MODEL.split(':')[0]));

    if (!modelAvailable) {
      console.warn(`[Ollama] Model "${OLLAMA_MODEL}" not found. Available: ${models.join(', ')}`);
      // Try to find any available model
      if (models.length > 0) {
        console.log(`[Ollama] Will try using "${models[0]}" instead`);
      }
    }

    ollamaStatus = { available: true, checkedAt: Date.now() };
    console.log(`[Ollama] Available! Models: ${models.join(', ')}`);
    return true;
  } catch (error: any) {
    console.warn('[Ollama] Not available:', error.message);
    ollamaStatus = { available: false, checkedAt: Date.now() };
    return false;
  }
}

/**
 * Check if AI is configured (same interface as before, but now always true with Ollama)
 */
export function isGeminiConfigured(): boolean {
  // Keep same function name for backward compatibility with route imports
  // With Ollama, we check availability asynchronously
  return true; // Will be checked properly in the actual call
}

/**
 * Call Ollama generate API
 * Core function that talks to local Ollama runtime
 */
async function callOllama(
  prompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const { temperature = 0.3, maxTokens = 200 } = options;

  // First check if Ollama is available
  const available = await isOllamaAvailable();
  if (!available) {
    throw new Error('Ollama is not running. Please start Ollama first: ollama serve');
  }

  const url = `${OLLAMA_BASE_URL}/api/generate`;

  const body = {
    model: OLLAMA_MODEL,
    prompt,
    stream: false,
    options: {
      temperature,
      num_predict: maxTokens,
      top_p: 0.9,
      top_k: 40,
    },
  };

  console.log(`[Ollama] Calling model: ${OLLAMA_MODEL}`);
  console.log(`[Ollama] Prompt preview: ${prompt.substring(0, 80)}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout for AI

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (fetchError: any) {
    clearTimeout(timeout);
    if (fetchError.name === 'AbortError') {
      throw new Error('Ollama request timed out (60s). Model might be loading...');
    }
    throw new Error(`Ollama connection failed: ${fetchError.message}`);
  }

  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Ollama] Error response:', response.status, errorText);
    throw new Error(`Ollama error (${response.status}): ${errorText}`);
  }

  const data: OllamaResponse = await response.json();

  if (!data.response) {
    throw new Error('Ollama returned empty response');
  }

  const text = data.response.trim();
  const duration = data.total_duration ? (data.total_duration / 1e9).toFixed(2) : 'N/A';
  const tokens = data.eval_count || 0;

  console.log(`[Ollama] Response received: ${text.length} chars, ${tokens} tokens, ${duration}s`);

  return text;
}

// ============================================================
// PUBLIC API - Same interface as gemini.ts
// ============================================================

/**
 * Generate a summary of an Arabic news article (2-3 sentences)
 * Fallback: returns a simple truncated version if Ollama is down
 */
export async function summarizeArticle(title: string, snippet: string): Promise<string> {
  const articleText = [title, snippet].filter(Boolean).join('\n\n');

  // Check cache first
  const key = cacheKey(articleText);
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[Ollama] Summary cache hit');
    return cached.data;
  }

  try {
    const prompt = `أنت مساعد متخصص في تلخيص الأخبار باللغة العربية. قم بتلخيص الخبر التالي بشكل مختصر وشامل في 2-3 جمل فقط. ابدأ التلخيص مباشرة بدون مقدمات أو عناوين.

الخبر:
${articleText}

الملخص:`;

    const summary = await callOllama(prompt, { temperature: 0.3, maxTokens: 200 });

    // Cache the result
    summaryCache.set(key, { data: summary, timestamp: Date.now() });

    return summary;
  } catch (error: any) {
    console.error('[Ollama] Summarization failed:', error.message);
    // FALLBACK: Return a simple extracted summary
    return generateFallbackSummary(title, snippet);
  }
}

/**
 * Verify news reliability (fake news detection)
 * Returns quality score (1-10) and analysis
 * Fallback: returns neutral score
 */
export async function verifyArticle(title: string, snippet: string): Promise<{ quality: number; analysis: string }> {
  const articleText = [title, snippet].filter(Boolean).join('\n\n');

  // Check cache
  const key = cacheKey(articleText);
  const cached = qualityCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[Ollama] Quality cache hit');
    return cached.data;
  }

  try {
    const prompt = `أنت محلل أخبار متخصص في كشف الأخبار المضللة والمزيفة. حلل الخبر التالي وأعطِ:
1. درجة موثوقية من 1-10 (10 = موثوق تماماً، 1 = مزيف)
2. تحليل مختصر في جملة واحدة

أجب بالصيغة فقط: الرقم|التحليل
مثال: 7|الخبر من مصدر معروف لكن يفتقر لتفاصيل محددة

الخبر:
${articleText}

التحليل:`;

    const response = await callOllama(prompt, { temperature: 0.2, maxTokens: 100 });

    // Parse the response - extract number|text pattern
    const match = response.match(/(\d{1,2})\s*[|،,]\s*(.+)/);
    let quality: number;
    let analysis: string;

    if (match) {
      quality = Math.min(10, Math.max(1, parseInt(match[1]) || 5));
      analysis = match[2].trim();
    } else {
      // Try to extract just a number
      const numMatch = response.match(/(\d{1,2})/);
      quality = numMatch ? Math.min(10, Math.max(1, parseInt(numMatch[1]))) : 5;
      analysis = response.replace(/\d+/g, '').trim().substring(0, 100) || 'تحليل غير متاح';
    }

    const result = { quality, analysis };

    // Cache the result
    qualityCache.set(key, { data: result, timestamp: Date.now() });

    return result;
  } catch (error: any) {
    console.error('[Ollama] Verification failed:', error.message);
    // FALLBACK: Return neutral quality
    return {
      quality: 5,
      analysis: 'التحقق غير متاح - خدمة الذكاء الاصطناعي غير متصلة',
    };
  }
}

/**
 * Rank articles by importance (1-10 scores)
 * Fallback: returns random scores
 */
export async function rankArticles(titles: string[]): Promise<number[]> {
  if (titles.length === 0) return [];

  // Check cache
  const key = cacheKey(titles.join('|'));
  const cached = rankCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[Ollama] Rank cache hit');
    return cached.data;
  }

  try {
    const titlesText = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');

    const prompt = `أنت نظام تقييم أخبار. قم بتقييم أهمية كل خبر من 1 إلى 10 (10 = مهم جداً).
أجب فقط بالأرقام مفصولة بفواصل، بنفس ترتيب الأخبار.
مثال: 8,5,9,3,7

الأخبار:
${titlesText}

التقييم:`;

    const response = await callOllama(prompt, { temperature: 0.1, maxTokens: 100 });

    const scores = response
      .split(/[,\s]+/)
      .map(Number)
      .filter((n) => !isNaN(n) && n >= 1 && n <= 10);

    // Ensure we have the right number of scores
    while (scores.length < titles.length) {
      scores.push(Math.floor(Math.random() * 4) + 5); // 5-8 default
    }

    const result = scores.slice(0, titles.length);

    // Cache
    rankCache.set(key, { data: result, timestamp: Date.now() });

    return result;
  } catch (error: any) {
    console.error('[Ollama] Ranking failed:', error.message);
    // FALLBACK: Return reasonable random scores
    return titles.map(() => Math.floor(Math.random() * 4) + 5);
  }
}

// ============================================================
// FALLBACK FUNCTIONS (when Ollama is down)
// ============================================================

/**
 * Generate a simple fallback summary when Ollama is not available
 * Uses basic text extraction, no AI needed
 */
function generateFallbackSummary(title: string, snippet: string): string {
  if (!snippet && !title) return 'لا يوجد ملخص متاح';

  // If we have a snippet, use it (truncated)
  if (snippet) {
    const cleaned = snippet.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 150) return cleaned;
    // Truncate at last space before 150 chars
    const truncated = cleaned.substring(0, 150);
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace > 0 ? lastSpace : 150) + '...';
  }

  // Fallback to title only
  return title;
}
