import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ articles: [], query: '' });
    }

    const zai = await ZAI.create();

    // Search with multiple query variations for better results
    const searchQueries = [
      `أخبار ${query}`,
      `${query} آخر الأخبار`,
    ];

    const allResults = await Promise.all(
      searchQueries.map(async (q) => {
        try {
          const result = await zai.functions.invoke('web_search', {
            query: q,
            num: 15,
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
      .map((item: any, index: number) => ({
        id: `search-${index}-${Date.now()}`,
        title: item.name || '',
        snippet: item.snippet || '',
        url: item.url || '',
        source: item.host_name || '',
        favicon: item.favicon || '',
        date: item.date || '',
        category: 'search',
      }));

    return NextResponse.json({ articles, query });
  } catch (error: any) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'فشل في البحث', articles: [], query: '' },
      { status: 500 }
    );
  }
}
