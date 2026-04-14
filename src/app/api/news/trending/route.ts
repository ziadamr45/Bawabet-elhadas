import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function GET() {
  try {
    const zai = await ZAI.create();

    // Multiple trending searches for comprehensive coverage
    const trendingQueries = [
      'أخبار عاجلة اليوم',
      'ترند أخبار الآن',
      'أهم الأحداث العاجلة اليوم',
      'أخبار ساخنة',
    ];

    const allResults = await Promise.all(
      trendingQueries.map(async (q) => {
        try {
          const result = await zai.functions.invoke('web_search', {
            query: q,
            num: 10,
          });
          return Array.isArray(result) ? result : [];
        } catch {
          return [];
        }
      })
    );

    // Merge and deduplicate
    const seen = new Set<string>();
    const articles = allResults
      .flat()
      .filter((item: any) => {
        if (!item?.name || !item?.url) return false;
        const key = item.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 20)
      .map((item: any, index: number) => ({
        id: `trending-${index}-${Date.now()}`,
        title: item.name || '',
        snippet: item.snippet || '',
        url: item.url || '',
        source: item.host_name || '',
        favicon: item.favicon || '',
        date: item.date || '',
        category: 'trending',
      }));

    return NextResponse.json({ articles });
  } catch (error: any) {
    console.error('Trending news error:', error);
    return NextResponse.json(
      { error: 'فشل في جلب الأخبار العاجلة', articles: [] },
      { status: 500 }
    );
  }
}
