import { NextRequest, NextResponse } from 'next/server';
import { getCached, setCache, deduplicateArticles, NewsArticle } from '@/lib/utils';
import { prisma } from '@/lib/prisma';
import { rankArticlesByTrending, refreshTrendingScores, getTrendingArticles, TrendingArticle } from '@/lib/trending';

const GNEWS_API_KEY = process.env.GNEWS_API_KEY || 'b72cdb0d6660d4c8f9e1473f412eba10';
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY || 'pub_5c1937c7d1644a008e976e4131a12fe6';

// ============ GET TRENDING NEWS ============
// Combines DB trending scores with fresh external API articles
// Uses the trending algorithm: views*0.25 + clicks*0.35 + shares*0.20 + recency*0.10 + AI*0.10

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10');
    const refresh = searchParams.get('refresh') === 'true';

    // Option to force-refresh trending scores
    if (refresh) {
      await refreshTrendingScores();
    }

    // Check cache first (5 min TTL for trending)
    const cacheKey = `trending-${limit}`;
    const cached = getCached<NewsArticle[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ articles: cached, cached: true });
    }

    // ============ Step 1: Get DB articles with trending scores ============
    let dbTrending: NewsArticle[] = [];
    try {
      // First refresh scores in the background
      const trendingScored = await getTrendingArticles(20);

      dbTrending = trendingScored.map((a: TrendingArticle) => ({
        id: `db-${a.id}`,
        title: a.title,
        snippet: a.snippet,
        url: a.url,
        image: a.image,
        source: a.source,
        favicon: '',
        date: a.date,
        category: a.category,
        importanceScore: a.importanceScore,
        qualityScore: undefined,
        _trendingScore: a.trendingScore,
      }));
    } catch {
      // Database might be empty or not accessible
    }

    // ============ Step 2: Fetch fresh articles from external APIs ============
    const [gnewsResult, newsdataResult] = await Promise.allSettled([
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
    ]);

    const gnews = gnewsResult.status === 'fulfilled' ? gnewsResult.value : [];
    const newsdata = newsdataResult.status === 'fulfilled' ? newsdataResult.value : [];

    // ============ Step 3: Merge and deduplicate ============
    const all = deduplicateArticles([...dbTrending, ...gnews, ...newsdata]);

    // Sort: DB trending articles first (they have scores), then by date
    const sorted = all.sort((a, b) => {
      // Articles with trending scores come first
      const scoreA = (a as any)._trendingScore || 0;
      const scoreB = (b as any)._trendingScore || 0;

      if (scoreA > 0 && scoreB > 0) return scoreB - scoreA;
      if (scoreA > 0) return -1;
      if (scoreB > 0) return 1;

      // No scores: sort by date
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    const final = sorted.slice(0, limit).map(({ _trendingScore, ...article }: any) => article);

    // ============ Step 4: Cache new articles in DB for tracking ============
    try {
      for (const article of sorted.slice(0, 15)) {
        await prisma.article.upsert({
          where: { url: article.url },
          update: {
            title: article.title,
            snippet: article.snippet,
            image: article.image || null,
            source: article.source,
            category: article.category,
            publishedAt: article.date ? new Date(article.date) : new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

    setCache(cacheKey, final);

    return NextResponse.json({
      articles: final,
      totalDB: dbTrending.length,
      totalAPI: gnews.length + newsdata.length,
    });
  } catch (error: any) {
    console.error('Trending news error:', error);
    return NextResponse.json(
      { error: 'فشل في جلب الأخبار العاجلة', articles: [] },
      { status: 500 }
    );
  }
}
