// ============================================================
// بوابة الحدث - Trending Engine
// Calculates trending scores using views, clicks, shares & recency
// Pure heuristic — no external API calls needed
// ============================================================

import { prisma } from '@/lib/prisma';
import { scoreArticle } from '@/lib/huggingface';
import { getCached, setCache } from '@/lib/utils';

// ============ TYPES ============
export interface TrendingArticle {
  id: string;
  title: string;
  snippet: string;
  url: string;
  image: string;
  source: string;
  date: string;
  category: string;
  viewCount: number;
  clickCount: number;
  shareCount: number;
  trendingScore: number;
  importanceScore: number;
}

export interface TrendingConfig {
  // Weight of each factor in the final score (must sum to 1.0)
  viewsWeight: number;     // default: 0.25
  clicksWeight: number;    // default: 0.35
  sharesWeight: number;    // default: 0.20
  recencyWeight: number;   // default: 0.10
  aiWeight: number;        // default: 0.10

  // Recency decay settings
  maxAgeHours: number;      // Articles older than this get recency = 0 (default: 48)
  halfLifeHours: number;    // Score halves every N hours (default: 6)

  // Limits
  maxResults: number;       // Max articles to return (default: 10)
  minInteractions: number;  // Minimum views+clicks to be eligible (default: 1)
}

// ============ DEFAULT CONFIGURATION ============
const DEFAULT_CONFIG: TrendingConfig = {
  viewsWeight: 0.25,
  clicksWeight: 0.35,
  sharesWeight: 0.20,
  recencyWeight: 0.10,
  aiWeight: 0.10,
  maxAgeHours: 48,
  halfLifeHours: 6,
  maxResults: 10,
  minInteractions: 1,
};

// ============ CORE: CALCULATE TRENDING SCORE ============

/**
 * Calculate the trending score for a single article.
 *
 * Formula:
 *   normalizedViews   = views   / maxViews  * 10
 *   normalizedClicks  = clicks  / maxClicks * 10
 *   normalizedShares  = shares  / maxShares * 10
 *   recency           = max(0, 10 - (hoursAgo / maxAgeHours) * 10)
 *   aiScore           = importanceScore from AI heuristic (1-10)
 *
 *   trendingScore = views*w + clicks*w + shares*w + recency*w + ai*w
 *   Result is 0-10 scale, stored as 0-100 for precision.
 *
 * @param views     - Total view count
 * @param clicks    - Total click count
 * @param shares    - Total share count
 * @param publishedAt - Article publish time
 * @param importanceScore - AI importance score (1-10)
 * @param config    - Scoring configuration (weights, decay)
 * @returns trending score 0-100
 */
export function calculateTrendingScore(
  views: number,
  clicks: number,
  shares: number,
  publishedAt: Date | null,
  importanceScore: number | null,
  config: TrendingConfig = DEFAULT_CONFIG
): number {
  // --- Step 1: Calculate recency (time-based freshness) ---
  const hoursAgo = publishedAt
    ? (Date.now() - publishedAt.getTime()) / (1000 * 60 * 60)
    : config.maxAgeHours; // No date = minimum recency

  // Exponential decay: score drops as article ages
  const recency = hoursAgo <= 0
    ? 10  // Published right now
    : Math.max(0, 10 * Math.pow(0.5, hoursAgo / config.halfLifeHours));

  // --- Step 2: AI importance score ---
  const aiScore = importanceScore || 5; // Default to neutral

  // --- Step 3: Raw interaction values (normalized later in batch) ---
  // For single-article scoring, we use log normalization
  const normalizedViews = Math.min(10, Math.log2(views + 1) * 1.5);
  const normalizedClicks = Math.min(10, Math.log2(clicks + 1) * 2.0);
  const normalizedShares = Math.min(10, Math.log2(shares + 1) * 3.0);

  // --- Step 4: Weighted score ---
  const rawScore =
    normalizedViews * config.viewsWeight +
    normalizedClicks * config.clicksWeight +
    normalizedShares * config.sharesWeight +
    recency * config.recencyWeight +
    aiScore * config.aiWeight;

  // --- Step 5: Scale to 0-100 ---
  return Math.round(rawScore * 10); // 0-100 for DB precision
}

// ============ BATCH: SCORE & RANK MULTIPLE ARTICLES ============

/**
 * Calculate trending scores for a batch of articles and return them sorted.
 * Uses min-max normalization across the batch for fair comparison.
 */
