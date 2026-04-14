// ============================================================
// بوابة الحدث - Web Push Notification System (VAPID)
// Uses: web-push library (no Firebase/FCM needed)
// Handles: Breaking News, Personalized, Daily Digest
// Anti-spam: Max 5 notifications/day per user
// ============================================================

import webpush from 'web-push';
import { prisma } from '@/lib/prisma';
import { getTrendingArticles, isBreakingNews } from '@/lib/trending';

// ============ VAPID CONFIGURATION ============
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@bawabet-elhadas.com';

// Configure web-push
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_SUBJECT,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log(`[WebPush] Configured with VAPID key (${VAPID_PUBLIC_KEY.substring(0, 8)}...)`);
} else {
  console.warn(
    '[WebPush] VAPID keys not set. Push notifications are disabled.' +
    '\n     To enable: Add NEXT_PUBLIC_VAPID_KEY and VAPID_PRIVATE_KEY to .env'
  );
}

// Anti-spam limits
const MAX_NOTIFICATIONS_PER_DAY = 5;
const MAX_BREAKING_PER_DAY = 3;
const DIGEST_COOLDOWN_HOURS = 20;

// ============ TYPES ============
export type NotificationType = 'breaking' | 'personalized' | 'digest';

export interface NotificationPayload {
  title: string;
  body: string;
  icon?: string;
  image?: string;
  url?: string;
  data?: Record<string, string>;
}

export interface SendResult {
  success: boolean;
  sentCount: number;
  failedCount: number;
  errors: string[];
}

export interface WebPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

// ============ DAILY LIMIT TRACKER ============
const dailyTracker = new Map<string, { count: number; lastReset: number }>();

export function canSendNotification(userId: string, type: NotificationType): boolean {
  const key = `${userId}:${new Date().toISOString().split('T')[0]}`;
  const tracker = dailyTracker.get(key);

  if (!tracker || Date.now() - tracker.lastReset > 24 * 60 * 60 * 1000) {
    dailyTracker.set(key, { count: 0, lastReset: Date.now() });
    return true;
  }

  const limit = type === 'breaking' ? MAX_BREAKING_PER_DAY : MAX_NOTIFICATIONS_PER_DAY;
  return tracker.count < limit;
}

function incrementNotificationCount(userId: string): void {
  const key = `${userId}:${new Date().toISOString().split('T')[0]}`;
  const tracker = dailyTracker.get(key);
  if (tracker) {
    tracker.count++;
  } else {
    dailyTracker.set(key, { count: 1, lastReset: Date.now() });
  }
}

// ============ CORE: SEND WEB PUSH NOTIFICATION ============

function isConfigured(): boolean {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

async function sendWebPush(
  subscription: WebPushSubscription,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  if (!isConfigured()) {
    return { success: false, error: 'WebPush not configured' };
  }

  try {
    const pushPayload = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: payload.icon || '/favicon-news.png',
      image: payload.image || undefined,
      badge: '/favicon-news.png',
      url: payload.url || '/',
      data: payload.data || {},
      vibrate: [100, 50, 100],
      actions: [
        { action: 'open', title: 'اقرأ الخبر' },
        { action: 'dismiss', title: 'إغلاق' },
      ],
    });

    await webpush.sendNotification(subscription, pushPayload, {
      TTL: 86400, // 24 hours
      urgency: 'normal',
    });

    console.log(`[WebPush] Sent to ${subscription.endpoint.substring(0, 50)}...: "${payload.title}"`);
    return { success: true };
  } catch (error: any) {
    const statusCode = error.statusCode;

    // If subscription is invalid/expired, mark it inactive
    if (statusCode === 404 || statusCode === 410) {
      console.warn(`[WebPush] Subscription expired (HTTP ${statusCode}), deactivating...`);
      await deactivateSubscription(subscription.endpoint);
      return { success: false, error: `Subscription expired (${statusCode})` };
    }

    console.error(`[WebPush] Send error:`, error.message);
    return { success: false, error: error.message };
  }
}

