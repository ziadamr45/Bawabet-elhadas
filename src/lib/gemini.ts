// ============================================================
// بوابة الحدث - Google Gemini AI Helper
// Uses Google AI Studio API (Gemini) for AI features
// Works on both local dev and Vercel deployment
// ============================================================

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

// Model configuration
const GEMINI_MODEL = 'gemini-2.0-flash'; // Fast and free tier model
const GEMINI_MODEL_PRO = 'gemini-2.0-flash'; // Using flash for all tasks (cost-effective)

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
  };
}

/**
 * Call Google Gemini API with a simple prompt
 */
async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
  } = {}
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set. Please add it to your environment variables.');
  }

  const { temperature = 0.3, maxTokens = 200 } = options;

  const url = `${GEMINI_BASE_URL}/models/${GEMINI_MODEL_PRO}:generateContent?key=${GEMINI_API_KEY}`;

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

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error (${response.status}): ${errorText}`);
  }

  const data: GeminiResponse = await response.json();

  if (data.error) {
    throw new Error(`Gemini API error: ${data.error.message}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
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
  return !!GEMINI_API_KEY;
}