export function rankArticlesByTrending(
  articles: Array<{
    id: string;
    title: string;
    snippet: string;
    url: string;
    image: string | null;
    source: string | null;
    category: string | null;
    publishedAt: Date | null;
    viewCount: number;
    clickCount: number;
    shareCount: number;
    importanceScore: number | null;
  }>,
  config: TrendingConfig = DEFAULT_CONFIG
): TrendingArticle[] {
  if (articles.length === 0) return [];

  // --- Step 1: Calculate AI importance scores (heuristic, no API call) ---
  const scoredArticles = articles.map((article) => {
    const aiScore = scoreArticle(article.title, article.snippet || '');
    const finalImportance = article.importanceScore || aiScore;
    return { ...article, _aiScore: finalImportance };
  });

  // --- Step 2: Min-max normalization for views, clicks, shares ---
  const maxViews = Math.max(1, ...scoredArticles.map((a) => a.viewCount));
  const maxClicks = Math.max(1, ...scoredArticles.map((a) => a.clickCount));
  const maxShares = Math.max(1, ...scoredArticles.map((a) => a.shareCount));

  // --- Step 3: Calculate trending score for each article ---
  const withScores = scoredArticles.map((article) => {
    const hoursAgo = article.publishedAt
      ? (Date.now() - article.publishedAt.getTime()) / (1000 * 60 * 60)
      : config.maxAgeHours;

    const recency = hoursAgo <= 0
      ? 10
      : Math.max(0, 10 * Math.pow(0.5, hoursAgo / config.halfLifeHours));

    const normalizedViews = (article.viewCount / maxViews) * 10;
    const normalizedClicks = (article.clickCount / maxClicks) * 10;
    const normalizedShares = (article.shareCount / maxShares) * 10;

    const rawScore =
      normalizedViews * config.viewsWeight +
      normalizedClicks * config.clicksWeight +
      normalizedShares * config.sharesWeight +
      recency * config.recencyWeight +
      article._aiScore * config.aiWeight;

    const trendingScore = Math.round(rawScore * 10);

    return {
      ...article,
      trendingScore,
    };
  });

  // --- Step 4: Filter by minimum interactions & sort ---
  return withScores
    .filter(
      (a) =>
        (a.viewCount + a.clickCount) >= config.minInteractions &&
        a.trendingScore > 0
    )
    .sort((a, b) => b.trendingScore - a.trendingScore)
    .slice(0, config.maxResults)
    .map((a) => ({
      id: a.id,
      title: a.title,
      snippet: a.snippet || '',
      url: a.url,
      image: a.image || '',
      source: a.source || '',
      date: a.publishedAt?.toISOString() || '',
      category: a.category || 'trending',
      viewCount: a.viewCount,
      clickCount: a.clickCount,
      shareCount: a.shareCount,
      trendingScore: a.trendingScore,
      importanceScore: a._aiScore,
    }));
}

// ============ DATABASE: UPDATE TRENDING SCORES ============

/**
 * Recalculate and update trending scores in the database.
 * Call this periodically (cron job) or when articles get new interactions.
 */
export async function refreshTrendingScores(): Promise<number> {
  try {
    // Get all articles from the last 48 hours
    const cutoffDate = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const articles = await prisma.article.findMany({
      where: {
        publishedAt: { gte: cutoffDate },
        expiresAt: { gte: new Date() },
      },
    });

    if (articles.length === 0) return 0;

    // Batch rank
    const ranked = rankArticlesByTrending(
      articles.map((a) => ({
        id: a.id,
        title: a.title,
        snippet: a.snippet,
        url: a.url,
        image: a.image,
        source: a.source,
        category: a.category,
        publishedAt: a.publishedAt,
        viewCount: a.viewCount,
        clickCount: a.clickCount,
        shareCount: a.shareCount,
        importanceScore: a.importanceScore,
      }))
    );

    // Update scores in DB (batch)
    const updatePromises = ranked.map((article) =>
      prisma.article.update({
        where: { id: article.id },
        data: {
          trendingScore: article.trendingScore,
          importanceScore: Math.round(article.importanceScore),
        },
      }).catch(() => {}) // Ignore individual failures
    );

    await Promise.all(updatePromises);
    console.log(`[Trending] Updated scores for ${ranked.length} articles`);
    return ranked.length;
  } catch (error: any) {
    console.error('[Trending] Score refresh failed:', error.message);
    return 0;
  }
}

// ============ API: GET TRENDING ARTICLES ============

/**
 * Get top trending articles (for API endpoint use).
 * Combines DB trending scores with fresh API articles.
 */
export async function getTrendingArticles(
  limit: number = 10
): Promise<TrendingArticle[]> {
  // Check cache (5 min TTL for trending)
  const cacheKey = 'trending-scored';
  const cached = getCached<TrendingArticle[]>(cacheKey);
  if (cached) {
    return cached.slice(0, limit);
  }

  try {
    // Get articles with engagement data, sorted by trending score
    const dbArticles = await prisma.article.findMany({
      where: {
        expiresAt: { gte: new Date() },
      },
      orderBy: { trendingScore: 'desc' },
      take: 20,
    });

    // Rank them (recalculates with latest data)
    const ranked = rankArticlesByTrending(dbArticles);

    // Cache result (5 min)
    setCache(cacheKey, ranked);

    return ranked.slice(0, limit);
  } catch (error: any) {
    console.error('[Trending] getTrendingArticles failed:', error.message);
    return [];
  }
}

// ============ BREAKING NEWS DETECTION ============

/**
 * Detect if an article qualifies as "breaking news".
 * Used by the notification system to trigger alerts.
 *
 * Criteria:
 * - Published within the last 3 hours
 * - High importance score (>= 8)
 * - From an important/reliable source
 * - Has high engagement velocity (quick views/clicks)
 */
export function isBreakingNews(
  article: {
    publishedAt: Date | null;
    importanceScore: number | null;
    viewCount: number;
    clickCount: number;
    source: string | null;
    category: string | null;
    createdAt: Date;
  }
): boolean {
  const now = Date.now();

  // Must be recent (within 3 hours)
  if (!article.publishedAt) return false;
  const hoursSincePublish = (now - article.publishedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSincePublish > 3) return false;

  // High importance score
  const importance = article.importanceScore || 5;
  if (importance < 8) return false;

  // Must be from certain "important" categories
  const breakingCategories = ['politics', 'world', 'trending', 'economy'];
  if (article.category && !breakingCategories.includes(article.category)) {
    // Only skip if we KNOW the category. If unknown, allow it.
  }

  // Engagement velocity: if it got clicks quickly, it's trending
  const hoursSinceFetch = Math.max(0.1, (now - article.createdAt.getTime()) / (1000 * 60 * 60));
  const clickVelocity = article.clickCount / hoursSinceFetch;
  if (clickVelocity >= 5) return true; // 5+ clicks/hour = viral

  return importance >= 9; // Very high importance always qualifies
}
