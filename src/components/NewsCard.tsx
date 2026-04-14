'use client';

import { NewsArticle } from '@/lib/utils';
import { getCategoryColor, getArticleImage, timeAgo, getCategoryLabel } from '@/lib/utils';
import { ExternalLink, Sparkles, Shield, Star } from 'lucide-react';
import { useState } from 'react';

interface NewsCardProps {
  article: NewsArticle;
  onSummarize?: (article: NewsArticle) => void;
  onVerify?: (article: NewsArticle) => void;
  onArticleClick?: (article: NewsArticle) => void;
  featured?: boolean;
}

export default function NewsCard({ article, onSummarize, onVerify, onArticleClick, featured = false }: NewsCardProps) {
  const [imageError, setImageError] = useState(false);

  const imageUrl = getArticleImage(article, article.category);
  const colorClass = getCategoryColor(article.category);
  const categoryLabel = getCategoryLabel(article.category);

  if (featured) {
    return (
      <article className="group relative overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800 cursor-pointer transition-transform hover:scale-[1.01]">
        <a href={article.url} target="_blank" rel="noopener noreferrer" className="block" onClick={() => onArticleClick?.(article)}>
          <div className="relative h-64 sm:h-80 overflow-hidden">
            {!imageError ? (
              <img
                src={imageUrl}
                alt={article.title}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                onError={() => setImageError(true)}
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center">
                <span className="text-4xl text-white/50">📰</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
            <div className="absolute bottom-0 right-0 left-0 p-4 sm:p-6">
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold ${colorClass} text-white mb-2`}>
                {categoryLabel}
              </span>
              {article.importanceScore && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-yellow-500 text-white mr-2">
                  <Star className="w-3 h-3" /> {article.importanceScore}/10
                </span>
              )}
              <h2 className="text-lg sm:text-xl font-bold text-white mb-2 line-clamp-2 leading-relaxed">
                {article.title}
              </h2>
              <p className="text-sm text-gray-200 line-clamp-2 mb-3 leading-relaxed">
                {article.snippet}
              </p>
              <div className="flex items-center gap-2 text-xs text-gray-300">
                {article.favicon && (
                  <img src={article.favicon} alt="" className="w-4 h-4 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                )}
                <span>{article.source}</span>
                <span className="mx-1">•</span>
                <span>{timeAgo(article.date)}</span>
              </div>
            </div>
          </div>
        </a>
        {/* AI Buttons */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {onSummarize && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSummarize(article); }}
              className="p-2 bg-white/90 dark:bg-gray-800/90 rounded-full shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
              title="تلخيص بالذكاء الاصطناعي"
            >
              <Sparkles className="w-4 h-4 text-blue-600" />
            </button>
          )}
          {onVerify && (
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onVerify(article); }}
              className="p-2 bg-white/90 dark:bg-gray-800/90 rounded-full shadow-lg hover:bg-white dark:hover:bg-gray-700 transition-colors"
              title="التحقق من الخبر"
            >
              <Shield className="w-4 h-4 text-green-600" />
            </button>
          )}
        </div>
      </article>
    );
  }

  return (
    <article className="group bg-white dark:bg-[#303134] rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-gray-100 dark:border-gray-700 cursor-pointer">
      <a href={article.url} target="_blank" rel="noopener noreferrer" className="block" onClick={() => onArticleClick?.(article)}>
        {/* Image */}
        <div className="relative h-40 sm:h-48 overflow-hidden">
          {!imageError ? (
            <img
              src={imageUrl}
              alt={article.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              onError={() => setImageError(true)}
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center">
              <span className="text-3xl text-gray-400 dark:text-gray-500">📰</span>
            </div>
          )}
          <span className={`absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold ${colorClass} text-white`}>
            {categoryLabel}
          </span>
          {article.importanceScore && article.importanceScore >= 7 && (
            <span className="absolute top-2 left-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-yellow-500 text-white">
              <Star className="w-2.5 h-2.5" /> {article.importanceScore}
            </span>
          )}
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4">
          <h3 className="font-bold text-sm sm:text-base text-gray-900 dark:text-white line-clamp-2 mb-2 leading-relaxed group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
            {article.title}
          </h3>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3 leading-relaxed">
            {article.snippet}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-gray-400 dark:text-gray-500">
              {article.favicon && (
                <img src={article.favicon} alt="" className="w-3.5 h-3.5 rounded" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              )}
              <span>{article.source}</span>
              <span>•</span>
              <span>{timeAgo(article.date)}</span>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </div>
        </div>
      </a>

      {/* AI Action Buttons */}
      <div className="px-3 sm:px-4 pb-3 flex gap-3">
        {onSummarize && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onSummarize(article); }}
            className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors font-medium"
          >
            <Sparkles className="w-3.5 h-3.5" />
            تلخيص
          </button>
        )}
        {onVerify && (
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onVerify(article); }}
            className="flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:text-green-700 dark:hover:text-green-300 transition-colors font-medium"
          >
            <Shield className="w-3.5 h-3.5" />
            تحقق
          </button>
        )}
      </div>
    </article>
  );
}
