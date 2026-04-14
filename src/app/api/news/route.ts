import { NextRequest, NextResponse } from 'next/server';
import ZAI from 'z-ai-web-dev-sdk';
import { CATEGORIES, deduplicateArticles, getCached, setCache, generateId, NewsArticle } from '@/lib/utils';

// ============ API KEYS ============
const GNEWS_API_KEY = 'b72cdb0d6660d4c8f9e1473f412eba10';
const NEWSDATA_API_KEY = 'pub_5c1937c7d1644a008e976e4131a12fe6';

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

// ============ SOURCE 3: Web Search (Z-AI) ============
async function fetchWebSearch(category: string, searchQuery?: string): Promise<NewsArticle[]> {
  try {
    const zai = await ZAI.create();
    const cat = CATEGORIES.find((c) => c.id === category);
    const query = searchQuery || cat?.query || 'أهم الأخبار اليوم';

    const result = await zai.functions.invoke('web_search', {
      query,
      num: 10,
    });

    if (!Array.isArray(result)) return [];

    return result
      .filter((item: any) => item?.name && item?.url)
      .map((item: any, i: number) => ({
        id: `web-${category}-${i}-${Date.now()}`,
        title: item.name || '',
        snippet: item.snippet || '',
        url: item.url || '',
        image: '', // Web search doesn't return images
        source: item.host_name || '',
        favicon: item.favicon || '',
        date: item.date || '',
        category,
        importanceScore: undefined,
        qualityScore: undefined,
      }));
  } catch (error) {
    console.error('Web Search fetch error:', error);
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

    // ============ PARALLEL FETCHING FROM ALL 3 SOURCES ============
    const [gnewsArticles, newsdataArticles, webSearchArticles] = await Promise.allSettled([
      fetchGNews(category, country, search || undefined),
      fetchNewsData(category, country, search || undefined),
      fetchWebSearch(category, search || undefined),
    ]);

    // Extract results (handle settled promises)
    const gnews = gnewsArticles.status === 'fulfilled' ? gnewsArticles.value : [];
    const newsdata = newsdataArticles.status === 'fulfilled' ? newsdataArticles.value : [];
    const websearch = webSearchArticles.status === 'fulfilled' ? webSearchArticles.value : [];

    // ============ MERGE ALL ARTICLES ============
    const allArticles = [...gnews, ...newsdata, ...websearch];

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
        const zai = await ZAI.create();
        // Batch score articles using AI (top 5 only to save API calls)
        const topArticles = paginated.slice(0, 5);
        const titlesText = topArticles.map((a, i) => `${i + 1}. ${a.title}`).join('\n');
        
        const completion = await zai.chat.completions.create({
          messages: [
            {
              role: 'system',
              content: 'أنت نظام تقييم أخبار. قم بتقييم أهمية كل خبر من 1 إلى 10. أجب فقط بالأرقام مفصولة بفواصل. مثال: 8,5,9,3,7',
            },
            {
              role: 'user',
              content: `قيّم أهمية هذه الأخبار من 1-10:\n${titlesText}`,
            },
          ],
          temperature: 0.1,
          max_tokens: 100,
        });

        const scoresText = completion.choices?.[0]?.message?.content || '';
        const scores = scoresText.split(/[,\s]+/).map(Number).filter((n: number) => !isNaN(n) && n >= 1 && n <= 10);
        
        enhanced = paginated.map((article, i) => ({
          ...article,
          importanceScore: i < scores.length ? scores[i] : undefined,
        }));
      } catch {
        // AI enhancement failed, return without scores
      }
    }

    // ============ CACHE RESULTS ============
    setCache(cacheKey, enhanced);

    return NextResponse.json({
      articles: enhanced,
      category,
      country,
      page,
      totalResults: sorted.length,
      sources: {
        gnews: gnews.length,
        newsdata: newsdata.length,
        websearch: websearch.length,
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
