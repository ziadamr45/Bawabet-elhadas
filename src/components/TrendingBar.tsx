'use client';

import { NewsArticle } from '@/lib/utils';
import { AlertCircle, Loader2 } from 'lucide-react';

interface TrendingBarProps {
  articles: NewsArticle[];
  loading: boolean;
}

export default function TrendingBar({ articles, loading }: TrendingBarProps) {
  if (loading) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border-y border-red-200 dark:border-red-800">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 shrink-0">
              <AlertCircle className="w-5 h-5 text-red-500 animate-pulse" />
              <span className="text-sm font-bold text-red-600 dark:text-red-400">عاجل</span>
            </div>
            <div className="flex gap-4 overflow-hidden">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse">
                  <div className="h-4 w-48 bg-red-200 dark:bg-red-800 rounded" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!articles.length) return null;

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border-y border-red-200 dark:border-red-800 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span className="text-sm font-bold text-red-600 dark:text-red-400">عاجل</span>
          </div>
          <div className="overflow-hidden relative flex-1">
            <div className="flex gap-6 animate-marquee whitespace-nowrap">
              {[...articles, ...articles].map((article, i) => (
                <a
                  key={`${article.id}-${i}`}
                  href={article.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-red-700 dark:text-red-300 hover:underline inline-block"
                >
                  {article.title}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
