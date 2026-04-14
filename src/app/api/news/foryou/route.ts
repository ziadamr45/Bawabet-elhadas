import { NextRequest, NextResponse } from 'next/server';
import { getCached, setCache, deduplicateArticles, NewsArticle } from '@/lib/utils';

const GNEWS_API_KEY = 'b72cdb0d6660d4c8f9e1473f412eba10';
const NEWSDATA_API_KEY = 'pub_5c1937c7d1644a008e976e4131a12fe6';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const interestsStr = searchParams.get('interests') || '{}';
    const country = searchParams.get('country') || 'eg';
    
    let interests: { clickedCategories: Record<string, number>; clickedSources: Record<string, number> };
    try {
      interests = JSON.parse(interestsStr);
    } catch {
      interests = { clickedCategories: {}, clickedSources: {} };
    }

    // Determine top categories from user interests
    const categoryEntries = Object.entries(interests.clickedCategories || {});
    const topCategories = categoryEntries
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([cat]) => cat);

    // If no interests yet, default to general
    if (topCategories.length === 0) {
      topCategories.push('politics', 'technology', 'sports');
    }

    // Check cache
    const cacheKey = `foryou-${topCategories.join(',')}-${country}`;
    const cached = getCached<NewsArticle[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ articles: cached });
    }

    // Map categories to GNews categories
    const categoryMap: Record<string, string> = {
      home: 'general', trending: 'breaking', politics: 'nation',
      economy: 'business', sports: 'sports', technology: 'technology',
      entertainment: 'entertainment', health: 'health', science: 'science',
      world: 'world', culture: 'entertainment', education: 'nation',
    };

    // Fetch from GNews for each top category
    const fetchPromises = topCategories.map(async (cat) => {
      const gnewsCat = categoryMap[cat] || 'general';
      try {
        const url = `https://gnews.io/api/v4/top-headlines?lang=ar&max=5&category=${gnewsCat}&country=${country}&token=${GNEWS_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.articles || []).map((a: any, i: number) => ({
          id: `gnews-foryou-${cat}-${i}-${Date.now()}`,
          title: a.title || '',
          snippet: a.description || '',
          url: a.url || '',
          image: a.image || '',
          source: a.source?.name || 'GNews',
          favicon: '',
          date: a.publishedAt || '',
          category: cat,
        }));
      } catch {
        return [];
      }
    });

    // Also fetch from NewsData
    const newsdataPromise = (async () => {
      try {
        const url = `https://newsdata.io/api/1/news?language=ar&category=top&country=${country}&apikey=${NEWSDATA_API_KEY}`;
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.results || []).slice(0, 5).map((a: any, i: number) => ({
          id: `newsdata-foryou-${i}-${Date.now()}`,
          title: a.title || '',
          snippet: a.description || '',
          url: a.link || '',
          image: a.image_url || '',
          source: a.source_id || 'NewsData',
          favicon: '',
          date: a.pubDate || '',
          category: topCategories[0] || 'home',
        }));
      } catch {
        return [];
      }
    })();

    const results = await Promise.all([...fetchPromises, newsdataPromise]);
    const allArticles = results.flat();

    // Deduplicate and sort
    const deduplicated = deduplicateArticles(allArticles);
    const sorted = deduplicated.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    }).slice(0, 15);

    // Boost articles from preferred sources
    const preferredSources = Object.keys(interests.clickedSources || {});
    const boosted = sorted.map((article) => {
      const sourceBoost = preferredSources.includes(article.source) ? 2 : 0;
      const categoryBoost = topCategories.includes(article.category) ? 1 : 0;
      return { ...article, _boost: sourceBoost + categoryBoost };
    }).sort((a, b) => b._boost - a._boost);

    const final = boosted.map(({ _boost, ...article }) => article);
    setCache(cacheKey, final);

    return NextResponse.json({ articles: final });
  } catch (error: any) {
    console.error('ForYou error:', error);
    return NextResponse.json({ articles: [], error: 'فشل في جلب الأخبار المخصصة' });
  }
}
