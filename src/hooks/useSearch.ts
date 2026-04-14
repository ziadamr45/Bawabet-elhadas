'use client';

import { useState, useCallback } from 'react';
import { NewsArticle } from '@/lib/utils';

interface UseSearchReturn {
  articles: NewsArticle[];
  loading: boolean;
  error: string | null;
  search: (query: string) => Promise<void>;
  clear: () => void;
}

export function useSearch(): UseSearchReturn {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string) => {
    if (!query || query.trim().length < 2) {
      setArticles([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/news/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setArticles(data.articles || []);
      }
    } catch {
      setError('فشل في البحث');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setArticles([]);
    setError(null);
  }, []);

  return { articles, loading, error, search, clear };
}
