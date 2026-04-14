// ============================================================
// بوابة الحدث - Unified News Aggregation System
// ============================================================

// Category definitions with search queries for all 3 sources
export const CATEGORIES = [
  { id: 'home', label: 'الرئيسية', query: 'أهم الأخبار اليوم', gnewsCategory: 'general', newsdataCategory: 'top' },
  { id: 'trending', label: 'عاجل', query: 'أخبار عاجلة اليوم', gnewsCategory: 'breaking', newsdataCategory: 'top' },
  { id: 'politics', label: 'سياسة', query: 'أخبار السياسة اليوم', gnewsCategory: 'nation', newsdataCategory: 'politics' },
  { id: 'economy', label: 'اقتصاد', query: 'أخبار الاقتصاد والأعمال اليوم', gnewsCategory: 'business', newsdataCategory: 'business' },
  { id: 'sports', label: 'رياضة', query: 'أخبار الرياضة اليوم', gnewsCategory: 'sports', newsdataCategory: 'sports' },
  { id: 'technology', label: 'تكنولوجيا', query: 'أخبار التكنولوجيا والذكاء الاصطناعي اليوم', gnewsCategory: 'technology', newsdataCategory: 'technology' },
  { id: 'entertainment', label: 'ترفيه ومشاهير', query: 'أخبار الترفيه والمشاهير اليوم', gnewsCategory: 'entertainment', newsdataCategory: 'entertainment' },
  { id: 'health', label: 'صحة', query: 'أخبار الصحة والطب اليوم', gnewsCategory: 'health', newsdataCategory: 'health' },
  { id: 'science', label: 'علوم', query: 'أخبار العلوم والاكتشافات', gnewsCategory: 'science', newsdataCategory: 'science' },
  { id: 'world', label: 'عالم', query: 'أخبار العالم الدولية اليوم', gnewsCategory: 'world', newsdataCategory: 'world' },
  { id: 'culture', label: 'ثقافة وفن', query: 'أخبار الثقافة والفنون اليوم', gnewsCategory: 'entertainment', newsdataCategory: 'entertainment' },
  { id: 'education', label: 'تعليم', query: 'أخبار التعليم والجامعات اليوم', gnewsCategory: 'nation', newsdataCategory: 'top' },
  { id: 'foryou', label: 'لك', query: 'أخبار مخصصة', gnewsCategory: 'general', newsdataCategory: 'top' },
] as const;

export type CategoryId = typeof CATEGORIES[number]['id'];

// Unified News Article Structure
export interface NewsArticle {
  id: string;
  title: string;
  snippet: string;
  url: string;
  image: string;
  source: string;
  favicon: string;
  date: string;
  category: string;
  aiSummary?: string;
  importanceScore?: number;
  qualityScore?: number;
}

// Country codes for filtering
export const COUNTRIES = [
  { code: 'eg', label: 'مصر', gnewsCode: 'eg', newsdataCode: 'eg' },
  { code: 'sa', label: 'السعودية', gnewsCode: 'sa', newsdataCode: 'sa' },
  { code: 'ae', label: 'الإمارات', gnewsCode: 'ae', newsdataCode: 'ae' },
  { code: 'kw', label: 'الكويت', gnewsCode: 'kw', newsdataCode: 'kw' },
  { code: 'qa', label: 'قطر', gnewsCode: 'qa', newsdataCode: 'qa' },
  { code: 'bh', label: 'البحرين', gnewsCode: 'bh', newsdataCode: 'bh' },
  { code: 'om', label: 'عُمان', gnewsCode: 'om', newsdataCode: 'om' },
  { code: 'jo', label: 'الأردن', gnewsCode: 'jo', newsdataCode: 'jo' },
  { code: 'lb', label: 'لبنان', gnewsCode: 'lb', newsdataCode: 'lb' },
  { code: 'iq', label: 'العراق', gnewsCode: 'iq', newsdataCode: 'iq' },
  { code: 'ma', label: 'المغرب', gnewsCode: 'ma', newsdataCode: 'ma' },
  { code: 'dz', label: 'الجزائر', gnewsCode: 'dz', newsdataCode: 'dz' },
  { code: 'tn', label: 'تونس', gnewsCode: 'tn', newsdataCode: 'tn' },
] as const;

export type CountryCode = typeof COUNTRIES[number]['code'];

// Format relative time in Arabic
export function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    const diffMinutes = Math.floor(diffSeconds / 60);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffSeconds < 60) return 'الآن';
    if (diffMinutes < 60) return `منذ ${diffMinutes} دقيقة`;
    if (diffHours < 24) return `منذ ${diffHours} ساعة`;
    if (diffDays < 7) return `منذ ${diffDays} يوم`;
    if (diffDays < 30) return `منذ ${Math.floor(diffDays / 7)} أسبوع`;
    return `منذ ${Math.floor(diffDays / 30)} شهر`;
  } catch {
    return dateStr;
  }
}

