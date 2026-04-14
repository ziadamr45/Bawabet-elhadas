// ============================================================
// بوابة الحدث - Hugging Face AI System
// Free, stable, production-ready inference via HF API
// Replaces Ollama/Gemini with Hugging Face Inference API
// ============================================================

import { v4 as uuidv4 } from 'uuid';

// ============ CONFIGURATION ============
const HF_API_URL = 'https://api-inference.huggingface.co/models';
const HF_TOKEN = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '';

// Model pool — ordered by priority (multilingual first for Arabic support)
const SUMMARIZATION_MODELS = [
  'csebuetnlp/mT5_multilingual_XLSum',  // Best for Arabic summarization
  'google/flan-t5-large',                // Multilingual instruction-following
  'facebook/bart-large-cnn',             // English fallback (fast)
] as const;

const TEXT_GENERATION_MODEL = 'google/flan-t5-large';  // For scoring & quality tasks

// ============ TIMEOUTS & RATE LIMITS ============
const API_TIMEOUT_MS = 30_000;         // 30s per request
const MAX_RETRIES = 1;                 // 1 retry on failure
const RETRY_DELAY_MS = 1_000;          // 1s between retries
const RATE_LIMIT_DELAY_MS = 1_500;     // 1.5s between HF calls (free tier)
const MAX_CONCURRENT_REQUESTS = 3;     // Max parallel HF calls

// ============ RESPONSE TYPES ============
interface HFSummarizationResponse {
  summary_text: string;
}

interface HFTextGenerationResponse {
  generated_text: string;
}

interface HFErrorResponse {
  error: string;
  estimated_time?: number;
  model?: string;
}

// ============ IN-MEMORY CACHE ============
const summaryCache = new Map<string, { data: string; timestamp: number }>();
const qualityCache = new Map<string, { data: { quality: number; analysis: string }; timestamp: number }>();
const rankCache = new Map<string, { data: number[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Rate limiter — simple queue to avoid free-tier throttling
let lastCallTime = 0;
let activeRequests = 0;

/**
 * Generate a cache key from text (deterministic hash)
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
 * Enforce rate limit: wait if needed, track concurrency
 */
async function enforceRateLimit(): Promise<void> {
  // Wait for slot
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((r) => setTimeout(r, 500));
  }
  // Enforce minimum delay between calls
  const now = Date.now();
  const timeSinceLastCall = now - lastCallTime;
  if (timeSinceLastCall < RATE_LIMIT_DELAY_MS) {
    await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS - timeSinceLastCall));
  }
  activeRequests++;
  lastCallTime = Date.now();
}

function releaseRequest(): void {
  activeRequests = Math.max(0, activeRequests - 1);
}

// ============ CORE HF API CALLER ============

/**
 * Low-level Hugging Face API caller with retry, timeout, and rate limiting
 */
async function callHuggingFace(
  model: string,
  body: Record<string, unknown>,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<Response> {
  if (!HF_TOKEN) {
    throw new Error('HUGGINGFACE_API_KEY not set. Add it to your .env file.');
  }

  await enforceRateLimit();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${HF_API_URL}/${model}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return response;
  } catch (fetchError: any) {
    if (fetchError.name === 'AbortError') {
      throw new Error(`Hugging Face request timed out after ${timeoutMs / 1000}s`);
    }
    throw new Error(`Hugging Face connection failed: ${fetchError.message}`);
  } finally {
    clearTimeout(timeout);
    releaseRequest();
  }
}

/**
 * Call HF API with retry logic
 */
