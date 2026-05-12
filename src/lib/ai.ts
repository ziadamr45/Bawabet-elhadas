// ============================================================
// بوابة الحدث - AI System (OpenRouter)
// Production-ready AI inference via OpenRouter API
// Supports multiple models with automatic fallback
// ============================================================

// ============ CONFIGURATION ============
const AI_API_KEY = process.env.OPENROUTER_API_KEY || '';

// OpenRouter endpoint (OpenAI-compatible chat completions)
const AI_CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Primary model: Gemini 2.0 Flash (fast, excellent Arabic support)
const AI_MODEL = process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001';

// Fallback models if primary is unavailable (e.g. region-blocked)
const FALLBACK_MODELS = [
  'deepseek/deepseek-chat',
  'deepseek/deepseek-chat-v3-0324',
  'qwen/qwen3-14b',
  'google/gemma-4-31b-it',
];

// App info for OpenRouter headers
const APP_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000';
const APP_NAME = 'بوابة الحدث - Bawabet Elhadas';

// ============ TIMEOUTS & RATE LIMITS ============
const API_TIMEOUT_MS = 30_000;         // 30s
const MAX_RETRIES = 1;                 // 1 retry on failure
const RETRY_DELAY_MS = 2_000;          // 2s between retries
const RATE_LIMIT_DELAY_MS = 500;       // 500ms between calls
const MAX_CONCURRENT_REQUESTS = 3;     // Max parallel calls

// Track which model actually works (auto-detect on first call)
let workingModel: string | null = null;
let modelCheckTime = 0;
const MODEL_CHECK_INTERVAL = 10 * 60 * 1000; // Re-check every 10 min

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
 * Call OpenRouter API with a specific model
 */