async function deactivateSubscription(endpoint: string): Promise<void> {
  try {
    await prisma.deviceToken.updateMany({
      where: { endpoint, isActive: true },
      data: { isActive: false },
    });
    console.log(`[WebPush] Subscription deactivated: ${endpoint.substring(0, 50)}...`);
  } catch {
    // Ignore DB errors
  }
}

// ============ HELPER: Convert DB record to WebPushSubscription ============

function toWebPushSubscription(device: {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
}): WebPushSubscription {
  return {
    endpoint: device.endpoint,
    keys: {
      p256dh: device.keys_p256dh,
      auth: device.keys_auth,
    },
  };
}

// ============ PUBLIC API: SEND NOTIFICATION TO USER ============

export async function sendToUser(
  userId: string,
  payload: NotificationPayload,
  type: NotificationType = 'personalized'
): Promise<SendResult> {
  const result: SendResult = { success: false, sentCount: 0, failedCount: 0, errors: [] };

  if (!isConfigured()) {
    result.errors.push('WebPush not configured');
    return result;
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        notificationEnabled: true,
        notificationTypes: true,
      },
    });

    if (!user || !user.notificationEnabled) {
      return result;
    }

    if (!user.notificationTypes.includes(type)) {
      return result;
    }

    if (!canSendNotification(userId, type)) {
      result.errors.push('Daily notification limit reached');
      return result;
    }

    const devices = await prisma.deviceToken.findMany({
      where: { userId, isActive: true },
      select: {
        endpoint: true,
        keys_p256dh: true,
        keys_auth: true,
      },
    });

    if (devices.length === 0) {
      result.errors.push('No active subscriptions');
      return result;
    }

    const sendPromises = devices.map(async (device) => {
      const subscription = toWebPushSubscription(device);
      const res = await sendWebPush(subscription, payload);
      if (res.success) {
        result.sentCount++;
      } else {
        result.failedCount++;
        if (res.error) result.errors.push(res.error);
      }
    });

    await Promise.all(sendPromises);

    if (result.sentCount > 0) {
      await prisma.notificationLog.create({
        data: {
          userId,
          articleUrl: payload.url || null,
          articleTitle: payload.title,
          articleImage: payload.image || null,
          type,
          title: payload.title,
          body: payload.body,
          data: payload.data as any || null,
          status: 'sent',
        },
      });

      incrementNotificationCount(userId);
      result.success = true;
    }

    return result;
  } catch (error: any) {
    result.errors.push(error.message);
    return result;
  }
}

// ============ PUBLIC API: BROADCAST NOTIFICATION ============

export async function broadcastNotification(
  payload: NotificationPayload,
  type: NotificationType = 'breaking'
): Promise<SendResult> {
  const result: SendResult = { success: false, sentCount: 0, failedCount: 0, errors: [] };

  if (!isConfigured()) {
    result.errors.push('WebPush not configured');
    return result;
  }

  try {
    let skip = 0;
    const batchSize = 500;
    let hasMore = true;

    while (hasMore) {
      const devices = await prisma.deviceToken.findMany({
        where: { isActive: true },
        select: {
          endpoint: true,
          keys_p256dh: true,
          keys_auth: true,
          userId: true,
        },
        skip,
        take: batchSize,
      });

      if (devices.length === 0) break;
      hasMore = devices.length === batchSize;
      skip += batchSize;

      for (let i = 0; i < devices.length; i += 50) {
        const batch = devices.slice(i, i + 50);
        const promises = batch.map(async (device) => {
          if (!canSendNotification(device.userId, type)) return;

          const subscription = toWebPushSubscription(device);
          const res = await sendWebPush(subscription, payload);
          if (res.success) {
            result.sentCount++;
            incrementNotificationCount(device.userId);
          } else {
            result.failedCount++;
          }
        });

        await Promise.all(promises);
      }
    }

    if (result.sentCount > 0) {
      await prisma.notificationLog.create({
        data: {
          userId: null,
          articleUrl: payload.url || null,
          articleTitle: payload.title,
          articleImage: payload.image || null,
          type,
          title: payload.title,
          body: payload.body,
          data: payload.data as any || null,
          status: 'sent',
        },
      });
      result.success = true;
    }

    console.log(`[WebPush] Broadcast: sent=${result.sentCount}, failed=${result.failedCount}`);
    return result;
  } catch (error: any) {
    result.errors.push(error.message);
    return result;
  }
}

