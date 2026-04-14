// ============================================================
// بوابة الحدث - Google Gemini AI Helper
// Uses Google AI Studio API (Gemini) for AI features
// DEBUG MODE: Full logging for troubleshooting
// ============================================================

const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_MODEL = 'gemini-2.0-flash'; // Confirmed working model

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}

/**
 * Get the Gemini API key at runtime (not at module load time)
 */
function getApiKey(): string {
  return process.env.GEMINI_API_KEY || '';
}

/**
 * Call Google Gemini API with a simple prompt
 * FULL DEBUG LOGGING
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  const apiKey = getApiKey();

  // ============ DEBUG 1: Check API Key ============
  console.log('========================================');
  console.log('[Gemini DEBUG] API Key present:', !!apiKey);
  console.log('[Gemini DEBUG] API Key length:', apiKey.length);
  console.log('[Gemini DEBUG] API Key prefix:', apiKey.substring(0, 10) + '...');
  console.log('[Gemini DEBUG] Model:', GEMINI_MODEL);

  if (!apiKey) {
    console.error('[Gemini DEBUG] ERROR: GEMINI_API_KEY is empty!');
    throw new Error('GEMINI_API_KEY is not set. Please add it to your environment variables.');
  }

  const { temperature = 0.3, maxTokens = 200 } = options;

  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

  // ============ DEBUG 2: Log the request ============
  console.log('[Gemini DEBUG] Request URL:', `${GEMINI_BASE_URL}/models/${GEMINI_MODEL}:generateContent?key=${apiKey.substring(0, 10)}...`);
  console.log('[Gemini DEBUG] Temperature:', temperature);
  console.log('[Gemini DEBUG] MaxTokens:', maxTokens);

  const body = {
    system_instruction: {
      parts: [{ text: systemPrompt }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      temperature,
      maxOutputTokens: maxTokens,
      topP: 0.95,
      topK: 40,
    },
  };

  console.log('[Gemini DEBUG] Sending request...');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (fetchError: any) {
    console.error('[Gemini DEBUG] Fetch FAILED (network error):', fetchError.message);
    throw new Error(`Gemini fetch failed: ${fetchError.message}`);
  }

  // ============ DEBUG 3: Log response status ============
  console.log('[Gemini DEBUG] Response status:', response.status, response.statusText);
  console.log('[Gemini DEBUG] Response headers:', Object.fromEntries(response.headers.entries()));

  // Read the raw body text
  const rawBody = await response.text();

  // ============ DEBUG 4: Log full response body ============
  console.log('[Gemini DEBUG] Response body (raw):', rawBody);

  if (!response.ok) {
    console.error('[Gemini DEBUG] ERROR: HTTP', response.status);
    console.error('[Gemini DEBUG] Error body:', rawBody);

    // Check for specific error codes
    if (response.status === 400) {
      console.error('[Gemini DEBUG] 400 Bad Request - likely malformed request body or wrong model name');
    } else if (response.status === 403) {
      console.error('[Gemini DEBUG] 403 Forbidden - API key invalid or lacks permission');
    } else if (response.status === 404) {
      console.error('[Gemini DEBUG] 404 Not Found - model name might be wrong. Try gemini-2.0-flash or gemini-pro');
    } else if (response.status === 429) {
      console.error('[Gemini DEBUG] 429 Rate Limited / Quota Exceeded - free tier limit reached or billing not enabled');
    }

    throw new Error(`Gemini API error (${response.status}): ${rawBody}`);
  }

  // Parse JSON from raw body
  let data: GeminiResponse;
  try {
    data = JSON.parse(rawBody);
  } catch (parseError: any) {
    console.error('[Gemini DEBUG] JSON parse error:', parseError.message);
    console.error('[Gemini DEBUG] Raw body was:', rawBody);
    throw new Error(`Gemini response parse error: ${parseError.message}`);
  }

  // ============ DEBUG 5: Check for API-level errors ============
  if (data.error) {
    console.error('[Gemini DEBUG] API error in response:', JSON.stringify(data.error, null, 2));
    throw new Error(`Gemini API error [${data.error.code} ${data.error.status}]: ${data.error.message}`);
  }

  // ============ DEBUG 6: Check candidates ============
  console.log('[Gemini DEBUG] Candidates count:', data.candidates?.length || 0);
  console.log('[Gemini DEBUG] Finish reason:', data.candidates?.[0]?.finishReason);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  console.log('[Gemini DEBUG] Response text length:', text.length);
  console.log('[Gemini DEBUG] Response text preview:', text.substring(0, 100));
  console.log('========================================');

  return text.trim();
}

/**
 * Summarize an Arabic news article (2-3 sentences)
 */
export async function summarizeArticle(title: string, snippet: string): Promise<string> {
  const articleText = [title, snippet].filter(Boolean).join('\n\n');

  const summary = await callGemini(
    'أنت مساعد متخصص في تلخيص الأخبار باللغة العربية. قم بتلخيص الخبر التالي بشكل مختصر وشامل في 2-3 جمل فقط. ابدأ التلخيص مباشرة بدون مقدمات أو عناوين.',
    `لخص هذا الخبر: ${articleText}`,
    { temperature: 0.3, maxTokens: 200 }
  );

  return summary;
}

/**
 * Verify news reliability (fake news detection)
 * Returns quality score (1-10) and analysis
 */
export async function verifyArticle(title: string, snippet: string): Promise<{ quality: number; analysis: string }> {
  const articleText = [title, snippet].filter(Boolean).join('\n\n');

  const response = await callGemini(
    'أنت محلل أخبار متخصص في كشف الأخبار المضللة والمزيفة. حلل الخبر التالي وأعطِ:\n1. درجة موثوقية من 1-10 (10 = موثوق تماماً، 1 = مزيف)\n2. تحليل مختصر في جملة واحدة\nأجب بالصيغة: الرقم|التحليل\nمثال: 7|الخبر من مصدر معروف لكن يفتقر لتفاصيل محددة',
    `حلل هذا الخبر: ${articleText}`,
    { temperature: 0.2, maxTokens: 100 }
  );

  const [scoreStr, analysis] = response.split('|');
  const quality = parseInt(scoreStr.trim()) || 5;

  return { quality, analysis: analysis?.trim() || '' };
}

/**
 * Rank articles by importance (1-10 scores)
 */
export async function rankArticles(titles: string[]): Promise<number[]> {
  if (titles.length === 0) return [];

  const titlesText = titles.map((t, i) => `${i + 1}. ${t}`).join('\n');

  const response = await callGemini(
    'أنت نظام تقييم أخبار. قم بتقييم أهمية كل خبر من 1 إلى 10 (10 = مهم جداً). أجب فقط بالأرقام مفصولة بفواصل. مثال: 8,5,9,3,7',
    `قيّم أهمية هذه الأخبار من 1-10:\n${titlesText}`,
    { temperature: 0.1, maxTokens: 100 }
  );

  const scores = response
    .split(/[,\s]+/)
    .map(Number)
    .filter((n) => !isNaN(n) && n >= 1 && n <= 10);

  return scores;
}

/**
 * Check if Gemini API is configured
 */
export function isGeminiConfigured(): boolean {
  return !!getApiKey();
}
