import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// ============ NOTIFICATION SETTINGS ============
// Get or update user notification preferences

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        notificationEnabled: true,
        notificationTypes: true,
        deviceTokens: {
          where: { isActive: true },
          select: { platform: true, createdAt: true },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get notification stats
    const totalSent = await prisma.notificationLog.count({
      where: { userId },
    });

    const recentSent = await prisma.notificationLog.count({
      where: {
        userId,
        sentAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });

    return NextResponse.json({
      enabled: user.notificationEnabled,
      types: user.notificationTypes,
      devices: user.deviceTokens,
      stats: {
        totalSent,
        sentLast24h: recentSent,
      },
    });
  } catch (error: any) {
    console.error('[Notifications] Settings GET error:', error);
    return NextResponse.json({ error: 'Failed to get settings' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, enabled, types } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(enabled !== undefined && { notificationEnabled: enabled }),
        ...(types && {
          notificationTypes: types, // Array: ["breaking", "personalized", "digest"]
        }),
      },
      select: {
        id: true,
        notificationEnabled: true,
        notificationTypes: true,
      },
    });

    return NextResponse.json({
      success: true,
      settings: {
        enabled: user.notificationEnabled,
        types: user.notificationTypes,
      },
    });
  } catch (error: any) {
    console.error('[Notifications] Settings PUT error:', error);
    return NextResponse.json({ error: 'Failed to update settings' }, { status: 500 });
  }
}
