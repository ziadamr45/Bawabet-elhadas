'use client';

import { useState, useEffect, useCallback } from 'react';
import { NewsArticle, CategoryId } from '@/lib/utils';

interface UseNewsReturn {
  articles: NewsArticle[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const clientCache = new Map<string, { data: NewsArticle[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useNews(category: CategoryId, country: string = 'eg'): UseNewsReturn {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    const cacheKey = `${category}-${country}`;
    const cached = clientCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setArticles(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/news?category=${category}&country=${country}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        const articles = data.articles || [];
        setArticles(articles);
        clientCache.set(cacheKey, { data: articles, timestamp: Date.now() });
      }
    } catch {
      setError('فشل في جلب الأخبار');
    } finally {
      setLoading(false);
    }
  }, [category, country]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return { articles, loading, error, refetch: fetchNews };
}
