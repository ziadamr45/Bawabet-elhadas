// ============================================================
// بوابة الحدث - Egypt News Aggregation System
// Multi-source news fetching with RSS, APIs, and external sources
// Features: parallel fetching, dedup, AI translation, grouping
// ============================================================

import RssParser from 'rss-parser';
const Parser = RssParser.default || RssParser;
import { summarizeArticle, translateToArabic, groupSimilarArticles } from './ai';
import { getCached, setCache } from './utils';

// ============ TYPES ============
export interface EgyptArticle {
  id: string;
  title: string;
  description: string;
  url: string;
  image: string;
  source: string;
  sourceType: 'rss' | 'api' | 'external';
  publishedAt: string;
  language: string;
  category?: string;
  aiSummary?: string;
}

export interface NewsGroup {
  mainTitle: string;
  aiSummary?: string;
  articles: Array<{
    source: string;
    url: string;
    title: string;
    image: string;
    sourceType: string;
  }>;
}

export interface EgyptNewsResult {
  articles: EgyptArticle[];
  groups: NewsGroup[];
  sources: Record<string, number>;
  cached: boolean;
  fetchedAt: string;
}

// ============ RSS PARSER ============
const rssParser = new Parser({
  timeout: 15_000,
  headers: {
    'User-Agent': 'Bawabet-Elhadas/1.0 (News Aggregator)',
    'Accept': 'application/rss+xml, application/xml, text/xml',
  },
});

// ============ RSS FEEDS CONFIGURATION ============
const RSS_FEEDS = [
  {
    id: 'ahram',
    name: 'بوابة الأهرام',
    url: 'http://gate.ahram.org.eg/rss.aspx',
    category: 'egypt',
  },
  {
    id: 'masrawy',
    name: 'مصراوي',
    url: 'https://www.masrawy.com/rss/rss',
    category: 'egypt',
  },
  {
    id: 'aljazeera',
    name: 'الجزيرة',
    url: 'https://www.aljazeera.net/xml/rss/all.xml',
    category: 'world',
  },
  {
    id: 'alarabiya',
    name: 'العربية',
    url: 'https://www.alarabiya.net/rss/ar.xml',
    category: 'world',
  },
  {
    id: 'bbc-arabic',
    name: 'BBC عربي',
    url: 'https://feeds.bbci.co.uk/arabic/rss.xml',
    category: 'world',
  },
];

// ============ EXTERNAL SOURCES (no RSS, title+URL only) ============
const EXTERNAL_SOURCES = [
  {
    id: 'youm7',
    name: 'اليوم السابع',
    // Youm7 doesn't have a stable public RSS - use their API/search endpoint
    url: 'https://www.youm7.com/',
    category: 'egypt',
  },
  {
    id: 'cairo24',
    name: 'القاهرة 24',
    url: 'https://www.cairo24.com/',
    category: 'egypt',
  },
];

// ============ IN-MEMORY CACHE ============
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// ============================================================
// 1. FETCH RSS FEEDS
// ============================================================

/**
 * Fetch a single RSS feed and normalize articles
 */
