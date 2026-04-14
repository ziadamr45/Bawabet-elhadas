'use client';

import { useState, useEffect, useCallback } from 'react';
import { NewsArticle, CategoryId } from '@/lib/utils';

interface UseNewsReturn {
  articles: NewsArticle[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const cache = new Map<string, { data: NewsArticle[]; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export function useNews(category: CategoryId): UseNewsReturn {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    // Check cache first
    const cached = cache.get(category);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      setArticles(cached.data);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/news?category=${category}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setArticles(data.articles || []);
        cache.set(category, { data: data.articles || [], timestamp: Date.now() });
      }
    } catch {
      setError('فشل في جلب الأخبار');
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  return { articles, loading, error, refetch: fetchNews };
}
