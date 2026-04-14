import { NextRequest, NextResponse } from 'next/server';
import { sendToUser, broadcastNotification, checkAndSendBreakingNews, sendPersonalizedNotifications } from '@/lib/notifications';

// ============ SEND: Trigger Web Push notifications ============
// Supports: check-breaking, personalized, send, broadcast
// Uses Web Push (VAPID) instead of FCM

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, userId, title, body: notifBody, url, image, type } = body;

    // ============ Auto-detect breaking news ============
    if (action === 'check-breaking') {
      const result = await checkAndSendBreakingNews();
      return NextResponse.json({
        success: true,
        message: `Checked ${result.checked} articles, sent ${result.sent} breaking notifications`,
        ...result,
      });
    }

    // ============ Send personalized to all users ============
    if (action === 'personalized') {
      const result = await sendPersonalizedNotifications();
      return NextResponse.json({
        success: true,
        message: `Processed ${result.usersProcessed} users, sent ${result.notificationsSent} notifications`,
        ...result,
      });
    }

    // ============ Send custom notification to specific user ============
    if (action === 'send' && userId) {
      if (!title) {
        return NextResponse.json({ error: 'title is required' }, { status: 400 });
      }

      const result = await sendToUser(
        userId,
        {
          title,
          body: notifBody || '',
          image: image || undefined,
          url: url || undefined,
        },
        type || 'personalized'
      );

      return NextResponse.json({
        success: result.success,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        errors: result.errors,
      });
    }

    // ============ Broadcast to all users ============
    if (action === 'broadcast') {
      if (!title) {
        return NextResponse.json({ error: 'title is required' }, { status: 400 });
      }

      const result = await broadcastNotification(
        {
          title,
          body: notifBody || '',
          image: image || undefined,
          url: url || undefined,
        },
        type || 'breaking'
      );

      return NextResponse.json({
        success: result.success,
        sentCount: result.sentCount,
        failedCount: result.failedCount,
        errors: result.errors,
      });
    }

    return NextResponse.json({ error: 'Unknown action. Use: check-breaking, personalized, send, broadcast' }, { status: 400 });
  } catch (error: any) {
    console.error('[Notifications] Send error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
