'use client';

import { useState, useEffect, useCallback } from 'react';
import { NewsArticle, UserInterests, getDefaultInterests } from '@/lib/utils';

interface UseForYouReturn {
  articles: NewsArticle[];
  loading: boolean;
  error: string | null;
  interests: UserInterests;
  trackClick: (category: string, source: string) => void;
  refetch: () => void;
}

export function useForYou(country: string = 'eg'): UseForYouReturn {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [interests, setInterests] = useState<UserInterests>(() => {
    if (typeof window === 'undefined') return getDefaultInterests();
    try {
      const saved = localStorage.getItem('user-interests');
      return saved ? JSON.parse(saved) : getDefaultInterests();
    } catch {
      return getDefaultInterests();
    }
  });

  const fetchForYou = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const interestsStr = encodeURIComponent(JSON.stringify(interests));
      const response = await fetch(`/api/news/foryou?interests=${interestsStr}&country=${country}`);
      const data = await response.json();

      if (data.error) {
        setError(data.error);
      } else {
        setArticles(data.articles || []);
      }
    } catch {
      setError('فشل في جلب الأخبار المخصصة');
    } finally {
      setLoading(false);
    }
  }, [interests, country]);

  useEffect(() => {
    fetchForYou();
  }, [fetchForYou]);

  const trackClick = useCallback((category: string, source: string) => {
    setInterests((prev) => {
      const newInterests = {
        clickedCategories: { ...prev.clickedCategories },
        clickedSources: { ...prev.clickedSources },
        recentClicks: [...(prev.recentClicks || [])],
      };
      newInterests.clickedCategories[category] = (newInterests.clickedCategories[category] || 0) + 1;
      newInterests.clickedSources[source] = (newInterests.clickedSources[source] || 0) + 1;
      newInterests.recentClicks.unshift(`${category}:${source}`);
      if (newInterests.recentClicks.length > 50) newInterests.recentClicks.pop();
      
      localStorage.setItem('user-interests', JSON.stringify(newInterests));
      return newInterests;
    });
  }, []);

  return { articles, loading, error, interests, trackClick, refetch: fetchForYou };
}