// Generate a simple ID from string
export function generateId(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Get category color
export function getCategoryColor(categoryId: string): string {
  const colors: Record<string, string> = {
    trending: 'bg-red-500',
    politics: 'bg-purple-500',
    economy: 'bg-green-500',
    sports: 'bg-orange-500',
    technology: 'bg-blue-500',
    entertainment: 'bg-pink-500',
    health: 'bg-teal-500',
    science: 'bg-indigo-500',
    world: 'bg-cyan-500',
    culture: 'bg-amber-500',
    education: 'bg-lime-500',
    home: 'bg-sky-500',
    foryou: 'bg-violet-500',
  };
  return colors[categoryId] || 'bg-gray-500';
}

// Get category Arabic label
export function getCategoryLabel(categoryId: string): string {
  const cat = CATEGORIES.find((c) => c.id === categoryId);
  if (cat) return cat.label;
  const labels: Record<string, string> = {
    home: 'رئيسي', trending: 'عاجل', politics: 'سياسة', economy: 'اقتصاد',
    sports: 'رياضة', technology: 'تكنولوجيا', entertainment: 'ترفيه', health: 'صحة',
    science: 'علوم', world: 'عالم', culture: 'ثقافة', education: 'تعليم', foryou: 'لك',
  };
  return labels[categoryId] || categoryId;
}

// Get article image - now prioritizes actual article images
export function getArticleImage(article: NewsArticle, category: string): string {
  if (article.image && article.image.startsWith('http')) return article.image;
  // Fallback to category placeholder
  const CATEGORY_IMAGES: Record<string, string> = {
    politics: 'https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=400&h=250&fit=crop',
    economy: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=250&fit=crop',
    sports: 'https://images.unsplash.com/photo-1461896836934-bd45ba8fcf9b?w=400&h=250&fit=crop',
    technology: 'https://images.unsplash.com/photo-1518770660439-4636190af475?w=400&h=250&fit=crop',
    entertainment: 'https://images.unsplash.com/photo-1603739903239-8b6e64c3b185?w=400&h=250&fit=crop',
    health: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=400&h=250&fit=crop',
    science: 'https://images.unsplash.com/photo-1507413245164-6160d8298b31?w=400&h=250&fit=crop',
    world: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=400&h=250&fit=crop',
    culture: 'https://images.unsplash.com/photo-1513364776144-60967b0f800f?w=400&h=250&fit=crop',
    education: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=400&h=250&fit=crop',
    trending: 'https://images.unsplash.com/photo-1495020689067-958852a7765e?w=400&h=250&fit=crop',
    home: 'https://images.unsplash.com/photo-1504711434969-e33886168d6c?w=400&h=250&fit=crop',
    foryou: 'https://images.unsplash.com/photo-1504711434969-e33886168d6c?w=400&h=250&fit=crop',
  };
  return CATEGORY_IMAGES[category] || CATEGORY_IMAGES.home;
}

// ============ IN-MEMORY CACHE ============
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const serverCache = new Map<string, CacheEntry<any>>();
const CACHE_DURATION = 7 * 60 * 1000; // 7 minutes

export function getCached<T>(key: string): T | null {
  const entry = serverCache.get(key);
  if (entry && Date.now() - entry.timestamp < CACHE_DURATION) {
    return entry.data;
  }
  if (entry) serverCache.delete(key);
  return null;
}

export function setCache<T>(key: string, data: T): void {
  serverCache.set(key, { data, timestamp: Date.now() });
  // Clean old entries
  if (serverCache.size > 100) {
    const now = Date.now();
    for (const [k, v] of serverCache) {
      if (now - v.timestamp > CACHE_DURATION * 2) serverCache.delete(k);
    }
  }
}

// ============ DEDUPLICATION ============
export function deduplicateArticles(articles: NewsArticle[]): NewsArticle[] {
  const seen = new Set<string>();
  return articles.filter((article) => {
    // Check by URL first (most reliable)
    const urlKey = article.url.replace(/\/$/, '').toLowerCase();
    if (seen.has(urlKey)) return false;
    seen.add(urlKey);
    
    // Also check by title similarity (first 50 chars)
    const titleKey = article.title.toLowerCase().replace(/\s+/g, ' ').substring(0, 50).trim();
    if (seen.has(titleKey)) return false;
    seen.add(titleKey);
    
    return true;
  });
}

// ============ USER INTEREST TRACKING (client-side) ============
export interface UserInterests {
  clickedCategories: Record<string, number>;
  clickedSources: Record<string, number>;
  recentClicks: string[];
}

export function getDefaultInterests(): UserInterests {
  return { clickedCategories: {}, clickedSources: {}, recentClicks: [] };
}

export function trackClick(interests: UserInterests, category: string, source: string): UserInterests {
  const newInterests = { ...interests };
  newInterests.clickedCategories = { ...newInterests.clickedCategories };
  newInterests.clickedSources = { ...newInterests.clickedSources };
  newInterests.recentClicks = [...newInterests.recentClicks];

  newInterests.clickedCategories[category] = (newInterests.clickedCategories[category] || 0) + 1;
  newInterests.clickedSources[source] = (newInterests.clickedSources[source] || 0) + 1;
  newInterests.recentClicks.unshift(`${category}:${source}`);
  if (newInterests.recentClicks.length > 50) newInterests.recentClicks.pop();

  return newInterests;
}
