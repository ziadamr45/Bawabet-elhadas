import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'home';
    const query = searchParams.get('query') || '';

    const zai = await ZAI.create();

    // Map category to search query
    const categoryQueries: Record<string, string[]> = {
      home: ['أهم الأخبار اليوم 2026', 'آخر المستجدات العالمية'],
      trending: ['أخبار عاجلة اليوم', 'ترند أخبار الآن', 'أهم الأحداث العاجلة'],
      politics: ['أخبار السياسة اليوم', 'آخر التطورات السياسية'],
      economy: ['أخبار الاقتصاد والأعمال اليوم', 'أسواق المال والبورصة'],
      sports: ['أخبار الرياضة اليوم', 'نتائج المباريات والبطولات'],
      technology: ['أخبار التكنولوجيا اليوم', 'جديد التقنية والذكاء الاصطناعي'],
      entertainment: ['أخبار المشاهير والترفيه اليوم', 'آخر أخبار الفن والسينما'],
      health: ['أخبار الصحة والطب اليوم', 'آخر المستجدات الصحية'],
      science: ['أخبار العلوم والاكتشافات', 'آخر الأبحاث العلمية'],
      world: ['أخبار العالم الدولية اليوم', 'آخر المستجدات الدولية'],
      culture: ['أخبار الثقافة والفنون اليوم', 'آخر الأخبار الثقافية'],
      education: ['أخبار التعليم اليوم', 'آخر أخبار الجامعات والمدارس'],
    };

    const searchQuery = query || categoryQueries[category]?.[0] || 'أهم الأخبار اليوم';
    const queries = query ? [query] : (categoryQueries[category] || ['أهم الأخبار اليوم']);

    // Execute multiple searches for comprehensive coverage
    const allResults = await Promise.all(
      queries.map(async (q) => {
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

    // Merge and deduplicate results
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
        id: `news-${category}-${index}-${Date.now()}`,
        title: item.name || '',
        snippet: item.snippet || '',
        url: item.url || '',
        source: item.host_name || '',
        favicon: item.favicon || '',
        date: item.date || '',
        category: category,
      }));

    return NextResponse.json({ articles, category, query: searchQuery });
  } catch (error: any) {
    console.error('News fetch error:', error);
    return NextResponse.json(
      { error: 'فشل في جلب الأخبار', articles: [], category: '', query: '' },
      { status: 500 }
    );
  }
}
