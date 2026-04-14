import { NextRequest, NextResponse } from 'next/server';
import { CATEGORIES, deduplicateArticles, getCached, setCache, NewsArticle } from '@/lib/utils';
import { prisma } from '@/lib/prisma';
import { isHuggingFaceAvailable, rankArticles } from '@/lib/huggingface';

// ============ API KEYS ============
const GNEWS_API_KEY = process.env.GNEWS_API_KEY || 'b72cdb0d6660d4c8f9e1473f412eba10';
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY || 'pub_5c1937c7d1644a008e976e4131a12fe6';

// ============ SOURCE 1: GNews API ============
async function fetchGNews(category: string, country: string, searchQuery?: string): Promise<NewsArticle[]> {
  const cat = CATEGORIES.find((c) => c.id === category);
  const gnewsCategory = cat?.gnewsCategory || 'general';
  
  let url = `https://gnews.io/api/v4/top-headlines?lang=ar&max=10&token=${GNEWS_API_KEY}`;
  
  if (searchQuery) {
    url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(searchQuery)}&lang=ar&max=10&token=${GNEWS_API_KEY}`;
  } else {
    if (gnewsCategory && gnewsCategory !== 'general') url += `&category=${gnewsCategory}`;
    if (country && country !== 'all') url += `&country=${country}`;
  }

  try {
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) return [];
    const data = await response.json();
    
    return (data.articles || []).map((article: any, i: number) => ({
      id: `gnews-${category}-${i}-${Date.now()}`,
      title: article.title || '',
      snippet: article.description || article.content || '',
      url: article.url || '',
      image: article.image || '',
      source: article.source?.name || 'GNews',
      favicon: '',
      date: article.publishedAt || '',
      category,
      importanceScore: undefined,
      qualityScore: undefined,
    }));
  } catch (error) {
    console.error('GNews fetch error:', error);
    return [];
  }
}

// ============ SOURCE 2: NewsData.io ============
async function fetchNewsData(category: string, country: string, searchQuery?: string): Promise<NewsArticle[]> {
  const cat = CATEGORIES.find((c) => c.id === category);
  const newsdataCategory = cat?.newsdataCategory || 'top';
  
  let url = `https://newsdata.io/api/1/news?language=ar&apikey=${NEWSDATA_API_KEY}`;
  
  if (searchQuery) {
    url += `&q=${encodeURIComponent(searchQuery)}`;
  } else {
    if (newsdataCategory) url += `&category=${newsdataCategory}`;
    if (country && country !== 'all') url += `&country=${country}`;
  }

  try {
    const response = await fetch(url, { next: { revalidate: 300 } });
    if (!response.ok) return [];
    const data = await response.json();
    
    return (data.results || []).map((article: any, i: number) => ({
      id: `newsdata-${category}-${i}-${Date.now()}`,
      title: article.title || '',
      snippet: article.description || '',
      url: article.link || '',
      image: article.image_url || article.image || '',
      source: article.source_id || 'NewsData',
      favicon: '',
      date: article.pubDate || '',
      category,
      importanceScore: undefined,
      qualityScore: undefined,
    }));
  } catch (error) {
    console.error('NewsData fetch error:', error);
    return [];
  }
}

// ============ MAIN HANDLER ============
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || 'home';
    const country = searchParams.get('country') || 'eg';
    const search = searchParams.get('search') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const aiEnhance = searchParams.get('ai') === 'true';

    // Check cache first
    const cacheKey = `news-${category}-${country}-${search}-${page}`;
    const cached = getCached<NewsArticle[]>(cacheKey);
    if (cached) {
      return NextResponse.json({ articles: cached, category, country, page, cached: true });
    }

    // ============ PARALLEL FETCHING FROM 2 SOURCES ============
    const [gnewsArticles, newsdataArticles] = await Promise.allSettled([
      fetchGNews(category, country, search || undefined),
      fetchNewsData(category, country, search || undefined),
    ]);

    // Extract results
    const gnews = gnewsArticles.status === 'fulfilled' ? gnewsArticles.value : [];
    const newsdata = newsdataArticles.status === 'fulfilled' ? newsdataArticles.value : [];

    // ============ MERGE ALL ARTICLES ============
    const allArticles = [...gnews, ...newsdata];

    // ============ DEDUPLICATION ============
    const deduplicated = deduplicateArticles(allArticles);

    // ============ SORT BY DATE (latest first) ============
    const sorted = deduplicated.sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

    // ============ PAGINATION ============
    const pageSize = 20;
    const start = (page - 1) * pageSize;
    const paginated = sorted.slice(start, start + pageSize);

    // ============ AI ENHANCEMENT (optional, for importance scoring) ============
    let enhanced = paginated;
    if (aiEnhance && paginated.length > 0) {
      try {
        const available = await isHuggingFaceAvailable();
        if (available) {
          const topArticles = paginated.slice(0, 5);
          const titles = topArticles.map((a) => a.title);
          const scores = await rankArticles(titles);
          
          enhanced = paginated.map((article, i) => ({
            ...article,
            importanceScore: i < scores.length ? scores[i] : undefined,
          }));
        }
      } catch {
        // AI enhancement failed, return without scores
      }
    }

    // ============ CACHE RESULTS ============
    setCache(cacheKey, enhanced);

    // ============ CACHE ARTICLES IN DATABASE FOR TRENDING ============
    try {
      for (const article of enhanced.slice(0, 15)) {
        await prisma.article.upsert({
          where: { url: article.url },
          update: {
            title: article.title,
            snippet: article.snippet,
            image: article.image || null,
            source: article.source,
            category: article.category,
            country: country,
            publishedAt: article.date ? new Date(article.date) : new Date(),
            importanceScore: article.importanceScore || null,
            qualityScore: article.qualityScore || null,
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          },
          create: {
            url: article.url,
            title: article.title,
            snippet: article.snippet,
            image: article.image || null,
            source: article.source,
            category: article.category,
            country: country,
            publishedAt: article.date ? new Date(article.date) : new Date(),
            importanceScore: article.importanceScore || null,
            qualityScore: article.qualityScore || null,
            expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
          },
        }).catch(() => {});
      }
    } catch {
      // Ignore DB cache errors
    }

    return NextResponse.json({
      articles: enhanced,
      category,
      country,
      page,
      totalResults: sorted.length,
      sources: {
        gnews: gnews.length,
        newsdata: newsdata.length,
      },
    });
  } catch (error: any) {
    console.error('News fetch error:', error);
    return NextResponse.json(
      { error: 'فشل في جلب الأخبار', articles: [], category: '', country: '', page: 1 },
      { status: 500 }
    );
  }
}
