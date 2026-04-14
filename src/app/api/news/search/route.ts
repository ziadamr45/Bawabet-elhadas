import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { getCached, setCache, deduplicateArticles, NewsArticle } from '@/lib/utils';

const GNEWS_API_KEY = process.env.GNEWS_API_KEY || 'b72cdb0d6660d4c8f9e1473f412eba10';
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY || 'pub_5c1937c7d1644a008e976e4131a12fe6';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q');

    if (!query || query.trim().length < 2) {
      return NextResponse.json({ articles: [], query: '' });
    }

    // Check cache
    const cacheKey = `search-${query}`;
    const cached = getCached<NewsArticle[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ articles: cached, query });
    }

    // Fetch from all 3 sources in parallel
    const [gnewsResult, newsdataResult, webSearchResult] = await Promise.allSettled([
      // GNews search
      (async () => {
        const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=ar&max=10&token=${GNEWS_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.articles || []).map((a: any, i: number) => ({
          id: `gnews-search-${i}-${Date.now()}`,
          title: a.title || '',
          snippet: a.description || '',
          url: a.url || '',
          image: a.image || '',
          source: a.source?.name || 'GNews',
          favicon: '',
          date: a.publishedAt || '',
          category: 'search',
        }));
      })(),

      // NewsData search
      (async () => {
        const url = `https://newsdata.io/api/1/news?language=ar&q=${encodeURIComponent(query)}&apikey=${NEWSDATA_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).map((a: any, i: number) => ({
          id: `newsdata-search-${i}-${Date.now()}`,
          title: a.title || '',
          snippet: a.description || '',
          url: a.link || '',
          image: a.image_url || '',
          source: a.source_id || 'NewsData',
          favicon: '',
          date: a.pubDate || '',
          category: 'search',
        }));
      })(),

      // Web search
      (async () => {
        const zai = await ZAI.create();
        const result = await zai.functions.invoke('web_search', {
          query: `أخبار ${query}`,
          num: 10,
        });
        if (!Array.isArray(result)) return [];
        return result
          .filter((item: any) => item?.name && item?.url)
          .map((item: any, i: number) => ({
            id: `web-search-${i}-${Date.now()}`,
            title: item.name || '',
            snippet: item.snippet || '',
            url: item.url || '',
            image: '',
            source: item.host_name || '',
            favicon: item.favicon || '',
            date: item.date || '',
            category: 'search',
          }));
      })(),
    ]);

    const gnews = gnewsResult.status === 'fulfilled' ? gnewsResult.value : [];
    const newsdata = newsdataResult.status === 'fulfilled' ? newsdataResult.value : [];
    const websearch = webSearchResult.status === 'fulfilled' ? webSearchResult.value : [];

    // Merge, deduplicate, sort by date
    const all = deduplicateArticles([...gnews, ...newsdata, ...websearch]);
    const sorted = all.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    // Cache results
    setCache(cacheKey, sorted);

    return NextResponse.json({ articles: sorted, query });
  } catch (error: any) {
    console.error('Search error:', error);
    return NextResponse.json(
      { error: 'فشل في البحث', articles: [], query: '' },
      { status: 500 }
    );
  }
}
