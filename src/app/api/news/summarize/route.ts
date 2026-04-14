import { NextRequest, NextResponse } from 'next/server';
import { getZAI } from '@/lib/zai';

// ============ ROBUST AI ENDPOINT ============
// This endpoint handles AI summarization, verification, and importance ranking.
// It uses the z-ai-web-dev-sdk with comprehensive error handling for Vercel compatibility.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, snippet, action } = body;

    const articleText = [title, snippet].filter(Boolean).join('\n\n');
    if (!articleText) {
      return NextResponse.json({ error: 'لا يوجد نص للمعالجة' }, { status: 400 });
    }

    // ============ GET ZAI INSTANCE ============
    let zai: any;
    try {
      zai = await getZAI();
    } catch (initError: any) {
      console.error('Z-AI SDK init error:', initError.message);
      return NextResponse.json(
        { error: 'خدمة الذكاء الاصطناعي غير متاحة حالياً', details: initError.message },
        { status: 503 }
      );
    }

    // ============ AI SUMMARIZATION ============
    if (action === 'summarize' || (!action && title)) {
      try {
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت مساعد متخصص في تلخيص الأخبار باللغة العربية. قم بتلخيص الخبر التالي بشكل مختصر وشامل في 2-3 جمل فقط. ابدأ التلخيص مباشرة بدون مقدمات.',
            },
            {
              role: 'user',
              content: `لخص هذا الخبر: ${articleText}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 200,
        });

        const summary = completion.choices?.[0]?.message?.content || '';
        if (!summary) {
          return NextResponse.json({ error: 'لم يتم إنشاء تلخيص', summary: '' });
        }
        return NextResponse.json({ summary });
      } catch (aiError: any) {
        console.error('AI summarization error:', aiError.message);
        return NextResponse.json(
          { error: 'فشل في إنشاء التلخيص', details: aiError.message },
          { status: 500 }
        );
      }
    }

    // ============ FAKE NEWS DETECTION ============
    if (action === 'verify') {
      try {
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت محلل أخبار متخصص في كشف الأخبار المضللة والمزيفة. حلل الخبر التالي وأعطِ:\n1. درجة موثوقية من 1-10 (10 = موثوق تماماً، 1 = مزيف)\n2. تحليل مختصر في جملة واحدة\nأجب بالصيغة: الرقم|التحليل\nمثال: 7|الخبر من مصدر معروف لكن يفتقر لتفاصيل محددة',
            },
            {
              role: 'user',
              content: `حلل هذا الخبر: ${articleText}`,
            },
          ],
          temperature: 0.2,
          max_tokens: 100,
        });

        const response = completion.choices?.[0]?.message?.content || '5|لم يتم التحليل';
        const [scoreStr, analysis] = response.split('|');
        const quality = parseInt(scoreStr.trim()) || 5;

        return NextResponse.json({ quality, analysis: analysis?.trim() || '' });
      } catch (aiError: any) {
        console.error('AI verification error:', aiError.message);
        return NextResponse.json(
          { error: 'فشل في التحقق من الخبر', details: aiError.message },
          { status: 500 }
        );
      }
    }

    // ============ IMPORTANCE RANKING ============
    if (action === 'rank') {
      const articles = body.articles as string[];
      if (!articles || articles.length === 0) {
        return NextResponse.json({ scores: [] });
      }

      try {
        const titlesText = articles.map((t: string, i: number) => `${i + 1}. ${t}`).join('\n');

        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت نظام تقييم أخبار. قم بتقييم أهمية كل خبر من 1 إلى 10 (10 = مهم جداً). أجب فقط بالأرقام مفصولة بفواصل. مثال: 8,5,9,3,7',
            },
            {
              role: 'user',
              content: `قيّم أهمية هذه الأخبار من 1-10:\n${titlesText}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 100,
        });

        const scoresText = completion.choices?.[0]?.message?.content || '';
        const scores = scoresText.split(/[,\s]+/).map(Number).filter((n: number) => !isNaN(n) && n >= 1 && n <= 10);

        return NextResponse.json({ scores });
      } catch (aiError: any) {
        console.error('AI ranking error:', aiError.message);
        return NextResponse.json(
          { error: 'فشل في التقييم', details: aiError.message },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ error: 'إجراء غير معروف' }, { status: 400 });
  } catch (error: any) {
    console.error('AI endpoint error:', error);
    return NextResponse.json(
      { error: 'حدث خطأ في المعالجة', details: error.message },
      { status: 500 }
    );
  }
}
