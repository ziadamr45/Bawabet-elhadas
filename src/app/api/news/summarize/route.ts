import { NextRequest, NextResponse } from 'next/server';
import { summarizeArticle, verifyArticle, rankArticles, isOllamaAvailable } from '@/lib/ollama';

// ============ AI ENDPOINT (Ollama-Powered) ============
// Handles AI summarization, verification, and importance ranking
// Uses LOCAL Ollama runtime - no API keys, no quotas, works offline

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, snippet, action } = body;

    const articleText = [title, snippet].filter(Boolean).join('\n\n');
    if (!articleText) {
      return NextResponse.json({ error: 'لا يوجد نص للمعالجة' }, { status: 400 });
    }

    // ============ AI SUMMARIZATION ============
    if (action === 'summarize' || (!action && title)) {
      try {
        const summary = await summarizeArticle(title || '', snippet || '');
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
        const result = await verifyArticle(title || '', snippet || '');
        return NextResponse.json({ quality: result.quality, analysis: result.analysis });
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
        const scores = await rankArticles(articles);
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
