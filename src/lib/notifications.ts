// ============================================================
// بوابة الحدث - Firebase Cloud Messaging (FCM) Notification System
// Handles: Breaking News, Personalized, Daily Digest
// Anti-spam: Max 5 notifications/day per user
// ============================================================

import { prisma } from '@/lib/prisma';
import { getTrendingArticles, isBreakingNews } from '@/lib/trending';
import { getCached, setCache } from '@/lib/utils';

// ============ CONFIGURATION ============
const FCM_SERVER_KEY = process.env.FCM_SERVER_KEY || process.env.NEXT_PUBLIC_FCM_SERVER_KEY || '';
const FCM_ENDPOINT = 'https://fcm.googleapis.com/fcm/send';

// Anti-spam limits
const MAX_NOTIFICATIONS_PER_DAY = 5;
const MAX_BREAKING_PER_DAY = 3;
const DIGEST_HOUR = 8; // Send daily digest at 8 AM (user's timezone)
const DIGEST_COOLDOWN_HOURS = 20; // Don't re-send digest within 20h

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

// ============ DAILY LIMIT TRACKER ============
const dailyTracker = new Map<string, { count: number; lastReset: number }>();

/**
 * Check and enforce daily notification limit for a user.
 * Returns true if user can still receive notifications today.
 */