async function callWithRetry<T>(
  model: string,
  body: Record<string, unknown>,
  parser: (data: any) => T,
  timeoutMs: number = API_TIMEOUT_MS
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[HF] Retry attempt ${attempt}/${MAX_RETRIES} for ${model}`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    try {
      const response = await callHuggingFace(model, body, timeoutMs);

      if (!response.ok) {
        const errorData: HFErrorResponse = await response.json().catch(() => ({ error: 'Unknown error' }));

        // Model is loading — wait and retry
        if (response.status === 503 && errorData.estimated_time) {
          const waitTime = Math.min(errorData.estimated_time * 1000, 20_000);
          console.log(`[HF] Model "${model}" is loading. Waiting ${Math.ceil(waitTime / 1000)}s...`);
          await new Promise((r) => setTimeout(r, waitTime));
          continue;
        }

        // Rate limited (429)
        if (response.status === 429) {
          console.log(`[HF] Rate limited on ${model}. Waiting 5s...`);
          await new Promise((r) => setTimeout(r, 5_000));
          continue;
        }

        // Auth error
        if (response.status === 401 || response.status === 403) {
          throw new Error(`Hugging Face authentication failed (${response.status}). Check your HF_TOKEN.`);
        }

        throw new Error(`Hugging Face error (${response.status}): ${errorData.error}`);
      }

      const data = await response.json();
      return parser(data);

    } catch (error: any) {
      lastError = error;
      console.error(`[HF] Attempt ${attempt + 1} failed for ${model}:`, error.message);
    }
  }

  throw lastError || new Error('All Hugging Face API attempts failed');
}

// ============ AVAILABILITY CHECK ============

let hfStatus: { available: boolean; checkedAt: number } | null = null;
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000; // Re-check every 5 minutes

/**
 * Check if Hugging Face API is accessible and token is valid
 */
export async function isHuggingFaceAvailable(): Promise<boolean> {
  if (hfStatus && Date.now() - hfStatus.checkedAt < STATUS_CHECK_INTERVAL) {
    return hfStatus.available;
  }

  if (!HF_TOKEN) {
    hfStatus = { available: false, checkedAt: Date.now() };
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://api-inference.huggingface.co/models/google/flan-t5-large', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ inputs: 'test' }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    hfStatus = {
      available: response.status !== 401 && response.status !== 403,
      checkedAt: Date.now(),
    };
    return hfStatus.available;
  } catch {
    hfStatus = { available: false, checkedAt: Date.now() };
    return false;
  }
}

/**
 * Backward-compatible check (same interface as old ollama.ts)
 */
export function isGeminiConfigured(): boolean {
  return !!HF_TOKEN;
}

// ============================================================
// PUBLIC API — Same interface as ollama.ts for drop-in replacement
// ============================================================

// ============ 1. GENERATE SUMMARY ============

/**
 * Generate a summary of an Arabic news article (2-3 lines)
 * Uses Hugging Face multilingual summarization model
 * Falls back to simple text extraction on failure
 */
export async function summarizeArticle(title: string, snippet: string): Promise<string> {
  const articleText = [title, snippet].filter(Boolean).join('\n\n');

  // Check cache first
  const key = cacheKey(articleText);
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[HF] Summary cache HIT');
    return cached.data;
  }

  if (!HF_TOKEN) {
    console.warn('[HF] No token configured, using fallback summary');
    return fallbackSummary(title, snippet);
  }

  try {
    const summary = await generateSummary(title, snippet);
    summaryCache.set(key, { data: summary, timestamp: Date.now() });
    return summary;
  } catch (error: any) {
    console.error('[HF] Summarization failed:', error.message);
    return fallbackSummary(title, snippet);
  }
}

/**
 * Core summarization function using Hugging Face Inference API
 * Tries multilingual models first, falls back to English model
 */
export async function generateSummary(title: string, snippet: string): Promise<string> {
  const articleText = [title, snippet].filter(Boolean).join(' — ');

  // Build the prompt for Arabic summarization
  const prompt = `Summarize the following Arabic news article in 2-3 concise sentences in Arabic. Do not add titles or introductions, just the summary:\n\n${articleText}`;

  let lastError: Error | null = null;

  // Try each model in priority order
  for (const model of SUMMARIZATION_MODELS) {
    try {
      // For mT5_XLSum and flan-t5, use text2text-generation endpoint
      const isXLSum = model.includes('XLSum');

      if (isXLSum) {
        // mT5 XLSum expects raw text input, not a prompt
        const result = await callWithRetry<HFSummarizationResponse>(
          model,
          { inputs: articleText.substring(0, 1024) },  // XLSum has token limits
          (data) => {
            // XLSum returns array or single object
            if (Array.isArray(data) && data[0]?.summary_text) {
              return data[0];
            }
            if (data?.summary_text) return data;
            throw new Error('Unexpected response format from XLSum model');
          },
          25_000
        );
        return result.summary_text.trim();
      } else {
        // flan-t5-large and bart-large-cnn use text2text-generation
        const body: Record<string, unknown> = {
          inputs: prompt,
          parameters: {
            max_new_tokens: 150,
            temperature: 0.3,
            top_p: 0.9,
            do_sample: false,
          },
        };

        const result = await callWithRetry<HFTextGenerationResponse>(
          model,
          body,
          (data) => {
            if (Array.isArray(data) && data[0]?.generated_text) {
              return data[0];
            }
            if (data?.generated_text) return data;
            throw new Error('Unexpected response format');
          },
          25_000
        );
        return result.generated_text.trim();
      }
    } catch (error: any) {
      console.warn(`[HF] Model "${model}" failed:`, error.message);
      lastError = error;
      continue; // Try next model
    }
  }

  // All models failed
  throw lastError || new Error('All summarization models failed');
}

/**
 * Fallback summary when Hugging Face is unavailable
 * Extracts first 100-150 characters from the article text
 */
export function fallbackSummary(title: string, snippet: string): string {
  if (!snippet && !title) return 'لا يوجد ملخص متاح';

  // Prefer snippet (it's usually the article description)
  if (snippet) {
    const cleaned = snippet.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 150) return cleaned;
    const truncated = cleaned.substring(0, 150);
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace > 0 ? lastSpace : 150) + '...';
  }

  // Fall back to title only
  return title || 'لا يوجد ملخص متاح';
}

// ============ 2. VERIFY ARTICLE (QUALITY & RELIABILITY) ============

/**
 * Verify news reliability — returns quality score (1-10) and analysis
 * Uses heuristic scoring + optional HF classification
 */
export async function verifyArticle(
  title: string,
  snippet: string
): Promise<{ quality: number; analysis: string }> {
  const articleText = [title, snippet].filter(Boolean).join('\n\n');

  // Check cache
  const key = cacheKey(articleText);
  const cached = qualityCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[HF] Quality cache HIT');
    return cached.data;
  }

  // Use heuristic scoring (fast, no API call needed)
  const result = detectQuality(title, snippet);

  // Cache the result
  qualityCache.set(key, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Detect article quality using heuristic analysis
 * Fast, reliable, no external API needed
 * 
 * Scoring criteria:
 * - Text length and completeness
 * - Presence of specific details (numbers, names, locations)
 * - Source credibility signals
 * - Clickbait indicators (negative signals)
 */
export function detectQuality(title: string, snippet: string): { quality: number; analysis: string } {
  const fullText = [title, snippet].filter(Boolean).join(' ');
  
  let score = 5; // Start neutral
  const signals: string[] = [];

  // --- POSITIVE SIGNALS ---

  // Text length (longer = more informative)
  if (fullText.length > 300) {
    score += 1;
    signals.push('نص مفصل');
  } else if (fullText.length < 80) {
    score -= 1;
    signals.push('نص قصير جداً');
  }

  // Contains numbers/years (factual reporting)
  if (/\d{4}/.test(fullText) || /\d+%/.test(fullText)) {
    score += 1;
    signals.push('يحتوي أرقام وتواريخ');
  }

  // Contains quotation marks (direct quotes)
  if (/[""«»"'].*[""«»"']/.test(fullText)) {
    score += 1;
    signals.push('يحتلي اقتباسات');
  }

  // Contains location/country names (specific reporting)
  const locationPatterns = /\b(مصر|السعودية|الإمارات|القاهرة|رياض|دبي|واشنطن|لندن|باريس|بغداد|بيروت)\b/i;
  if (locationPatterns.test(fullText)) {
    score += 0.5;
    signals.push('يحتوي مواقع جغرافية');
  }

  // Contains named entities (official titles)
  const officialPatterns = /\b(رئيس|وزير|سفير|محافظ|حكومة|برلمان|جامعة|وزارة)\b/i;
  if (officialPatterns.test(fullText)) {
    score += 0.5;
    signals.push('يحتلي جهات رسمية');
  }

  // --- NEGATIVE SIGNALS ---

  // Clickbait indicators (Arabic)
  const clickbaitPatterns = /\b(صادم|لن تصدق|بعد شبه|سر|الحقيقة الكاملة|عاجل جداً|ممنوع النشر|لأول مرة|شاهد|قبل الحذف)\b/i;
  if (clickbaitPatterns.test(fullText)) {
    score -= 2;
    signals.push('يحتوي عبارات استقطابية');
  }

  // Excessive punctuation (!!! ???)
  if (/[!؟]{3,}/.test(fullText)) {
    score -= 1;
    signals.push('علامات تعجب مفرطة');
  }

  // ALL CAPS (in Arabic, less common but still a signal)
  if (/[A-Z]{5,}/.test(fullText)) {
    score -= 0.5;
    signals.push('حروف كبيرة');
  }

  // Too many emoji-like characters
  const emojiCount = (fullText.match(/[❗❓🔥💥⚡🎉😡😭🚨🆘]/g) || []).length;
  if (emojiCount > 2) {
    score -= 1;
    signals.push('رموز تعبيرية مفرطة');
  }

  // Clamp score to 1-10 range
  score = Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;

  // Generate analysis text
  let analysis: string;
  if (score >= 8) {
    analysis = `خبر موثوق - ${signals.join('، ')}`;
  } else if (score >= 6) {
    analysis = `خبر معقول - ${signals.join('، ')}`;
  } else if (score >= 4) {
    analysis = `خبر يحتاج تحقق - ${signals.join('، ')}`;
  } else {
    analysis = `خبر مشبوه - ${signals.join('، ')}`;
  }

  // If no signals detected, provide default analysis
  if (signals.length === 0) {
    analysis = 'لا توجد مؤشرات كافية لتقييم الخبر';
  }

  return { quality: score, analysis };
}

// ============ 3. SCORE ARTICLE IMPORTANCE ============

/**
 * Score article importance (1-10) using heuristic analysis
 * No AI needed — fast, reliable, free
 */
export function scoreArticle(title: string, snippet: string): number {
  const fullText = [title, snippet].filter(Boolean).join(' ');
  let score = 5;

  // High-impact keywords (Arabic)
  const highImpactWords = [
    'حرب', 'صراع', 'كرئيس', 'انتخابات', 'انفجار', 'زلزال', 'كارثة',
    'اتفاقية', 'قمة', 'رسمي', 'قرار', 'إعلان', 'تغيير', 'استقالة',
    'وفاة', 'إصابة', 'تصعيد', 'هدنة', 'حصار', 'غزو', 'تحرير',
    'رئيس جمهورية', 'رئيس وزراء', 'ملك', 'أمير', 'بابا',
    'أمم متحدة', 'حلف شمال الأطلسي', 'ناتو', 'أوبك', 'فلسطين',
    'إسرائيل', 'أمريكا', 'روسيا', 'الصين', 'أوروبا',
  ];

  // Medium-impact keywords
  const mediumImpactWords = [
    'اقتصاد', 'بورصة', 'أسعار', 'نفط', 'غاز', 'تضخم', 'بطالة',
    'رياضة', 'كأس العالم', 'أولمبياد', 'بطولة', 'نهائي',
    'تكنولوجيا', 'ذكاء اصطناعي', 'إنترنت', 'فضاء', 'اكتشاف',
    'صحة', 'وباء', 'لقاح', 'مستشفى', 'دواء',
  ];

  // Count keyword matches
  let highMatches = 0;
  let mediumMatches = 0;

  for (const word of highImpactWords) {
    if (fullText.includes(word)) highMatches++;
  }
  for (const word of mediumImpactWords) {
    if (fullText.includes(word)) mediumMatches++;
  }

  // Score calculation
  score += Math.min(highMatches * 1.5, 4);  // Max +4 from high-impact words
  score += Math.min(mediumMatches * 0.75, 2); // Max +2 from medium-impact words

  // Title vs snippet: if title has high-impact words, boost more
  const titleHighMatches = highImpactWords.filter(w => title.includes(w)).length;
  if (titleHighMatches > 0) score += 0.5;

  // Short breaking-style titles get a small boost
  if (title.length < 60 && highMatches > 0) score += 0.5;

  // Article length bonus (longer articles tend to be more important)
  if (fullText.length > 500) score += 0.5;

  return Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;
}

// ============ 4. RANK ARTICLES (BATCH SCORING) ============

/**
 * Rank multiple articles by importance (batch scoring)
 * Uses heuristic scoring — no API calls needed
 * Drop-in replacement for old Ollama-based ranking
 */
export async function rankArticles(titles: string[]): Promise<number[]> {
  if (titles.length === 0) return [];

  // Check cache
  const key = cacheKey(titles.join('|'));
  const cached = rankCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[HF] Rank cache HIT');
    return cached.data;
  }

  // Score each article using heuristic (instant, no API call)
  const scores = titles.map((title) => scoreArticle(title, ''));

  // Cache the result
  rankCache.set(key, { data: scores, timestamp: Date.now() });

  return scores;
}

// ============ CACHE MANAGEMENT ============

/**
 * Clear all caches (useful for testing or admin)
 */
export function clearAllCaches(): void {
  summaryCache.clear();
  qualityCache.clear();
  rankCache.clear();
  hfStatus = null;
  console.log('[HF] All caches cleared');
}

/**
 * Get cache statistics (useful for monitoring)
 */
export function getCacheStats(): {
  summaryCacheSize: number;
  qualityCacheSize: number;
  rankCacheSize: number;
  isConfigured: boolean;
  estimatedTimeToExpire: string;
} {
  const now = Date.now();
  const minExpiry = Math.min(
    ...[...summaryCache.values(), ...qualityCache.values(), ...rankCache.values()].map(
      (v) => Math.max(0, CACHE_TTL - (now - v.timestamp))
    ),
    CACHE_TTL
  );

  return {
    summaryCacheSize: summaryCache.size,
    qualityCacheSize: qualityCache.size,
    rankCacheSize: rankCache.size,
    isConfigured: !!HF_TOKEN,
    estimatedTimeToExpire: `${Math.ceil(minExpiry / 60000)} دقيقة`,
  };
}

// ============ INITIALIZATION CHECK ============

// Log configuration status on module load
if (!HF_TOKEN) {
  console.warn(
    '[HF] ⚠️  HUGGINGFACE_API_KEY not set in environment variables.' +
    '\n     AI features will use fallback (no-cost heuristic) mode.' +
    '\n     Get a free token at: https://huggingface.co/settings/tokens' +
    '\n     Then add to .env: HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxx'
  );
} else {
  console.log(
    `[HF] ✅ Configured with token (${HF_TOKEN.substring(0, 8)}...)` +
    `\n[HF] Summarization models: ${SUMMARIZATION_MODELS.join(', ')}`
  );
}
