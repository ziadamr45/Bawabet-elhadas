'use client';

import { Search, X, Loader2, Sparkles } from 'lucide-react';
import { NewsArticle } from '@/lib/utils';
import { getArticleImage, timeAgo, getCategoryColor } from '@/lib/utils';
import { useState, useRef, useEffect } from 'react';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  articles: NewsArticle[];
  loading: boolean;
  onSearch: (query: string) => void;
  onSummarize?: (article: NewsArticle) => void;
}

export default function SearchModal({ isOpen, onClose, articles, loading, onSearch, onSummarize }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Reset query when modal closes via onClose callback
  const handleClose = () => {
    setQuery('');
    onClose();
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    if (isOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSearch(query.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm">
      <div className="max-w-2xl mx-auto mt-20 px-4">
        <div className="bg-white dark:bg-[#303134] rounded-2xl shadow-2xl overflow-hidden">
          {/* Search Input */}
          <form onSubmit={handleSubmit} className="flex items-center gap-3 p-4 border-b border-gray-200 dark:border-gray-600">
            <Search className="w-5 h-5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث في الأخبار..."
              className="flex-1 bg-transparent text-gray-900 dark:text-white text-lg outline-none placeholder-gray-400"
              dir="rtl"
            />
            {loading && <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />}
            <button type="button" onClick={handleClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-600 rounded-full">
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </form>

          {/* Results */}
          {articles.length > 0 && (
            <div className="max-h-[60vh] overflow-y-auto p-2">
              {articles.map((article) => {
                const colorClass = getCategoryColor(article.category);
                return (
                  <a
                    key={article.id}
                    href={article.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors group"
                  >
                    <div className="w-16 h-16 rounded-lg overflow-hidden shrink-0 bg-gray-100 dark:bg-gray-600">
                      <img
                        src={getArticleImage(article, article.category)}
                        alt=""
                        className="w-full h-full object-cover"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${colorClass} text-white`}>
                          {article.category}
                        </span>
                        <span className="text-xs text-gray-400">{article.source}</span>
                      </div>
                      <h4 className="text-sm font-semibold text-gray-900 dark:text-white line-clamp-2 leading-relaxed group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {article.title}
                      </h4>
                      <span className="text-xs text-gray-400 mt-1">{timeAgo(article.date)}</span>
                    </div>
                    {onSummarize && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onSummarize(article);
                        }}
                        className="shrink-0 p-1.5 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors"
                        title="تلخيص"
                      >
                        <Sparkles className="w-4 h-4 text-blue-500" />
                      </button>
                    )}
                  </a>
                );
              })}
            </div>
          )}

          {/* No results */}
          {!loading && query && articles.length === 0 && (
            <div className="p-8 text-center text-gray-400">
              <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-lg font-medium">لا توجد نتائج</p>
              <p className="text-sm mt-1">جرب البحث بكلمات مختلفة</p>
            </div>
          )}

          {/* Initial state */}
          {!query && (
            <div className="p-8 text-center text-gray-400">
              <p className="text-lg">اكتب للبحث في الأخبار</p>
              <div className="flex flex-wrap gap-2 justify-center mt-4">
                {['سياسة', 'رياضة', 'تكنولوجيا', 'اقتصاد', 'صحة'].map((tag) => (
                  <button
                    key={tag}
                    onClick={() => {
                      setQuery(tag);
                      onSearch(tag);
                    }}
                    className="px-3 py-1.5 bg-gray-100 dark:bg-gray-600 rounded-full text-sm text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-500 transition-colors"
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