export function canSendNotification(userId: string, type: NotificationType): boolean {
  const key = `${userId}:${new Date().toISOString().split('T')[0]}`;
  const tracker = dailyTracker.get(key);

  if (!tracker || Date.now() - tracker.lastReset > 24 * 60 * 60 * 1000) {
    dailyTracker.set(key, { count: 0, lastReset: Date.now() });
    return true;
  }

  // Stricter limit for breaking news
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

// ============ CORE: SEND FCM NOTIFICATION ============

/**
 * Send a push notification via Firebase Cloud Messaging.
 *
 * @param token - FCM device token
 * @param payload - Notification content (title, body, icon, data)
 * @returns success/failure status
 */
async function sendFCM(
  token: string,
  payload: NotificationPayload
): Promise<{ success: boolean; error?: string }> {
  if (!FCM_SERVER_KEY) {
    console.warn('[FCM] FCM_SERVER_KEY not configured. Notification not sent.');
    return { success: false, error: 'FCM not configured' };
  }

  try {
    const message = {
      to: token,
      notification: {
        title: payload.title,
        body: payload.body,
        icon: payload.icon || '/favicon-news.png',
        image: payload.image || undefined,
      },
      data: {
        url: payload.url || '',
        type: 'news',
        ...payload.data,
      },
      webpush: {
        fcm_options: {
          link: payload.url || '/',
        },
        notification: {
          icon: payload.icon || '/favicon-news.png',
          badge: '/favicon-news.png',
          vibrate: [100, 50, 100],
          actions: [
            { action: 'open', title: 'اقرأ الخبر' },
            { action: 'dismiss', title: 'إغلاق' },
          ],
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
          },
        },
      },
    };

    const response = await fetch(FCM_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `key=${FCM_SERVER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(message),
      timeout: 10_000,
    });

    const result = await response.json();

    if (!response.ok) {
      const errorMsg = result.error || `HTTP ${response.status}`;
      console.error(`[FCM] Send failed for token ${token.substring(0, 12)}...:`, errorMsg);

      // If token is invalid/unregistered, mark it inactive
      if (
        result.error === 'NotRegistered' ||
        result.error === 'InvalidRegistration' ||
        response.status === 404
      ) {
        await deactivateToken(token);
      }

      return { success: false, error: errorMsg };
    }

    // Check for failure in successful response
    if (result.failure === 1 && result.results?.[0]?.error) {
      const error = result.results[0].error;
      if (error === 'NotRegistered' || error === 'InvalidRegistration') {
        await deactivateToken(token);
      }
      return { success: false, error };
    }

    console.log(`[FCM] ✅ Sent to ${token.substring(0, 12)}...: "${payload.title}"`);
    return { success: true };
  } catch (error: any) {
    console.error('[FCM] Send error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Mark a device token as inactive (invalidated).
 */
async function deactivateToken(token: string): Promise<void> {
  try {
    await prisma.deviceToken.updateMany({
      where: { token, isActive: true },
      data: { isActive: false },
    });
    console.log(`[FCM] Token ${token.substring(0, 12)}... marked inactive`);
  } catch {
    // Ignore DB errors
  }
}

// ============ PUBLIC API: SEND NOTIFICATION TO USER ============

/**
 * Send a notification to a specific user on all their active devices.
 */
export async function sendToUser(
  userId: string,
  payload: NotificationPayload,
  type: NotificationType = 'personalized'
): Promise<SendResult> {
  const result: SendResult = { success: false, sentCount: 0, failedCount: 0, errors: [] };

  try {
    // Check if user has notifications enabled
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

    // Check if user wants this type of notification
    if (!user.notificationTypes.includes(type)) {
      return result;
    }

    // Anti-spam check
    if (!canSendNotification(userId, type)) {
      result.errors.push('Daily notification limit reached');
      return result;
    }

    // Get active device tokens
    const tokens = await prisma.deviceToken.findMany({
      where: { userId, isActive: true },
      select: { token: true },
    });

    if (tokens.length === 0) {
      result.errors.push('No active device tokens');
      return result;
    }

    // Send to all devices in parallel
    const sendPromises = tokens.map(async ({ token }) => {
      const res = await sendFCM(token, payload);
      if (res.success) {
        result.sentCount++;
      } else {
        result.failedCount++;
        if (res.error) result.errors.push(res.error);
      }
    });

    await Promise.all(sendPromises);

    // Log the notification
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

/**
 * Send a notification to ALL users with active device tokens.
 * Used for major breaking news events.
 */
export async function broadcastNotification(
  payload: NotificationPayload,
  type: NotificationType = 'breaking'
): Promise<SendResult> {
  const result: SendResult = { success: false, sentCount: 0, failedCount: 0, errors: [] };

  try {
    // Get all active tokens (batch to avoid memory issues)
    let skip = 0;
    const batchSize = 500;
    let hasMore = true;

    while (hasMore) {
      const tokens = await prisma.deviceToken.findMany({
        where: { isActive: true },
        select: { token: true, userId: true },
        skip,
        take: batchSize,
      });

      if (tokens.length === 0) break;
      hasMore = tokens.length === batchSize;
      skip += batchSize;

      // Send in parallel (max 50 concurrent)
      for (let i = 0; i < tokens.length; i += 50) {
        const batch = tokens.slice(i, i + 50);
        const promises = batch.map(async ({ token, userId }) => {
          // Check per-user limits
          if (!canSendNotification(userId, type)) return;

          const res = await sendFCM(token, payload);
          if (res.success) {
            result.sentCount++;
            incrementNotificationCount(userId);
          } else {
            result.failedCount++;
          }
        });

        await Promise.all(promises);
      }
    }

    // Log broadcast
    if (result.sentCount > 0) {
      await prisma.notificationLog.create({
        data: {
          userId: null, // null = broadcast
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

    console.log(`[FCM] Broadcast: sent=${result.sentCount}, failed=${result.failedCount}`);
    return result;
  } catch (error: any) {
    result.errors.push(error.message);
    return result;
  }
}

// ============ 1. BREAKING NEWS NOTIFICATION ============

/**
 * Check for breaking news articles and send notifications.
 * Should be called periodically (e.g., every 15-30 minutes via cron).
 *
 * Logic:
 * - Get articles with high engagement from the last 3 hours
 * - Filter using isBreakingNews() criteria
 * - Skip articles already sent as notifications (check logs)
 * - Send to users who have "breaking" notifications enabled
 */
export async function checkAndSendBreakingNews(): Promise<{
  checked: number;
  sent: number;
}> {
  let checked = 0;
  let sent = 0;

  try {
    if (!FCM_SERVER_KEY) {
      console.log('[FCM] Breaking news check skipped: FCM not configured');
      return { checked: 0, sent: 0 };
    }

    // Get recent articles with engagement
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

    // Get recently notified article URLs (last 3 hours) to avoid duplicates
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

      // Skip if already notified
      if (notifiedUrls.has(article.url)) continue;

      // Check if qualifies as breaking news
      if (!isBreakingNews(article)) continue;

      // Prepare notification
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

      // Broadcast to all users with breaking news enabled
      const result = await broadcastNotification(payload, 'breaking');

      if (result.success) {
        sent++;
        console.log(`[FCM] Breaking news sent: "${article.title.substring(0, 50)}..."`);
      }

      // Rate limit: max 1 breaking notification per check cycle
      if (sent >= 1) break;
    }

    console.log(`[FCM] Breaking news check: ${checked} articles checked, ${sent} notifications sent`);
  } catch (error: any) {
    console.error('[FCM] Breaking news check error:', error.message);
  }

  return { checked, sent };
}

// ============ 2. PERSONALIZED NOTIFICATION ============

/**
 * Send personalized notifications based on user interests.
 * Finds top articles in user's preferred categories and sends alerts.
 */
export async function sendPersonalizedNotifications(): Promise<{
  usersProcessed: number;
  notificationsSent: number;
}> {
  let usersProcessed = 0;
  let notificationsSent = 0;

  try {
    if (!FCM_SERVER_KEY) return { usersProcessed: 0, notificationsSent: 0 };

    // Get users who want personalized notifications and have device tokens
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
      take: 100, // Process max 100 users at a time
    });

    for (const user of users) {
      usersProcessed++;

      // Check daily limit
      if (!canSendNotification(user.id, 'personalized')) continue;

      // Get top trending articles in user's preferred categories
      const categoryArticles = await prisma.article.findMany({
        where: {
          category: { in: user.preferredCategories },
          trendingScore: { gt: 30 }, // Only high-scoring articles
          publishedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) }, // Last 6 hours
          expiresAt: { gte: new Date() },
        },
        orderBy: { trendingScore: 'desc' },
        take: 1,
      });

      if (categoryArticles.length === 0) continue;

      const article = categoryArticles[0];

      // Skip if already notified this user about this article
      const alreadyNotified = await prisma.notificationLog.findFirst({
        where: {
          userId: user.id,
          articleUrl: article.url,
          sentAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) },
        },
      });
      if (alreadyNotified) continue;

      // Send notification
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
      `[FCM] Personalized: ${usersProcessed} users processed, ${notificationsSent} sent`
    );
  } catch (error: any) {
    console.error('[FCM] Personalized notifications error:', error.message);
  }

  return { usersProcessed, notificationsSent };
}

// ============ 3. DAILY DIGEST ============

/**
 * Send a daily digest notification with top 5 trending articles.
 * Only sends if user hasn't received one in the last 20 hours.
 */
export async function sendDailyDigest(userId?: string): Promise<{
  sent: number;
}> {
  let sent = 0;

  try {
    if (!FCM_SERVER_KEY) return { sent: 0 };

    // Get top 5 trending articles
    const topArticles = await getTrendingArticles(5);
    if (topArticles.length === 0) return { sent: 0 };

    // Build digest body
    const digestBody = topArticles
      .slice(0, 5)
      .map((a, i) => `${i + 1}. ${a.title}`)
      .join('\n');

    const payload: NotificationPayload = {
      title: '📋 ملخص أخبار اليوم',
      body: digestBody.substring(0, 200) + (digestBody.length > 200 ? '...' : ''),
      icon: '/favicon-news.png',
      url: '/', // Link to home page
      data: {
        type: 'digest',
        articleCount: String(topArticles.length),
      },
    };

    if (userId) {
      // Send to specific user
      const result = await sendToUser(userId, payload, 'digest');
      if (result.success) sent++;
    } else {
      // Send to all users who want digest
      const users = await prisma.user.findMany({
        where: {
          notificationEnabled: true,
          notificationTypes: { has: 'digest' },
          deviceTokens: { some: { isActive: true } },
        },
        select: { id: true },
      });

      for (const user of users) {
        // Check cooldown: skip if digest sent in last 20 hours
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
          // Update digest tracking
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

    console.log(`[FCM] Daily digest: ${sent} sent`);
  } catch (error: any) {
    console.error('[FCM] Daily digest error:', error.message);
  }

  return { sent };
}

// ============ DEVICE TOKEN MANAGEMENT ============

/**
 * Register a new device token for push notifications.
 */
export async function registerDeviceToken(
  userId: string,
  token: string,
  platform: string = 'web',
  userAgent?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.deviceToken.upsert({
      where: { token },
      update: {
        userId,
        platform,
        userAgent,
        isActive: true,
      },
      create: {
        userId,
        token,
        platform,
        userAgent,
      },
    });

    console.log(`[FCM] Device registered: ${token.substring(0, 12)}... for user ${userId}`);
    return { success: true };
  } catch (error: any) {
    console.error('[FCM] Device registration error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Unregister a device token.
 */
export async function unregisterDeviceToken(
  token: string
): Promise<{ success: boolean }> {
  try {
    await prisma.deviceToken.deleteMany({ where: { token } });
    return { success: true };
  } catch {
    return { success: false };
  }
}

// ============ INITIALIZATION CHECK ============

if (!FCM_SERVER_KEY) {
  console.warn(
    '[FCM] FCM_SERVER_KEY not set. Push notifications are disabled.' +
    '\n     To enable: Add FCM_SERVER_KEY to your .env file.' +
    '\n     Get it from: Firebase Console > Project Settings > Cloud Messaging'
  );
} else {
  console.log(`[FCM] ✅ Configured with key (${FCM_SERVER_KEY.substring(0, 8)}...)`);
}
