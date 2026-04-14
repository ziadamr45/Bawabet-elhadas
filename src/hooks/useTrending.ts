'use client';

import { useState, useEffect, useCallback } from 'react';
import { NewsArticle } from '@/lib/utils';

interface UseTrendingReturn {
  articles: NewsArticle[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

let trendingCache: { data: NewsArticle[]; timestamp: number } | null = null;
const CACHE_DURATION = 3 * 60 * 1000; // 3 minutes

export function useTrending(): UseTrendingReturn {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTrending = useCallback(async () => {
    if (trendingCache && Date.now() - trendingCache.timestamp < CACHE_DURATION) {
      setArticles(trendingCache.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/news/trending');
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setArticles(data.articles || []);
        trendingCache = { data: data.articles || [], timestamp: Date.now() };
      }
    } catch {
      setError('فشل في جلب الأخبار العاجلة');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTrending();
  }, [fetchTrending]);

  return { articles, loading, error, refetch: fetchTrending };
}
