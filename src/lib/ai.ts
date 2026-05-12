// ============================================================
// بوابة الحدث - AI System (OpenRouter + Gemini 2.0 Flash)
// Production-ready AI inference via OpenRouter API
// Uses google/gemini-2.0-flash-001 (fast, excellent Arabic support)
// ============================================================

// ============ CONFIGURATION ============
const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';

// OpenRouter endpoint (OpenAI-compatible chat completions)
const AI_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Model for all AI tasks (summarization, verification, scoring)
const AI_MODEL = 'google/gemini-2.0-flash-001';

// App info for OpenRouter headers
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const APP_NAME = 'بوابة الحدث - Bawabet Elhadas';

// ============ TIMEOUTS & RATE LIMITS ============
const API_TIMEOUT_MS = 30_000;         // 30s (Gemini Flash is fast)
const MAX_RETRIES = 1;                 // 1 retry on failure
const RETRY_DELAY_MS = 2_000;          // 2s between retries
const RATE_LIMIT_DELAY_MS = 500;       // 500ms between calls (paid tier, faster)
const MAX_CONCURRENT_REQUESTS = 3;     // Max parallel calls (OpenRouter handles more)

// ============ RESPONSE TYPES ============
interface AIChatResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ============ IN-MEMORY CACHE ============
const summaryCache = new Map<string, { data: string; timestamp: number }>();
const qualityCache = new Map<string, { data: { quality: number; analysis: string }; timestamp: number }>();
const rankCache = new Map<string, { data: number[]; timestamp: number }>();
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// Rate limiter
let lastCallTime = 0;
let activeRequests = 0;

/**
 * Generate a cache key from text
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
 * Enforce rate limit
 */
async function enforceRateLimit(): Promise<void> {
  while (activeRequests >= MAX_CONCURRENT_REQUESTS) {
    await new Promise((r) => setTimeout(r, 500));
  }
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

// ============ CORE AI API CALLER ============

/**
 * Call OpenRouter API (google/gemini-2.0-flash-001)
 * Supports chat completions with Arabic content
 */
async function callAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2048,
  temperature: number = 0.3
): Promise<string> {
  if (!AI_API_KEY) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  await enforceRateLimit();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

  try {
    const response = await fetch(AI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_URL,
        'X-Title': APP_NAME,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: `HTTP ${response.status}` }));

      if (response.status === 429) {
        throw new Error('Rate limited — backing off');
      }
      if (response.status === 401 || response.status === 403) {
        throw new Error(`Authentication failed (${response.status}). Check your OPENROUTER_API_KEY.`);
      }
      if (response.status === 402) {
        throw new Error('Insufficient credits on OpenRouter account.');
      }

      throw new Error(`OpenRouter API error (${response.status}): ${errorData.error || 'Unknown'}`);
    }

    const data: AIChatResponse = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    if (!content.trim()) {
      throw new Error('Empty response from AI model');
    }

    console.log(
      `[AI] Response OK: ${content.length} chars, ` +
      `${data.usage?.total_tokens || '?'} tokens`
    );

    return content.trim();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error(`AI request timed out after ${API_TIMEOUT_MS / 1000}s`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    releaseRequest();
  }
}

/**
 * Call with retry logic
 */
