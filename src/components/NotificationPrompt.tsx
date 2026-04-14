'use client';
// ============================================================
// NotificationPrompt — Banner asking user to enable push notifications
// Shows once, remembers dismissal in localStorage
// ============================================================

import { useState, useEffect } from 'react';
import { usePushNotification } from '@/hooks/usePushNotification';
import { Bell, BellRing, X, Loader2, Check, AlertCircle } from 'lucide-react';

const DISMISS_KEY = 'notif_prompt_dismissed';
const DISMISS_DURATION_DAYS = 7;

export default function NotificationPrompt() {
  const [visible, setVisible] = useState(false);
  const { canPrompt, isSubscribed, isLoading, error, subscribe, isDenied, isGranted } = usePushNotification();

  // Check if prompt should show
  useEffect(() => {
    // Don't show if already subscribed, denied, or dismissed recently
    if (isSubscribed || isDenied || isGranted) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const dismissedAt = parseInt(dismissed, 10);
      const daysSinceDismiss = (Date.now() - dismissedAt) / (1000 * 60 * 60 * 24 * DISMISS_DURATION_DAYS);
      if (daysSinceDismiss < DISMISS_DURATION_DAYS) return;
    }

    // Show after a short delay (let the page load first)
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, [isSubscribed, isDenied, isGranted]);

  const handleSubscribe = async () => {
    const success = await subscribe();
    if (success) {
      setVisible(false);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  if (!visible || isSubscribed || !canPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 md:left-auto md:right-4 md:w-[420px] animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="rounded-xl border bg-card text-card-foreground shadow-2xl overflow-hidden">
        {/* Header with gradient */}
        <div className="bg-gradient-to-l from-blue-600 to-blue-500 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-white">
            <BellRing className="h-5 w-5 animate-bounce" />
            <span className="font-bold text-sm">تفعيل الإشعارات</span>
          </div>
          <button
            onClick={handleDismiss}
            className="text-white/80 hover:text-white transition-colors rounded-full p-0.5 hover:bg-white/10"
            aria-label="إغلاق"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-3">
          <p className="text-sm leading-relaxed text-foreground/90">
            اشترك في استلام الإشعارات لتصلك أخبار عاجلة وأهم المستجدات فور صدورها مباشرة.
          </p>

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 text-red-500 text-xs bg-red-50 dark:bg-red-950/30 rounded-lg px-3 py-2">
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSubscribe}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-sm font-medium rounded-lg px-4 py-2.5 transition-colors"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>جاري التفعيل...</span>
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4" />
                  <span>فعّل الإشعارات</span>
                </>
              )}
            </button>
            <button
              onClick={handleDismiss}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-2.5"
            >
              لاحقاً
            </button>
          </div>

          <p className="text-[11px] text-muted-foreground text-center">
            يمكنك تعطيل الإشعارات في أي وقت من إعدادات المتصفح
          </p>
        </div>
      </div>
    </div>
  );
}
