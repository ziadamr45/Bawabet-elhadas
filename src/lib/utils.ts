// Category definitions with search queries
export const CATEGORIES = [
  { id: 'home', label: 'الرئيسية', query: 'أهم الأخبار اليوم' },
  { id: 'trending', label: 'عاجل', query: 'أخبار عاجلة اليوم' },
  { id: 'politics', label: 'سياسة', query: 'أخبار السياسة اليوم' },
  { id: 'economy', label: 'اقتصاد', query: 'أخبار الاقتصاد والأعمال اليوم' },
  { id: 'sports', label: 'رياضة', query: 'أخبار الرياضة اليوم' },
  { id: 'technology', label: 'تكنولوجيا', query: 'أخبار التكنولوجيا والذكاء الاصطناعي اليوم' },
  { id: 'entertainment', label: 'ترفيه ومشاهير', query: 'أخبار الترفيه والمشاهير اليوم' },
  { id: 'health', label: 'صحة', query: 'أخبار الصحة والطب اليوم' },
  { id: 'science', label: 'علوم', query: 'أخبار العلوم والاكتشافات اليوم' },
  { id: 'world', label: 'عالم', query: 'أخبار العالم الدولية اليوم' },
  { id: 'culture', label: 'ثقافة وفن', query: 'أخبار الثقافة والفنون اليوم' },
  { id: 'education', label: 'تعليم', query: 'أخبار التعليم والجامعات اليوم' },
] as const;

export type CategoryId = typeof CATEGORIES[number]['id'];

export interface NewsArticle {
  id: string;
  title: string;
  snippet: string;
  url: string;
  source: string;
  favicon: string;
  date: string;
  category: string;
  image?: string;
}

// Format relative time in Arabic
export function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  
  try {
    const date = new Date(dateStr);
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
  };
  return colors[categoryId] || 'bg-gray-500';
}

// Get category badge text color
export function getCategoryTextColor(categoryId: string): string {
  return 'text-white';
}

// Placeholder images for categories
export const CATEGORY_IMAGES: Record<string, string> = {
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
};

// Get a random image for an article
export function getArticleImage(article: NewsArticle, category: string): string {
  if (article.image) return article.image;
  return CATEGORY_IMAGES[category] || CATEGORY_IMAGES.home;
}
