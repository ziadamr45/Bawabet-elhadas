import { NextRequest, NextResponse } from 'next/server';
import { registerDeviceToken, unregisterDeviceToken } from '@/lib/notifications';

// ============ SUBSCRIBE: Register Web Push subscription ============
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, subscription, platform } = body;

    // Support both old FCM format (token) and new Web Push format (subscription)
    if (body.token && !body.subscription) {
      // Legacy FCM token - return friendly error
      return NextResponse.json(
        { error: 'FCM format is deprecated. Please use Web Push subscription format.' },
        { status: 400 }
      );
    }

    if (!userId || !subscription) {
      return NextResponse.json(
        { error: 'userId and subscription are required. subscription = { endpoint, keys: { p256dh, auth } }' },
        { status: 400 }
      );
    }

    // Validate subscription format
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { error: 'Invalid subscription format. Must include endpoint and keys (p256dh, auth).' },
        { status: 400 }
      );
    }

    const result = await registerDeviceToken(
      userId,
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
      },
      platform || 'web',
      request.headers.get('user-agent') || undefined
    );

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Subscription registered for push notifications' });
    }

    return NextResponse.json(
      { error: result.error || 'Failed to register subscription' },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('[Notifications] Subscribe error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}

// ============ UNSUBSCRIBE: Remove Web Push subscription ============
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { endpoint, token } = body;

    // Support both old and new format
    const targetEndpoint = endpoint || token;

    if (!targetEndpoint) {
      return NextResponse.json({ error: 'endpoint is required' }, { status: 400 });
    }

    const result = await unregisterDeviceToken(targetEndpoint);

    return NextResponse.json({
      success: result.success,
      message: result.success ? 'Subscription unregistered' : 'Failed to unregister',
    });
  } catch (error: any) {
    console.error('[Notifications] Unsubscribe error:', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
