import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { title, snippet } = body;

    if (!title && !snippet) {
      return NextResponse.json({ summary: '' });
    }

    const zai = await ZAI.create();

    const articleText = [title, snippet].filter(Boolean).join('\n\n');

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

    return NextResponse.json({ summary });
  } catch (error: any) {
    console.error('Summarize error:', error);
    return NextResponse.json(
      { error: 'فشل في تلخيص الخبر', summary: '' },
      { status: 500 }
    );
  }
}