// ============ 1. BREAKING NEWS NOTIFICATION ============

export async function checkAndSendBreakingNews(): Promise<{
  checked: number;
  sent: number;
}> {
  let checked = 0;
  let sent = 0;

  try {
    if (!isConfigured()) {
      console.log('[WebPush] Breaking news check skipped: WebPush not configured');
      return { checked: 0, sent: 0 };
    }

    const recentArticles = await prisma.article.findMany({
      where: {
        publishedAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
        expiresAt: { gte: new Date() },
        viewCount: { gt: 0 },
      },
      orderBy: { trendingScore: 'desc' },
      take: 20,
    });

    if (recentArticles.length === 0) return { checked: 0, sent: 0 };

    const recentNotified = await prisma.notificationLog.findMany({
      where: {
        type: 'breaking',
        sentAt: { gte: new Date(Date.now() - 3 * 60 * 60 * 1000) },
        articleUrl: { not: null },
      },
      select: { articleUrl: true },
    });
    const notifiedUrls = new Set(recentNotified.map((n) => n.articleUrl));

    for (const article of recentArticles) {
      checked++;

      if (notifiedUrls.has(article.url)) continue;
      if (!isBreakingNews(article)) continue;

      const payload: NotificationPayload = {
        title: '⚡ عاجل',
        body: article.title,
        icon: '/favicon-news.png',
        image: article.image || undefined,
        url: article.url,
        data: {
          articleId: article.id,
          category: article.category || 'breaking',
          source: article.source || '',
        },
      };

      const result = await broadcastNotification(payload, 'breaking');

      if (result.success) {
        sent++;
        console.log(`[WebPush] Breaking news sent: "${article.title.substring(0, 50)}..."`);
      }

      if (sent >= 1) break;
    }

    console.log(`[WebPush] Breaking news check: ${checked} checked, ${sent} sent`);
  } catch (error: any) {
    console.error('[WebPush] Breaking news check error:', error.message);
  }

  return { checked, sent };
}

// ============ 2. PERSONALIZED NOTIFICATION ============

