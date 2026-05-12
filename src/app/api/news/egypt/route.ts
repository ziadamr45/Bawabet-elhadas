import { NextRequest, NextResponse } from 'next/server';
import { fetchEgyptNews, EgyptNewsResult } from '@/lib/egypt-news';

// ============ EGYPT NEWS ENDPOINT ============
// GET /api/news/egypt
// Fetches news from all sources: RSS (Ahram, Masrawy, Al Jazeera, Al Arabiya, BBC),
// APIs (GNews, NewsData), and external sources (Youm7, Cairo24)
// Features: parallel fetching, dedup, AI translation, grouping, caching

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const grouped = searchParams.get('grouped') !== 'false'; // default: true
    const limit = parseInt(searchParams.get('limit') || '50');

    const result: EgyptNewsResult = await fetchEgyptNews();

    // Build response
    const response: Record<string, any> = {
      articles: result.articles.slice(0, limit),
      sources: result.sources,
      cached: result.cached,
      fetchedAt: result.fetchedAt,
      totalArticles: result.articles.length,
    };

    // Include groups if requested
    if (grouped) {
      response.groups = result.groups;
    }

    return NextResponse.json(response);
  } catch (error: any) {
    console.error('[EgyptNews] API error:', error);
    return NextResponse.json(
      { error: 'فشل في جلب الأخبار المصرية', details: error.message },
      { status: 500 }
    );
  }
}