async function callWithRetry(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2048,
  temperature: number = 0.3
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[AI] Retry ${attempt}/${MAX_RETRIES}`);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }

    try {
      return await callAI(systemPrompt, userMessage, maxTokens, temperature);
    } catch (error: any) {
      lastError = error;
      console.error(`[AI] Attempt ${attempt + 1} failed:`, error.message);

      // Don't retry auth errors or credit errors
      if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('402')) {
        break;
      }
    }
  }

  throw lastError || new Error('All AI attempts failed');
}

// ============ AVAILABILITY CHECK ============

let aiStatus: { available: boolean; checkedAt: number } | null = null;
const STATUS_CHECK_INTERVAL = 5 * 60 * 1000;

export async function isAIAvailable(): Promise<boolean> {
  if (aiStatus && Date.now() - aiStatus.checkedAt < STATUS_CHECK_INTERVAL) {
    return aiStatus.available;
  }

  if (!AI_API_KEY) {
    aiStatus = { available: false, checkedAt: Date.now() };
    return false;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const response = await fetch(AI_CHAT_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${AI_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': APP_URL,
        'X-Title': APP_NAME,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        messages: [{ role: 'user', content: 'مرحبا' }],
        max_tokens: 10,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    aiStatus = { available: response.status !== 401 && response.status !== 403 && response.status !== 402, checkedAt: Date.now() };
    return aiStatus.available;
  } catch {
    aiStatus = { available: false, checkedAt: Date.now() };
    return false;
  }
}

// Backward compatibility alias
export const isHuggingFaceAvailable = isAIAvailable;

export function isGeminiConfigured(): boolean {
  return !!AI_API_KEY;
}

// ============================================================
// 1. SUMMARIZATION (AI-Powered)
// ============================================================

/**
 * Generate an Arabic summary of a news article (2-3 sentences).
 * Uses Gemini 2.0 Flash via OpenRouter for high-quality Arabic output.
 */
export async function summarizeArticle(title: string, snippet: string): Promise<string> {
  const articleText = [title, snippet].filter(Boolean).join('\n\n');

  // Check cache
  const key = cacheKey(articleText);
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[AI] Summary cache HIT');
    return cached.data;
  }

  if (!AI_API_KEY) {
    return fallbackSummary(title, snippet);
  }

  try {
    const summary = await callWithRetry(
      'أنت مساعد متخصص في تلخيص الأخبار باللغة العربية. قواعدك:\n- لخّص الخبر في 2-3 جمل مختصرة وواضحة فقط\n- لا تضف عناوين أو مقدمات أو خاتمة\n- ابدأ الملخص مباشرة بدون أي كلمات استهلالية\n- حافظ على الحقائق والأرقام المذكورة في الخبر\n- استخدم لغة عربية فصحى بسيطة',
      `لخّص الخبر التالي:\n\n${articleText}`,
      2048,
      0.3
    );

    // Clean up: remove any unwanted prefixes
    const cleaned = summary
      .replace(/^\s*(摘要|Summary|ملخص)[:\s]*/i, '')
      .trim();

    const finalSummary = cleaned.length > 0 ? cleaned : summary;

    summaryCache.set(key, { data: finalSummary, timestamp: Date.now() });
    return finalSummary;
  } catch (error: any) {
    console.error('[AI] Summarization failed:', error.message);
    return fallbackSummary(title, snippet);
  }
}

/**
 * Core summarization function (for direct use)
 */
export async function generateSummary(title: string, snippet: string): Promise<string> {
  return summarizeArticle(title, snippet);
}

/**
 * Fallback summary when AI is unavailable
 */
export function fallbackSummary(title: string, snippet: string): string {
  if (!snippet && !title) return 'لا يوجد ملخص متاح';

  if (snippet) {
    const cleaned = snippet.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 150) return cleaned;
    const truncated = cleaned.substring(0, 150);
    const lastSpace = truncated.lastIndexOf(' ');
    return truncated.substring(0, lastSpace > 0 ? lastSpace : 150) + '...';
  }

  return title || 'لا يوجد ملخص متاح';
}

// ============================================================
// 2. ARTICLE VERIFICATION (AI-Powered)
// ============================================================

/**
 * Verify news reliability using AI analysis.
 * Returns quality score (1-10) and detailed analysis.
 */
export async function verifyArticle(
  title: string,
  snippet: string
): Promise<{ quality: number; analysis: string }> {
  const articleText = [title, snippet].filter(Boolean).join('\n\n');

  // Check cache
  const key = cacheKey(articleText + ':verify');
  const cached = qualityCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log('[AI] Quality cache HIT');
    return cached.data;
  }

  // Use AI if available
  if (AI_API_KEY) {
    try {
      const response = await callWithRetry(
        'أنت محلل أخبار متخصص في تقييم موثوقية الأخبار العربية. حلل الخبر التالي وأجب بالصيغة التالية فقط بدون أي نص إضافي:\n\nالدرجة: [رقم من 1 إلى 10]\nالتحليل: [جملة واحدة توضح سبب الدرجة]\n\nقواعد التقييم:\n- 9-10: خبر من مصدر رسمي موثوق مع تفاصيل محددة وأرقام\n- 7-8: خبر جيد من مصدر معروف لكن ينقصه بعض التفاصيل\n- 5-6: خبر عادي لا يوجد ما يؤكده أو ينفيه\n- 3-4: خبر مشبوه يحتوي عبارات استقطابية أو مبالغة\n- 1-2: خبر مزيف أو مضلل بوضوح\n\nلا تضف أي شيء آخر غير الدرجة والتحليل.',
        `حلل هذا الخبر:\n\n${articleText}`,
        2048,
        0.2
      );

      // Parse response
      const result = parseVerificationResponse(response);

      qualityCache.set(key, { data: result, timestamp: Date.now() });
      return result;
    } catch (error: any) {
      console.error('[AI] AI verification failed:', error.message);
    }
  }

  // Fallback to heuristic
  const result = detectQuality(title, snippet);
  qualityCache.set(key, { data: result, timestamp: Date.now() });
  return result;
}

/**
 * Parse AI verification response into structured data
 */
function parseVerificationResponse(response: string): { quality: number; analysis: string } {
  // Try to extract "الدرجة: X" pattern
  const scoreMatch = response.match(/الدرجة\s*[:：]\s*(\d+(?:\.\d+)?)/);
  // Try "Analysis:" or "التحليل:" pattern
  const analysisMatch = response.match(/التحليل\s*[:：]\s*(.+)/);

  if (scoreMatch) {
    const quality = Math.min(10, Math.max(1, parseFloat(scoreMatch[1]) || 5));
    const analysis = analysisMatch
      ? analysisMatch[1].trim().substring(0, 150)
      : response.replace(/الدرجة\s*[:：]\s*\d+(?:\.\d+)?/g, '').trim().substring(0, 150);

    return {
      quality: Math.round(quality * 10) / 10,
      analysis: analysis || 'تحليل غير متاح',
    };
  }

  // Try just extracting a number
  const numMatch = response.match(/(\d{1,2})(?:\.(\d+))?/);
  if (numMatch) {
    const quality = Math.min(10, Math.max(1, parseInt(numMatch[1]) || 5));
    const analysis = response.replace(/\d+/g, '').trim().substring(0, 150) || 'تحليل غير متاح';
    return { quality, analysis };
  }

  return { quality: 5, analysis: 'لم يتم تحليل الخبر بشكل صحيح' };
}

// ============================================================
// 3. QUALITY DETECTION (Heuristic Fallback)
// ============================================================

/**
 * Detect article quality using heuristic analysis.
 * Enhanced with more signals and wider score range.
 */
export function detectQuality(title: string, snippet: string): { quality: number; analysis: string } {
  const fullText = [title, snippet].filter(Boolean).join(' ');

  let score = 5; // Start neutral
  const signals: string[] = [];

  // ===== POSITIVE SIGNALS =====

  // Text length
  if (fullText.length > 400) {
    score += 1.5;
    signals.push('نص مفصل');
  } else if (fullText.length > 200) {
    score += 0.5;
    signals.push('نص متوسط');
  } else if (fullText.length < 80) {
    score -= 1.5;
    signals.push('نص قصير جداً');
  }

  // Numbers/years/dates
  const numberCount = (fullText.match(/\d+/g) || []).length;
  if (numberCount >= 5) {
    score += 1.5;
    signals.push('أرقام وإحصائيات كثيرة');
  } else if (numberCount >= 2) {
    score += 1;
    signals.push('يحتوي أرقام وتواريخ');
  }

  // Quotation marks (direct quotes)
  const quoteCount = (fullText.match(/[""«»"']/g) || []).length;
  if (quoteCount >= 4) {
    score += 1.5;
    signals.push('اقتباسات متعددة');
  } else if (quoteCount >= 2) {
    score += 0.5;
    signals.push('اقتباسات');
  }

  // Location names (specific reporting)
  const locations = (fullText.match(/\b(مصر|السعودية|الإمارات|القاهرة|رياض|دبي|واشنطن|لندن|باريس|بغداد|بيروت|طرابلس|الخرطوم|دمشق|عمان|الدوحة|المنامة|الكويت|الرباط|الجزائر|تونس|نيويورك|طوكيو|موسكو|برلين)\b/gi) || []).length;
  if (locations >= 2) {
    score += 1;
    signals.push('مواقع جغرافية متعددة');
  } else if (locations >= 1) {
    score += 0.5;
    signals.push('يحتوي موقع جغرافي');
  }

  // Official titles/entities
  const officials = (fullText.match(/\b(رئيس|وزير|سفير|محافظ|حكومة|برلمان|جامعة|وزارة|مجلس|قيادي|مسؤول|الرئاسة|مجلس الوزراء)\b/gi) || []).length;
  if (officials >= 2) {
    score += 1;
    signals.push('جهات رسمية متعددة');
  } else if (officials >= 1) {
    score += 0.5;
    signals.push('جهة رسمية');
  }

  // Source mention (named source)
  if (/أفاد|قال|أوضح|أكد|صرح|أعلن|بيان|مصدر|وفقاً|حسب/i.test(fullText)) {
    score += 1;
    signals.push('ينسب لمصدر محدد');
  }

  // ===== NEGATIVE SIGNALS =====

  // Clickbait
  const clickbaitWords = ['صادم', 'لن تصدق', 'بعد شبه', 'سر', 'الحقيقة الكاملة', 'عاجل جداً', 'ممنوع النشر', 'لأول مرة', 'شاهد الفيديو', 'قبل الحذف', 'سيجعلك تبكي', 'ما حد يتوقعه'];
  const clickbaitCount = clickbaitWords.filter(w => fullText.includes(w)).length;
  if (clickbaitCount >= 2) {
    score -= 3;
    signals.push('عبارات استقطابية متعددة');
  } else if (clickbaitCount >= 1) {
    score -= 1.5;
    signals.push('عبارات استقطابية');
  }

  // Excessive punctuation
  const exclamations = (fullText.match(/[!؟]{2,}/g) || []).length;
  if (exclamations >= 3) {
    score -= 1.5;
    signals.push('علامات تعجب مفرطة');
  } else if (exclamations >= 1) {
    score -= 0.5;
  }

  // ALL CAPS
  if (/[A-Z]{5,}/.test(fullText)) {
    score -= 0.5;
    signals.push('حروف كبيرة');
  }

  // Too many emojis
  const emojiCount = (fullText.match(/[❗❓🔥💥⚡🎉😡😭🚨🆘]/g) || []).length;
  if (emojiCount > 2) {
    score -= 1;
    signals.push('رموز تعبيرية مفرطة');
  }

  // Source credibility bonus
  const credibleSources = ['رويترز', 'ألمانيا', 'فرانس برس', 'سي إن إن', 'BBC', 'الأهرام', 'الجزيرة', 'المصري اليوم', 'الوفد', 'اليوم السابع'];
  for (const src of credibleSources) {
    if (fullText.includes(src)) {
      score += 1;
      signals.push(`مصدر موثوق (${src})`);
      break;
    }
  }

  // Clamp and round
  score = Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;

  // Generate analysis
  let analysis: string;
  if (score >= 8.5) {
    analysis = `خبر موثوق جداً — ${signals.join('، ')}`;
  } else if (score >= 7) {
    analysis = `خبر موثوق — ${signals.join('، ')}`;
  } else if (score >= 5.5) {
    analysis = `خبر معقول — ${signals.join('، ')}`;
  } else if (score >= 4) {
    analysis = `خبر يحتاج تحقق — ${signals.join('، ')}`;
  } else {
    analysis = `خبر مشبوه — ${signals.join('، ')}`;
  }

  if (signals.length === 0) {
    analysis = 'لا توجد مؤشرات كافية لتقييم الخبر';
  }

  return { quality: score, analysis };
}

// ============================================================
// 4. IMPORTANCE SCORING (Heuristic)
// ============================================================

export function scoreArticle(title: string, snippet: string): number {
  const fullText = [title, snippet].filter(Boolean).join(' ');
  let score = 5;

  const highImpactWords = [
    'حرب', 'صراع', 'كرئيس', 'انتخابات', 'انفجار', 'زلزال', 'كارثة',
    'اتفاقية', 'قمة', 'رسمي', 'قرار', 'إعلان', 'تغيير', 'استقالة',
    'وفاة', 'إصابة', 'تصعيد', 'هدنة', 'حصار', 'غزو', 'تحرير',
    'رئيس جمهورية', 'رئيس وزراء', 'ملك', 'أمير', 'بابا',
    'أمم متحدة', 'حلف شمال الأطلسي', 'ناتو', 'أوبك', 'فلسطين',
    'إسرائيل', 'أمريكا', 'روسيا', 'الصين', 'أوروبا', 'تركيا', 'إيران',
  ];

  const mediumImpactWords = [
    'اقتصاد', 'بورصة', 'أسعار', 'نفط', 'غاز', 'تضخم', 'بطالة',
    'رياضة', 'كأس العالم', 'أولمبياد', 'بطولة', 'نهائي', 'دوري',
    'تكنولوجيا', 'ذكاء اصطناعي', 'إنترنت', 'فضاء', 'اكتشاف',
    'صحة', 'وباء', 'لقاح', 'مستشفى', 'دواء', 'عملية جراحية',
  ];

  let highMatches = 0;
  let mediumMatches = 0;

  for (const word of highImpactWords) {
    if (fullText.includes(word)) highMatches++;
  }
  for (const word of mediumImpactWords) {
    if (fullText.includes(word)) mediumMatches++;
  }

  score += Math.min(highMatches * 1.5, 4);
  score += Math.min(mediumMatches * 0.75, 2);

  const titleHighMatches = highImpactWords.filter(w => title.includes(w)).length;
  if (titleHighMatches > 0) score += 0.5;
  if (title.length < 60 && highMatches > 0) score += 0.5;
  if (fullText.length > 500) score += 0.5;

  return Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;
}

// ============================================================
// 5. RANK ARTICLES (Batch)
// ============================================================

export async function rankArticles(titles: string[]): Promise<number[]> {
  if (titles.length === 0) return [];

  const key = cacheKey(titles.join('|'));
  const cached = rankCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  const scores = titles.map((t) => scoreArticle(t, ''));
  rankCache.set(key, { data: scores, timestamp: Date.now() });
  return scores;
}

// ============================================================
// CACHE MANAGEMENT
// ============================================================

export function clearAllCaches(): void {
  summaryCache.clear();
  qualityCache.clear();
  rankCache.clear();
  aiStatus = null;
  console.log('[AI] All caches cleared');
}

export function getCacheStats(): {
  summaryCacheSize: number;
  qualityCacheSize: number;
  rankCacheSize: number;
  isConfigured: boolean;
} {
  return {
    summaryCacheSize: summaryCache.size,
    qualityCacheSize: qualityCache.size,
    rankCacheSize: rankCache.size,
    isConfigured: !!AI_API_KEY,
  };
}

// ============ INIT ============
if (!AI_API_KEY) {
  console.warn(
    '[AI] ⚠️  OPENROUTER_API_KEY not set.' +
    '\n     AI features will use heuristic fallback mode.' +
    '\n     Get a key: https://openrouter.ai/keys'
  );
} else {
  console.log(
    `[AI] ✅ Configured (${AI_API_KEY.substring(0, 8)}...)` +
    `\n[AI] Model: ${AI_MODEL} (via OpenRouter)` +
    `\n[AI] Endpoint: ${AI_CHAT_URL}`
  );
}