async function callAIWithModel(
  model: string,
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
        model,
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
        // Region block or auth error — signal to try fallback model
        throw new Error(`MODEL_UNAVAILABLE:${model}:${errorData.error?.message || response.status}`);
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
      `[AI] Response OK (${model}): ${content.length} chars, ` +
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
 * Call AI with automatic model fallback.
 * Tries primary model first, then falls back to alternatives if blocked.
 */
async function callAI(
  systemPrompt: string,
  userMessage: string,
  maxTokens: number = 2048,
  temperature: number = 0.3
): Promise<string> {
  // If we already know a working model, use it directly
  if (workingModel && Date.now() - modelCheckTime < MODEL_CHECK_INTERVAL) {
    return callAIWithModel(workingModel, systemPrompt, userMessage, maxTokens, temperature);
  }

  // Try primary model first, then fallbacks
  const modelsToTry = [AI_MODEL, ...FALLBACK_MODELS.filter(m => m !== AI_MODEL)];

  for (const model of modelsToTry) {
    try {
      const result = await callAIWithModel(model, systemPrompt, userMessage, maxTokens, temperature);
      // This model works! Remember it
      workingModel = model;
      modelCheckTime = Date.now();
      console.log(`[AI] ✅ Using model: ${model}`);
      return result;
    } catch (error: any) {
      if (error.message?.startsWith('MODEL_UNAVAILABLE:')) {
        console.warn(`[AI] ⚠️ Model ${model} unavailable, trying fallback...`);
        continue; // Try next model
      }
      // For other errors (timeout, rate limit), don't try other models
      throw error;
    }
  }

  throw new Error('All AI models unavailable. Check your OpenRouter account and region.');
}

/**
 * Call with retry logic (retries with the same model)
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

      // Don't retry these
      if (error.message?.includes('402') || error.message?.includes('All AI models unavailable')) {
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

  // Try to find a working model
  const modelsToTry = [AI_MODEL, ...FALLBACK_MODELS.filter(m => m !== AI_MODEL)];

  for (const model of modelsToTry) {
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
          model,
          messages: [{ role: 'user', content: 'مرحبا' }],
          max_tokens: 10,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.ok) {
        workingModel = model;
        modelCheckTime = Date.now();
        aiStatus = { available: true, checkedAt: Date.now() };
        console.log(`[AI] ✅ Available model found: ${model}`);
        return true;
      }

      // If 401/403 (region block), try next model
      if (response.status === 401 || response.status === 403) {
        continue;
      }

      // Other errors (429, 402, etc.)
      aiStatus = { available: false, checkedAt: Date.now() };
      return false;
    } catch {
      continue;
    }
  }

  aiStatus = { available: false, checkedAt: Date.now() };
  return false;
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
      'أنت مساعد متخصص في تلخيص الأخبار باللغة العربية. قواعدك:\n- لخّص الخبر في 2-3 جمل مختصرة وواضحة فقط\n- لا تضف عناوين أو مقدمات أو خاتمة\n- ابدأ الملخص مباشرة بدون أي كلمات استهلالية\n- حافظ على الحقائق والأرقام المذكورة في الخبر\n- استخدم لغة عربية فصحى بسيطة\n- لا تكرر النص الأصلي، بل أعد صياغته بشكل مختصر',
      `لخّص الخبر التالي:\n\n${articleText}`,
      2048,
      0.3
    );

    // Clean up: remove any unwanted prefixes or thinking artifacts
    const cleaned = summary
      .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '')
      .replace(/Thinking Process:[\s\S]*?(?=\n\n|\n[A-Zأ-ي])/gi, '')
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
 */
export function detectQuality(title: string, snippet: string): { quality: number; analysis: string } {
  const fullText = [title, snippet].filter(Boolean).join(' ');

  let score = 5;
  const signals: string[] = [];

  // ===== POSITIVE SIGNALS =====
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

  const numberCount = (fullText.match(/\d+/g) || []).length;
  if (numberCount >= 5) {
    score += 1.5;
    signals.push('أرقام وإحصائيات كثيرة');
  } else if (numberCount >= 2) {
    score += 1;
    signals.push('يحتوي أرقام وتواريخ');
  }

  const quoteCount = (fullText.match(/[""«»"']/g) || []).length;
  if (quoteCount >= 4) {
    score += 1.5;
    signals.push('اقتباسات متعددة');
  } else if (quoteCount >= 2) {
    score += 0.5;
    signals.push('اقتباسات');
  }

  const locations = (fullText.match(/\b(مصر|السعودية|الإمارات|القاهرة|رياض|دبي|واشنطن|لندن|باريس|بغداد|بيروت|طرابلس|الخرطوم|دمشق|عمان|الدوحة|المنامة|الكويت|الرباط|الجزائر|تونس|نيويورك|طوكيو|موسكو|برلين)\b/gi) || []).length;
  if (locations >= 2) {
    score += 1;
    signals.push('مواقع جغرافية متعددة');
  } else if (locations >= 1) {
    score += 0.5;
    signals.push('يحتوي موقع جغرافي');
  }

  const officials = (fullText.match(/\b(رئيس|وزير|سفير|محافظ|حكومة|برلمان|جامعة|وزارة|مجلس|قيادي|مسؤول|الرئاسة|مجلس الوزراء)\b/gi) || []).length;
  if (officials >= 2) {
    score += 1;
    signals.push('جهات رسمية متعددة');
  } else if (officials >= 1) {
    score += 0.5;
    signals.push('جهة رسمية');
  }

  if (/أفاد|قال|أوضح|أكد|صرح|أعلن|بيان|مصدر|وفقاً|حسب/i.test(fullText)) {
    score += 1;
    signals.push('ينسب لمصدر محدد');
  }

  // ===== NEGATIVE SIGNALS =====
  const clickbaitWords = ['صادم', 'لن تصدق', 'بعد شبه', 'سر', 'الحقيقة الكاملة', 'عاجل جداً', 'ممنوع النشر', 'لأول مرة', 'شاهد الفيديو', 'قبل الحذف', 'سيجعلك تبكي', 'ما حد يتوقعه'];
  const clickbaitCount = clickbaitWords.filter(w => fullText.includes(w)).length;
  if (clickbaitCount >= 2) {
    score -= 3;
    signals.push('عبارات استقطابية متعددة');
  } else if (clickbaitCount >= 1) {
    score -= 1.5;
    signals.push('عبارات استقطابية');
  }

  const exclamations = (fullText.match(/[!؟]{2,}/g) || []).length;
  if (exclamations >= 3) {
    score -= 1.5;
    signals.push('علامات تعجب مفرطة');
  } else if (exclamations >= 1) {
    score -= 0.5;
  }

  if (/[A-Z]{5,}/.test(fullText)) {
    score -= 0.5;
    signals.push('حروف كبيرة');
  }

  const emojiCount = (fullText.match(/[❗❓🔥💥⚡🎉😡😭🚨🆘]/g) || []).length;
  if (emojiCount > 2) {
    score -= 1;
    signals.push('رموز تعبيرية مفرطة');
  }

  const credibleSources = ['رويترز', 'ألمانيا', 'فرانس برس', 'سي إن إن', 'BBC', 'الأهرام', 'الجزيرة', 'المصري اليوم', 'الوفد', 'اليوم السابع'];
  for (const src of credibleSources) {
    if (fullText.includes(src)) {
      score += 1;
      signals.push(`مصدر موثوق (${src})`);
      break;
    }
  }

  score = Math.round(Math.min(10, Math.max(1, score)) * 10) / 10;

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
// 5. TRANSLATION (AI-Powered)
// ============================================================

/**
 * Translate non-Arabic text to Arabic using AI.
 */
export async function translateToArabic(text: string, sourceLang: string = 'en'): Promise<string> {
  if (!text || !text.trim()) return text;

  // Check if text is already Arabic
  const arabicRatio = (text.match(/[\u0600-\u06FF]/g) || []).length / text.length;
  if (arabicRatio > 0.3) return text; // Already mostly Arabic

  const key = cacheKey('translate:' + text);
  const cached = summaryCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  if (!AI_API_KEY) return text;

  try {
    const translated = await callWithRetry(
      'أنت مترجم محترف. ترجم النص التالي إلى اللغة العربية فقط. أعد الصياغة بشكل طبيعي واحترافي. لا تضف أي تعليقات أو مقدمات.',
      text,
      2048,
      0.3
    );

    const cleaned = translated
      .replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '')
      .trim();

    const result = cleaned || text;
    summaryCache.set(key, { data: result, timestamp: Date.now() });
    return result;
  } catch (error: any) {
    console.error('[AI] Translation failed:', error.message);
    return text;
  }
}

// ============================================================
// 6. NEWS GROUPING (AI-Powered)
// ============================================================

/**
 * Group similar articles from different sources into one story.
 * Uses AI to detect if articles cover the same event.
 */
export async function groupSimilarArticles(
  articles: Array<{ title: string; url: string; source: string }>
): Promise<GroupResult[]> {
  if (articles.length <= 1) {
    return articles.map(a => ({ mainTitle: a.title, articles: [{ source: a.source, url: a.url }] }));
  }

  // Heuristic grouping first (fast, no API call)
  const heuristicGroups = heuristicGroupArticles(articles);

  // If we have AI, try to refine groups
  if (!AI_API_KEY || articles.length < 3) {
    return heuristicGroups;
  }

  try {
    // Take top 10 articles max for AI grouping (cost control)
    const topArticles = articles.slice(0, 10);
    const titlesList = topArticles.map((a, i) => `${i + 1}. [${a.source}] ${a.title}`).join('\n');

    const aiResponse = await callWithRetry(
      'أنت محرر أخبار محترف. عندك قائمة عناوين أخبار من مصادر مختلفة. حدد الأخبار اللي بتتكلم عن نفس الحدث وأعطني أرقامها معاً.\n\nأجب بالصيغة دي فقط:\nمجموعة 1: أرقام العناوين (مفصولة بفواصل)\nمجموعة 2: أرقام العناوين (مفصولة بفواصل)\n...\n\nلو خبر مافيش زيه، سيبه لوحده. كل عنوان لازم يكون في مجموعة واحدة بس.',
      `العناوين:\n${titlesList}`,
      1024,
      0.2
    );

    return parseGroupingResponse(aiResponse, topArticles, heuristicGroups);
  } catch (error: any) {
    console.error('[AI] Grouping failed:', error.message);
    return heuristicGroups;
  }
}

/**
 * Heuristic grouping: group articles by similar titles (no API call)
 */
type GroupResult = { mainTitle: string; articles: Array<{ source: string; url: string }> };

function heuristicGroupArticles(
  articles: Array<{ title: string; url: string; source: string }>
): GroupResult[] {
  const groups: Array<{ mainTitle: string; articles: Array<{ source: string; url: string }>; key: string }> = [];
  const used = new Set<number>();

  for (let i = 0; i < articles.length; i++) {
    if (used.has(i)) continue;

    const group = {
      mainTitle: articles[i].title,
      articles: [{ source: articles[i].source, url: articles[i].url }],
      key: normalizeForComparison(articles[i].title),
    };

    for (let j = i + 1; j < articles.length; j++) {
      if (used.has(j)) continue;
      const similarity = titleSimilarity(articles[i].title, articles[j].title);
      if (similarity > 0.4) {
        group.articles.push({ source: articles[j].source, url: articles[j].url });
        used.add(j);
      }
    }

    groups.push(group);
    used.add(i);
  }

  return groups.map(({ mainTitle, articles }) => ({ mainTitle, articles }));
}

/**
 * Calculate title similarity (0-1) using word overlap
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normalizeForComparison(a).split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(normalizeForComparison(b).split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  return intersection / Math.min(wordsA.size, wordsB.size);
}

/**
 * Normalize Arabic text for comparison
 */
function normalizeForComparison(text: string): string {
  return text
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '') // Remove tashkeel
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Parse AI grouping response
 */
function parseGroupingResponse(
  response: string,
  articles: Array<{ title: string; url: string; source: string }>,
  fallback: GroupResult[]
): GroupResult[] {
  try {
    const groups: Array<{ mainTitle: string; articles: Array<{ source: string; url: string }> }> = [];
    const usedIndices = new Set<number>();

    // Parse "مجموعة N: 1, 3, 5" patterns
    const groupMatches = Array.from(response.matchAll(/مجموعة\s*\d+\s*[:：]\s*([\d,\s]+)/g));

    for (const match of groupMatches) {
      const indices = match[1]
        .split(/[,\s]+/)
        .map(n => parseInt(n.trim()) - 1)
        .filter(n => n >= 0 && n < articles.length);

      if (indices.length === 0) continue;

      const groupArticles = indices
        .filter(i => !usedIndices.has(i))
        .map(i => {
          usedIndices.add(i);
          return { source: articles[i].source, url: articles[i].url };
        });

      if (groupArticles.length > 0) {
        // Use the first article's title as main title
        const mainIdx = indices[0];
        groups.push({
          mainTitle: articles[mainIdx].title,
          articles: groupArticles,
        });
      }
    }

    // Add ungrouped articles
    for (let i = 0; i < articles.length; i++) {
      if (!usedIndices.has(i)) {
        groups.push({
          mainTitle: articles[i].title,
          articles: [{ source: articles[i].source, url: articles[i].url }],
        });
      }
    }

    return groups.length > 0 ? groups : fallback;
  } catch {
    return fallback;
  }
}

// ============================================================
// 7. RANK ARTICLES (Batch)
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
  workingModel = null;
  console.log('[AI] All caches cleared');
}

export function getCacheStats(): {
  summaryCacheSize: number;
  qualityCacheSize: number;
  rankCacheSize: number;
  isConfigured: boolean;
  activeModel: string | null;
} {
  return {
    summaryCacheSize: summaryCache.size,
    qualityCacheSize: qualityCache.size,
    rankCacheSize: rankCache.size,
    isConfigured: !!AI_API_KEY,
    activeModel: workingModel,
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
    `\n[AI] Primary model: ${AI_MODEL} (via OpenRouter)` +
    `\n[AI] Fallbacks: ${FALLBACK_MODELS.join(', ')}` +
    `\n[AI] Endpoint: ${AI_CHAT_URL}`
  );
}
