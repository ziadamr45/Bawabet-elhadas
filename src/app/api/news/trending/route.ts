import { NextResponse } from 'next/server';
import { getZAI } from '@/lib/zai';
import { getCached, setCache, deduplicateArticles, NewsArticle } from '@/lib/utils';
import { prisma } from '@/lib/prisma';

const GNEWS_API_KEY = process.env.GNEWS_API_KEY || 'b72cdb0d6660d4c8f9e1473f412eba10';
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY || 'pub_5c1937c7d1644a008e976e4131a12fe6';

export async function GET() {
  try {
    // Check cache first
    const cached = getCached<NewsArticle[]>('trending');
    if (cached) {
      return NextResponse.json({ articles: cached });
    }

    // Fetch trending articles from database (most clicked/viewed)
    let dbTrending: NewsArticle[] = [];
    try {
      const trendingArticles = await prisma.article.findMany({
        where: {
          expiresAt: { gte: new Date() },
        },
        orderBy: [
          { clickCount: 'desc' },
          { viewCount: 'desc' },
        ],
        take: 10,
      });

      dbTrending = trendingArticles.map((a) => ({
        id: `db-${a.id}`,
        title: a.title,
        snippet: a.snippet || '',
        url: a.url,
        image: a.image || '',
        source: a.source || '',
        favicon: '',
        date: a.publishedAt?.toISOString() || '',
        category: a.category || 'trending',
        importanceScore: a.importanceScore || undefined,
        qualityScore: a.qualityScore || undefined,
      }));
    } catch {
      // Database might be empty or not accessible
    }

    // Fetch from external APIs in parallel
    const [gnewsResult, newsdataResult, webSearchResult] = await Promise.allSettled([
      // GNews breaking news
      (async () => {
        const url = `https://gnews.io/api/v4/top-headlines?lang=ar&max=10&category=breaking&token=${GNEWS_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.articles || []).map((a: any, i: number) => ({
          id: `gnews-trending-${i}-${Date.now()}`,
          title: a.title || '',
          snippet: a.description || '',
          url: a.url || '',
          image: a.image || '',
          source: a.source?.name || 'GNews',
          favicon: '',
          date: a.publishedAt || '',
          category: 'trending',
        }));
      })(),

      // NewsData breaking news
      (async () => {
        const url = `https://newsdata.io/api/1/news?language=ar&category=top&apikey=${NEWSDATA_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).map((a: any, i: number) => ({
          id: `newsdata-trending-${i}-${Date.now()}`,
          title: a.title || '',
          snippet: a.description || '',
          url: a.link || '',
          image: a.image_url || '',
          source: a.source_id || 'NewsData',
          favicon: '',
          date: a.pubDate || '',
          category: 'trending',
        }));
      })(),

      // Web Search trending
      (async () => {
        const zai = await getZAI();
        const result = await zai.functions.invoke('web_search', { query: 'أخبار عاجلة اليوم', num: 8 });
        if (!Array.isArray(result)) return [];
        return result
          .filter((item: any) => item?.name && item?.url)
          .map((item: any, i: number) => ({
            id: `web-trending-${i}-${Date.now()}`,
            title: item.name || '',
            snippet: item.snippet || '',
            url: item.url || '',
            image: '',
            source: item.host_name || '',
            favicon: item.favicon || '',
            date: item.date || '',
            category: 'trending',
          }));
      })(),
    ]);

    const gnews = gnewsResult.status === 'fulfilled' ? gnewsResult.value : [];
    const newsdata = newsdataResult.status === 'fulfilled' ? newsdataResult.value : [];
    const websearch = webSearchResult.status === 'fulfilled' ? webSearchResult.value : [];

    // Merge DB trending + API results
    const all = deduplicateArticles([...dbTrending, ...gnews, ...newsdata, ...websearch]);
    const sorted = all.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    }).slice(0, 20);

    // Cache articles in database for trending tracking
    try {
      for (const article of sorted.slice(0, 10)) {
        await prisma.article.upsert({
          where: { url: article.url },
          update: {
            title: article.title,
            snippet: article.snippet,
            image: article.image || null,
            source: article.source,
            category: article.category,
            publishedAt: article.date ? new Date(article.date) : new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
          },
          create: {
            url: article.url,
            title: article.title,
            snippet: article.snippet,
            image: article.image || null,
            source: article.source,
            category: article.category,
            publishedAt: article.date ? new Date(article.date) : new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        }).catch(() => {});
      }
    } catch {
      // Ignore cache errors
    }

    setCache('trending', sorted);

    return NextResponse.json({ articles: sorted });
  } catch (error: any) {
    console.error('Trending news error:', error);
    return NextResponse.json(
      { error: 'فشل في جلب الأخبار العاجلة', articles: [] },
      { status: 500 }
    );
  }
}