async function fetchRSSFeed(feed: typeof RSS_FEEDS[0]): Promise<EgyptArticle[]> {
  try {
    const parsed = await rssParser.parseURL(feed.url);

    const articles: EgyptArticle[] = (parsed.items || []).slice(0, 15).map((item, i) => {
      // Extract image from enclosure or content
      let image = item.enclosure?.url || '';
      if (!image && item['media:content']?.$.url) {
        image = item['media:content'].$.url;
      }
      if (!image && item.content) {
        const imgMatch = item.content.match(/<img[^>]+src=["']([^"']+)/);
        if (imgMatch) image = imgMatch[1];
      }
      if (!image && item['media:thumbnail']?.$.url) {
        image = item['media:thumbnail'].$.url;
      }

      return {
        id: `rss-${feed.id}-${i}-${Date.now()}`,
        title: item.title || '',
        description: item.contentSnippet || item.content || '',
        url: item.link || '',
        image,
        source: feed.name,
        sourceType: 'rss' as const,
        publishedAt: item.pubDate || item.isoDate || new Date().toISOString(),
        language: 'ar',
        category: feed.category,
      };
    });

    console.log(`[RSS] ${feed.name}: ${articles.length} articles`);
    return articles;
  } catch (error: any) {
    console.warn(`[RSS] ${feed.name} failed:`, error.message?.substring(0, 80));
    return [];
  }
}

/**
 * Fetch all RSS feeds in parallel
 */
async function fetchAllRSS(): Promise<EgyptArticle[]> {
  const results = await Promise.allSettled(RSS_FEEDS.map(fetchRSSFeed));
  return results
    .filter((r): r is PromiseFulfilledResult<EgyptArticle[]> => r.status === 'fulfilled')
    .flatMap(r => r.value);
}

// ============================================================
// 2. FETCH API SOURCES (GNews + NewsData)
// ============================================================

const GNEWS_API_KEY = process.env.GNEWS_API_KEY || 'b72cdb0d6660d4c8f9e1473f412eba10';
const NEWSDATA_API_KEY = process.env.NEWSDATA_API_KEY || 'pub_5c1937c7d1644a008e976e4131a12fe6';

/**
 * Fetch from GNews API (Egypt-focused)
 */
async function fetchGNews(): Promise<EgyptArticle[]> {
  try {
    const url = `https://gnews.io/api/v4/top-headlines?lang=ar&country=eg&max=10&token=${GNEWS_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();

    return (data.articles || []).map((article: any, i: number) => ({
      id: `gnews-eg-${i}-${Date.now()}`,
      title: article.title || '',
      description: article.description || article.content || '',
      url: article.url || '',
      image: article.image || '',
      source: article.source?.name || 'GNews',
      sourceType: 'api' as const,
      publishedAt: article.publishedAt || '',
      language: 'ar',
      category: 'egypt',
    }));
  } catch (error: any) {
    console.warn('[API] GNews failed:', error.message);
    return [];
  }
}

/**
 * Fetch from NewsData.io (Egypt-focused)
 */
async function fetchNewsData(): Promise<EgyptArticle[]> {
  try {
    const url = `https://newsdata.io/api/1/news?language=ar&country=eg&apikey=${NEWSDATA_API_KEY}`;
    const response = await fetch(url);
    if (!response.ok) return [];
    const data = await response.json();

    return (data.results || []).map((article: any, i: number) => ({
      id: `newsdata-eg-${i}-${Date.now()}`,
      title: article.title || '',
      description: article.description || '',
      url: article.link || '',
      image: article.image_url || article.image || '',
      source: article.source_id || 'NewsData',
      sourceType: 'api' as const,
      publishedAt: article.pubDate || '',
      language: 'ar',
      category: 'egypt',
    }));
  } catch (error: any) {
    console.warn('[API] NewsData failed:', error.message);
    return [];
  }
}

/**
 * Fetch all API sources in parallel
 */
async function fetchAllAPIs(): Promise<EgyptArticle[]> {
  const [gnews, newsdata] = await Promise.allSettled([fetchGNews(), fetchNewsData()]);
  return [
    ...(gnews.status === 'fulfilled' ? gnews.value : []),
    ...(newsdata.status === 'fulfilled' ? newsdata.value : []),
  ];
}

// ============================================================
// 3. FETCH EXTERNAL SOURCES (title + URL only)
// ============================================================

/**
 * Fetch external sources (Youm7, Cairo24).
 * These don't have public RSS, so we only provide basic info.
 * In production, you'd use their search API or a scraping service.
 */
async function fetchExternalSources(): Promise<EgyptArticle[]> {
  // External sources without RSS - return placeholder entries
  // In production, these would be fetched via search APIs or web scraping services
  const articles: EgyptArticle[] = [];

  for (const source of EXTERNAL_SOURCES) {
    // We can't scrape without permission, so we add the source as a reference
    // Real implementation would use their search API or a legal content partner
    articles.push({
      id: `ext-${source.id}-${Date.now()}`,
      title: `آخر الأخبار من ${source.name}`,
      description: '',
      url: source.url,
      image: '',
      source: source.name,
      sourceType: 'external',
      publishedAt: new Date().toISOString(),
      language: 'ar',
      category: source.category,
    });
  }

  return articles;
}

// ============================================================
// 4. DEDUPLICATION
// ============================================================

/**
 * Remove duplicate articles based on URL or similar titles
 */
export function deduplicateNews(articles: EgyptArticle[]): EgyptArticle[] {
  const seen = new Map<string, EgyptArticle>();

  for (const article of articles) {
    // Check by URL
    const urlKey = normalizeUrl(article.url);
    if (seen.has(urlKey)) continue;

    // Check by title similarity
    const titleKey = normalizeTitle(article.title);
    let isDuplicate = false;
    const keys = Array.from(seen.keys());
    for (const existingKey of keys) {
      if (existingKey.startsWith('title:') && titleSimilarityQuick(existingKey.replace('title:', ''), titleKey) > 0.6) {
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seen.set(urlKey, article);
      seen.set('title:' + titleKey, article);
    }
  }

  // Return only the actual articles (not the title-keyed entries)
  const uniqueArticles: EgyptArticle[] = [];
  const seenIds = new Set<string>();
  seen.forEach((article) => {
    if (!seenIds.has(article.id)) {
      seenIds.add(article.id);
      uniqueArticles.push(article);
    }
  });

  return uniqueArticles;
}

/**
 * Normalize URL for comparison
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove trailing slashes, query params, fragments
    return `${u.hostname}${u.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, '').replace(/[?#].*$/, '');
  }
}

/**
 * Normalize title for comparison
 */
function normalizeTitle(title: string): string {
  return title
    .replace(/[إأآا]/g, 'ا')
    .replace(/[ةه]/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[\u064B-\u065F]/g, '')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Quick title similarity check (0-1)
 */
function titleSimilarityQuick(a: string, b: string): number {
  const wordsA = new Set(a.split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  return intersection / Math.min(wordsA.size, wordsB.size);
}

// ============================================================
// 5. AI PROCESSING (Translate + Summarize + Group)
// ============================================================

/**
 * Process articles with AI: translate non-Arabic, summarize, group
 */
async function processWithAI(articles: EgyptArticle[]): Promise<{
  processed: EgyptArticle[];
  groups: NewsGroup[];
}> {
  const processed: EgyptArticle[] = [];

  // Process each article (translate + summarize)
  for (const article of articles) {
    try {
      // Translate title if not Arabic
      let title = article.title;
      if (article.language !== 'ar') {
        title = await translateToArabic(article.title, article.language);
      }

      // Translate description if not Arabic
      let description = article.description;
      if (description && article.language !== 'ar') {
        description = await translateToArabic(description, article.language);
      }

      processed.push({
        ...article,
        title,
        description,
        language: 'ar',
      });
    } catch {
      processed.push(article);
    }
  }

  // Group similar articles
  let groups: NewsGroup[] = [];
  try {
    const groupingInput = processed
      .filter(a => a.title && a.url)
      .slice(0, 20)
      .map(a => ({ title: a.title, url: a.url, source: a.source }));

    const rawGroups = await groupSimilarArticles(groupingInput);

    groups = rawGroups.map(g => {
      // Enrich group articles with full data from processed articles
      const enrichedArticles = g.articles.map(ga => {
        const full = processed.find(p => p.url === ga.url);
        return {
          source: ga.source,
          url: ga.url,
          title: full?.title || g.mainTitle,
          image: full?.image || '',
          sourceType: full?.sourceType || 'rss',
        };
      });

      return {
        mainTitle: g.mainTitle,
        aiSummary: undefined as string | undefined,
        articles: enrichedArticles,
      };
    });

    // Generate AI summaries for top groups
    for (let i = 0; i < Math.min(groups.length, 5); i++) {
      try {
        const groupArticles = groups[i].articles;
        // Find the full article for the main title
        const mainArticle = processed.find(a => a.title === groups[i].mainTitle);
        const desc = mainArticle?.description || '';
        groups[i].aiSummary = await summarizeArticle(groups[i].mainTitle, desc);
      } catch {
        // Skip summary for this group
      }
    }
  } catch (error: any) {
    console.warn('[AI] Grouping failed:', error.message);
  }

  return { processed, groups };
}

// ============================================================
// 6. MAIN AGGREGATOR
// ============================================================

/**
 * Main function: fetch all sources, merge, dedup, process
 */
export async function fetchEgyptNews(): Promise<EgyptNewsResult> {
  // Check cache first
  const cacheKey = 'egypt-news-full';
  const cached = getCached<EgyptNewsResult>(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  console.log('[EgyptNews] Fetching all sources in parallel...');

  // ============ PARALLEL FETCH FROM ALL SOURCES ============
  const [rssArticles, apiArticles, externalArticles] = await Promise.all([
    fetchAllRSS(),
    fetchAllAPIs(),
    fetchExternalSources(),
  ]);

  console.log(
    `[EgyptNews] Raw results: RSS=${rssArticles.length}, API=${apiArticles.length}, External=${externalArticles.length}`
  );

  // ============ MERGE ALL ARTICLES ============
  const allArticles = [...rssArticles, ...apiArticles, ...externalArticles];

  // ============ DEDUPLICATE ============
  const deduplicated = deduplicateNews(allArticles);

  // ============ SORT BY DATE (latest first) ============
  const sorted = deduplicated.sort((a, b) => {
    const dateA = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
    const dateB = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
    return dateB - dateA;
  });

  // ============ AI PROCESSING (translate + summarize + group) ============
  const { processed, groups } = await processWithAI(sorted);

  // ============ BUILD RESULT ============
  const result: EgyptNewsResult = {
    articles: processed.slice(0, 50), // Limit to 50 articles
    groups,
    sources: {
      ahram: rssArticles.filter(a => a.source === 'بوابة الأهرام').length,
      masrawy: rssArticles.filter(a => a.source === 'مصراوي').length,
      aljazeera: rssArticles.filter(a => a.source === 'الجزيرة').length,
      alarabiya: rssArticles.filter(a => a.source === 'العربية').length,
      bbc: rssArticles.filter(a => a.source === 'BBC عربي').length,
      gnews: apiArticles.filter(a => a.source === 'GNews').length,
      newsdata: apiArticles.filter(a => a.source === 'NewsData').length,
    },
    cached: false,
    fetchedAt: new Date().toISOString(),
  };

  // Cache result
  setCache(cacheKey, result);

  console.log(
    `[EgyptNews] Done: ${result.articles.length} articles, ${result.groups.length} groups`
  );

  return result;
}
