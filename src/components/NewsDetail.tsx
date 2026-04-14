'use client';

import { NewsArticle } from '@/lib/utils';
import { Sparkles, X, Loader2, ExternalLink, Clock } from 'lucide-react';
import { getArticleImage, timeAgo, getCategoryColor } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface NewsDetailProps {
  article: NewsArticle | null;
  onClose: () => void;
}

export default function NewsDetail({ article, onClose }: NewsDetailProps) {
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState(false);

  useEffect(() => {
    if (article) {
      setSummary('');
      setSummaryError(false);
    }
  }, [article]);

  if (!article) return null;

  const handleSummarize = async () => {
    if (summarizing) return;
    setSummarizing(true);
    setSummaryError(false);

    try {
      const response = await fetch('/api/news/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: article.title, snippet: article.snippet }),
      });
      const data = await response.json();
      setSummary(data.summary || 'لم يتم إنشاء تلخيص');
    } catch {
      setSummaryError(true);
      setSummary('فشل في إنشاء التلخيص. حاول مرة أخرى.');
    } finally {
      setSummarizing(false);
    }
  };

  const colorClass = getCategoryColor(article.category);
  const imageUrl = getArticleImage(article, article.category);

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm">
      <div className="max-w-3xl mx-auto mt-8 sm:mt-16 px-4 pb-8">
        <div className="bg-white dark:bg-[#303134] rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] overflow-y-auto">
          {/* Header Image */}
          <div className="relative h-48 sm:h-64">
            <img
              src={imageUrl}
              alt={article.title}
              className="w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
            <button
              onClick={onClose}
              className="absolute top-3 left-3 p-2 bg-white/90 dark:bg-gray-800/90 rounded-full hover:bg-white dark:hover:bg-gray-700 transition-colors shadow-lg"
            >
              <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
            {/* Category & Meta */}
            <div className="flex items-center gap-3 mb-3">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorClass} text-white`}>
                {article.category === 'trending' ? 'عاجل' : article.category}
              </span>
              <div className="flex items-center gap-2 text-xs text-gray-400">
                {article.favicon && (
                  <img src={article.favicon} alt="" className="w-4 h-4 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                <span>{article.source}</span>
                <span>•</span>
                <Clock className="w-3 h-3" />
                <span>{timeAgo(article.date)}</span>
              </div>
            </div>

            {/* Title */}
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 leading-relaxed">
              {article.title}
            </h2>

            {/* Snippet */}
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-6">
              {article.snippet}
            </p>

            {/* AI Summary Section */}
            <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-6 bg-blue-50/50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-blue-700 dark:text-blue-300">تلخيص بالذكاء الاصطناعي</span>
                </div>
                <button
                  onClick={handleSummarize}
                  disabled={summarizing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {summarizing ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      جارٍ التلخيص...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      تلخيص
                    </>
                  )}
                </button>
              </div>
              {summary && (
                <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">
                  {summary}
                </p>
              )}
              {summaryError && (
                <p className="text-sm text-red-500">{summary}</p>
              )}
            </div>

            {/* Read Full Article */}
            <a
              href={article.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <ExternalLink className="w-4 h-4" />
              قراءة الخبر كاملاً
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
