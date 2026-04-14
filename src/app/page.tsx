'use client';

import { useState, useCallback } from 'react';
import Header from '@/components/Header';
import TrendingBar from '@/components/TrendingBar';
import NewsCard from '@/components/NewsCard';
import NewsDetail from '@/components/NewsDetail';
import SearchModal from '@/components/SearchModal';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import LoadingSkeleton, { CategorySkeleton } from '@/components/LoadingSkeleton';
import { useNews } from '@/hooks/useNews';
import { useTrending } from '@/hooks/useTrending';
import { useSearch } from '@/hooks/useSearch';
import { CategoryId, NewsArticle, CATEGORIES } from '@/lib/utils';
import { RefreshCw, AlertTriangle, ChevronDown } from 'lucide-react';

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<CategoryId>('home');
  const [searchOpen, setSearchOpen] = useState(false);
  const [selectedArticle, setSelectedArticle] = useState<NewsArticle | null>(null);
  const [visibleCount, setVisibleCount] = useState(9);

  const { articles, loading, error, refetch } = useNews(activeCategory);
  const { articles: trendingArticles, loading: trendingLoading } = useTrending();
  const { articles: searchArticles, loading: searchLoading, search, clear: clearSearch } = useSearch();

  const handleCategoryChange = useCallback((category: CategoryId) => {
    setActiveCategory(category);
    setVisibleCount(9);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const handleSummarize = useCallback((article: NewsArticle) => {
    setSelectedArticle(article);
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    await search(query);
  }, [search]);

  const loadMore = () => {
    setVisibleCount((prev) => prev + 6);
  };

  const currentCategoryLabel = CATEGORIES.find((c) => c.id === activeCategory)?.label || 'الرئيسية';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#202124]">
      {/* Header */}
      <Header
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        onSearchOpen={() => setSearchOpen(true)}
      />

      {/* Trending Bar */}
      <TrendingBar articles={trendingArticles} loading={trendingLoading} />

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex gap-6">
          {/* Main Feed */}
          <div className="flex-1 min-w-0">
            {/* Category Title */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {currentCategoryLabel}
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  آخر الأخبار والمستجدات
                </p>
              </div>
              <button
                onClick={refetch}
                disabled={loading}
                className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-[#303134] border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                تحديث
              </button>
            </div>

            {/* Loading State */}
            {loading && <LoadingSkeleton />}

            {/* Error State */}
            {error && !loading && (
              <div className="text-center py-12">
                <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">حدث خطأ</h3>
                <p className="text-gray-500 dark:text-gray-400 mb-4">{error}</p>
                <button
                  onClick={refetch}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  حاول مرة أخرى
                </button>
              </div>
            )}

            {/* Content */}
            {!loading && !error && articles.length > 0 && (
              <>
                {/* Hero Article (first article) */}
                {activeCategory === 'home' && (
                  <div className="mb-8">
                    <NewsCard article={articles[0]} onSummarize={handleSummarize} featured />
                  </div>
                )}

                {/* News Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                  {(activeCategory === 'home' ? articles.slice(1) : articles)
                    .slice(0, visibleCount)
                    .map((article) => (
                      <NewsCard
                        key={article.id}
                        article={article}
                        onSummarize={handleSummarize}
                      />
                    ))}
                </div>

                {/* Load More */}
                {articles.length > visibleCount && (
                  <div className="text-center mt-8">
                    <button
                      onClick={loadMore}
                      className="flex items-center gap-2 mx-auto px-6 py-2.5 bg-white dark:bg-[#303134] border border-gray-200 dark:border-gray-600 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors shadow-sm"
                    >
                      <ChevronDown className="w-4 h-4" />
                      عرض المزيد
                    </button>
                  </div>
                )}
              </>
            )}

            {/* Empty State */}
            {!loading && !error && articles.length === 0 && (
              <div className="text-center py-12">
                <div className="text-5xl mb-4">📰</div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2">لا توجد أخبار حالياً</h3>
                <p className="text-gray-500 dark:text-gray-400">جرب تحديث الصفحة أو اختيار تصنيف آخر</p>
              </div>
            )}

            {/* Category Sections on Home */}
            {activeCategory === 'home' && !loading && articles.length > 0 && (
              <div className="mt-12 space-y-10">
                {CATEGORIES.filter((c) => c.id !== 'home' && c.id !== 'trending').slice(0, 4).map((cat) => (
                  <CategorySection
                    key={cat.id}
                    categoryId={cat.id}
                    label={cat.label}
                    onSummarize={handleSummarize}
                    onViewAll={() => handleCategoryChange(cat.id)}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <Sidebar
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
          />
        </div>
      </main>

      {/* Footer */}
      <Footer />

      {/* Search Modal */}
      <SearchModal
        isOpen={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          clearSearch();
        }}
        articles={searchArticles}
        loading={searchLoading}
        onSearch={handleSearch}
        onSummarize={handleSummarize}
      />

      {/* News Detail Modal */}
      <NewsDetail
        article={selectedArticle}
        onClose={() => setSelectedArticle(null)}
      />
    </div>
  );
}

// Sub-component for category sections on the home page
function CategorySection({
  categoryId,
  label,
  onSummarize,
  onViewAll,
}: {
  categoryId: string;
  label: string;
  onSummarize: (article: NewsArticle) => void;
  onViewAll: () => void;
}) {
  const { articles, loading } = useNews(categoryId as CategoryId);

  if (loading) return <CategorySkeleton />;
  if (articles.length === 0) return null;

  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-900 dark:text-white">{label}</h3>
        <button
          onClick={onViewAll}
          className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
        >
          عرض الكل
        </button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.slice(0, 3).map((article) => (
          <NewsCard key={article.id} article={article} onSummarize={onSummarize} />
        ))}
      </div>
    </section>
  );
}
