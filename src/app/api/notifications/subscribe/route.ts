import { NextRequest, NextResponse } from 'next/server';
import { registerDeviceToken, unregisterDeviceToken } from '@/lib/notifications';

// ============ SUBSCRIBE: Register device for push notifications ============
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, token, platform, userAgent } = body;

    if (!userId || !token) {
      return NextResponse.json(
        { error: 'userId and token are required' },
        { status: 400 }
      );
    }

    const result = await registerDeviceToken(
      userId,
      token,
      platform || 'web',
      userAgent || request.headers.get('user-agent') || undefined
    );

    if (result.success) {
      return NextResponse.json({ success: true, message: 'Device registered for notifications' });
    }

    return NextResponse.json(
      { error: result.error || 'Failed to register device' },
      { status: 500 }
    );
  } catch (error: any) {
    console.error('[Notifications] Subscribe error:', error);
    return NextResponse.json({ error: 'Failed to subscribe' }, { status: 500 });
  }
}

// ============ UNSUBSCRIBE: Remove device token ============
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { token } = body;

    if (!token) {
      return NextResponse.json({ error: 'token is required' }, { status: 400 });
    }

    const result = await unregisterDeviceToken(token);

    return NextResponse.json({
      success: result.success,
      message: result.success ? 'Device unregistered' : 'Failed to unregister',
    });
  } catch (error: any) {
    console.error('[Notifications] Unsubscribe error:', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
