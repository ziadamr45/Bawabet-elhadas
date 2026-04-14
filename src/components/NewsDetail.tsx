'use client';

import { NewsArticle } from '@/lib/utils';
import { Sparkles, X, Loader2, ExternalLink, Clock, Shield, Star, AlertTriangle, CheckCircle } from 'lucide-react';
import { getArticleImage, timeAgo, getCategoryColor, getCategoryLabel } from '@/lib/utils';
import { useState, useEffect } from 'react';

interface NewsDetailProps {
  article: NewsArticle | null;
  onClose: () => void;
  /** Auto-trigger this action when the modal opens */
  initialAction?: 'summarize' | 'verify' | null;
}

export default function NewsDetail({ article, onClose, initialAction }: NewsDetailProps) {
  const [summary, setSummary] = useState('');
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const [quality, setQuality] = useState<number | null>(null);
  const [analysis, setAnalysis] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState('');

  // Auto-trigger action when article or initialAction changes
  useEffect(() => {
    if (!article) return;
    // Reset state when article changes
    setSummary('');
    setSummaryError('');
    setQuality(null);
    setAnalysis('');
    setVerifyError('');

    if (initialAction === 'summarize') {
      // Small delay to ensure modal is rendered
      setTimeout(() => doSummarize(), 100);
    } else if (initialAction === 'verify') {
      setTimeout(() => doVerify(), 100);
    }
  }, [article, initialAction]);

  const doSummarize = async () => {
    if (summarizing || !article) return;
    setSummarizing(true);
    setSummaryError('');
    setSummary('');

    try {
      const response = await fetch('/api/news/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize', title: article.title, snippet: article.snippet }),
      });
      const data = await response.json();

      if (data.error) {
        setSummaryError(data.error);
      } else {
        setSummary(data.summary || 'لم يتم إنشاء تلخيص');
      }
    } catch (err) {
      setSummaryError('فشل الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setSummarizing(false);
    }
  };

  const doVerify = async () => {
    if (verifying || !article) return;
    setVerifying(true);
    setVerifyError('');
    setQuality(null);
    setAnalysis('');

    try {
      const response = await fetch('/api/news/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'verify', title: article.title, snippet: article.snippet }),
      });
      const data = await response.json();

      if (data.error) {
        setVerifyError(data.error);
      } else {
        setQuality(data.quality || 5);
        setAnalysis(data.analysis || '');
      }
    } catch (err) {
      setVerifyError('فشل الاتصال بالخادم. حاول مرة أخرى.');
    } finally {
      setVerifying(false);
    }
  };

  if (!article) return null;

  const colorClass = getCategoryColor(article.category);
  const imageUrl = getArticleImage(article, article.category);
  const categoryLabel = getCategoryLabel(article.category);

  const getQualityColor = (score: number) => {
    if (score >= 7) return 'text-green-500';
    if (score >= 4) return 'text-yellow-500';
    return 'text-red-500';
  };

  const getQualityLabel = (score: number) => {
    if (score >= 8) return 'موثوق';
    if (score >= 6) return 'يحتمل';
    if (score >= 4) return 'مشكوك فيه';
    return 'غير موثوق';
  };

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
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
            {article.importanceScore && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-yellow-500 rounded-lg text-white text-sm font-bold">
                <Star className="w-4 h-4" /> {article.importanceScore}/10
              </div>
            )}
          </div>

          {/* Content */}
          <div className="p-4 sm:p-6">
            {/* Category & Meta */}
            <div className="flex items-center gap-3 mb-3">
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${colorClass} text-white`}>
                {categoryLabel}
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
            <div className="border border-blue-200 dark:border-blue-800 rounded-xl p-4 mb-4 bg-blue-50/50 dark:bg-blue-900/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <span className="font-bold text-blue-700 dark:text-blue-300">تلخيص بالذكاء الاصطناعي</span>
                </div>
                <button
                  onClick={doSummarize}
                  disabled={summarizing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {summarizing ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />جارٍ التلخيص...</>
                  ) : (
                    <><Sparkles className="w-3.5 h-3.5" />تلخيص</>
                  )}
                </button>
              </div>
              {summarizing && !summary && (
                <div className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارٍ تحليل الخبر وتوليد الملخص...</span>
                </div>
              )}
              {summary && (
                <p className="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">{summary}</p>
              )}
              {summaryError && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{summaryError}</span>
                </div>
              )}
            </div>

            {/* AI Verify Section */}
            <div className="border border-green-200 dark:border-green-800 rounded-xl p-4 mb-6 bg-green-50/50 dark:bg-green-900/20">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-green-600" />
                  <span className="font-bold text-green-700 dark:text-green-300">التحقق من الخبر</span>
                </div>
                <button
                  onClick={doVerify}
                  disabled={verifying}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {verifying ? (
                    <><Loader2 className="w-3.5 h-3.5 animate-spin" />جارٍ التحقق...</>
                  ) : (
                    <><Shield className="w-3.5 h-3.5" />تحقق</>
                  )}
                </button>
              </div>
              {verifying && quality === null && (
                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>جارٍ تحليل مصداقية الخبر...</span>
                </div>
              )}
              {quality !== null && (
                <div className="flex items-start gap-3">
                  <div className={`text-2xl font-bold ${getQualityColor(quality)}`}>{quality}/10</div>
                  <div>
                    <div className={`flex items-center gap-1.5 text-sm font-bold ${getQualityColor(quality)}`}>
                      {quality >= 7 ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                      {getQualityLabel(quality)}
                    </div>
                    {analysis && <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">{analysis}</p>}
                  </div>
                </div>
              )}
              {verifyError && (
                <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{verifyError}</span>
                </div>
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
