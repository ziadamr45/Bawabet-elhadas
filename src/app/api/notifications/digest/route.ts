import { NextRequest, NextResponse } from 'next/server';
import { sendDailyDigest } from '@/lib/notifications';

// ============ DAILY DIGEST ============
// Send daily digest notification with top 5 trending news

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (userId) {
      // Send to specific user
      const result = await sendDailyDigest(userId);
      return NextResponse.json({
        success: result.sent > 0,
        sent: result.sent,
        message: userId
          ? `Digest sent to user ${userId}`
          : 'Digest sent to all subscribed users',
      });
    }

    // Send to all users
    const result = await sendDailyDigest();

    return NextResponse.json({
      success: result.sent > 0,
      sent: result.sent,
      message: `Daily digest sent to ${result.sent} users`,
    });
  } catch (error: any) {
    console.error('[Notifications] Digest error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