export async function sendPersonalizedNotifications(): Promise<{
  usersProcessed: number;
  notificationsSent: number;
}> {
  let usersProcessed = 0;
  let notificationsSent = 0;

  try {
    if (!isConfigured()) return { usersProcessed: 0, notificationsSent: 0 };

    const users = await prisma.user.findMany({
      where: {
        notificationEnabled: true,
        notificationTypes: { has: 'personalized' },
        deviceTokens: { some: { isActive: true } },
      },
      select: {
        id: true,
        preferredCategories: true,
      },
      take: 100,
    });

    for (const user of users) {
      usersProcessed++;
      if (!canSendNotification(user.id, 'personalized')) continue;

      const categoryArticles = await prisma.article.findMany({
        where: {
          category: { in: user.preferredCategories },
          trendingScore: { gt: 30 },
          publishedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
          expiresAt: { gte: new Date() },
        },
        orderBy: { trendingScore: 'desc' },
        take: 1,
      });

      if (categoryArticles.length === 0) continue;

      const article = categoryArticles[0];

      const alreadyNotified = await prisma.notificationLog.findFirst({
        where: {
          userId: user.id,
          articleUrl: article.url,
          sentAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      });
      if (alreadyNotified) continue;

      const categoryLabels: Record<string, string> = {
        politics: 'سياسة', economy: 'اقتصاد', sports: 'رياضة',
        technology: 'تكنولوجيا', entertainment: 'ترفيه', health: 'صحة',
        science: 'علوم', world: 'عالم', culture: 'ثقافة', education: 'تعليم',
      };

      const payload: NotificationPayload = {
        title: `📰 ${categoryLabels[article.category || ''] || 'أخبار'}`,
        body: article.title,
        icon: '/favicon-news.png',
        image: article.image || undefined,
        url: article.url,
        data: {
          articleId: article.id,
          category: article.category || '',
          source: article.source || '',
        },
      };

      const result = await sendToUser(user.id, payload, 'personalized');
      if (result.success) notificationsSent++;
    }

    console.log(
      `[WebPush] Personalized: ${usersProcessed} users processed, ${notificationsSent} sent`
    );
  } catch (error: any) {
    console.error('[WebPush] Personalized notifications error:', error.message);
  }

  return { usersProcessed, notificationsSent };
}

// ============ 3. DAILY DIGEST ============

export async function sendDailyDigest(userId?: string): Promise<{
  sent: number;
}> {
  let sent = 0;

  try {
    if (!isConfigured()) return { sent: 0 };

    const topArticles = await getTrendingArticles(5);
    if (topArticles.length === 0) return { sent: 0 };

    const digestBody = topArticles
      .slice(0, 5)
      .map((a, i) => `${i + 1}. ${a.title}`)
      .join('\n');

    const payload: NotificationPayload = {
      title: '📋 ملخص أخبار اليوم',
      body: digestBody.substring(0, 200) + (digestBody.length > 200 ? '...' : ''),
      icon: '/favicon-news.png',
      url: '/',
      data: {
        type: 'digest',
        articleCount: String(topArticles.length),
      },
    };

    if (userId) {
      const result = await sendToUser(userId, payload, 'digest');
      if (result.success) sent++;
    } else {
      const users = await prisma.user.findMany({
        where: {
          notificationEnabled: true,
          notificationTypes: { has: 'digest' },
          deviceTokens: { some: { isActive: true } },
        },
        select: { id: true },
      });

      for (const user of users) {
        const digest = await prisma.dailyDigest.findUnique({
          where: { userId: user.id },
        });

        if (digest?.lastSent) {
          const hoursSinceDigest =
            (Date.now() - digest.lastSent.getTime()) / (1000 * 60 * 60);
          if (hoursSinceDigest < DIGEST_COOLDOWN_HOURS) continue;
        }

        const result = await sendToUser(user.id, payload, 'digest');
        if (result.success) {
          sent++;
          await prisma.dailyDigest.upsert({
            where: { userId: user.id },
            update: {
              lastSent: new Date(),
              articleIds: topArticles.map((a) => a.id),
            },
            create: {
              userId: user.id,
              lastSent: new Date(),
              articleIds: topArticles.map((a) => a.id),
            },
          }).catch(() => {});
        }
      }
    }

    console.log(`[WebPush] Daily digest: ${sent} sent`);
  } catch (error: any) {
    console.error('[WebPush] Daily digest error:', error.message);
  }

  return { sent };
}

// ============ DEVICE SUBSCRIPTION MANAGEMENT ============

/**
 * Register a new Web Push subscription for a user.
 * Accepts the full PushSubscription object from the browser's pushManager.subscribe().
 */
export async function registerDeviceToken(
  userId: string,
  subscription: WebPushSubscription,
  platform: string = 'web',
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    // Use endpoint as the unique identifier
    await prisma.deviceToken.upsert({
      where: { endpoint: subscription.endpoint },
      update: {
        userId,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        platform,
        userAgent,
        isActive: true,
      },
      create: {
        userId,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
        platform,
        userAgent,
      },
    });

    console.log(`[WebPush] Subscription registered: ${subscription.endpoint.substring(0, 50)}... for user ${userId}`);
    return { success: true };
  } catch (error: any) {
    console.error('[WebPush] Subscription registration error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Unregister a Web Push subscription.
 */
export async function unregisterDeviceToken(
  endpoint: string
): Promise<{ success: boolean }> {
  try {
    await prisma.deviceToken.deleteMany({ where: { endpoint } });
    return { success: true };
  } catch {
    return { success: false };
  }
}

// ============ EXPORTS FOR CLIENT USE ============

export { isConfigured };
