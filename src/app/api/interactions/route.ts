import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST: Track an interaction (click, view, read, share, bookmark)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, articleUrl, articleTitle, type, category, source, country, readTimeSeconds } = body;

    if (!articleUrl || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Create interaction record
    const interaction = await prisma.interaction.create({
      data: {
        userId: userId || 'anonymous',
        articleUrl,
        articleTitle: articleTitle || '',
        type, // click, view, read, share, bookmark
        category: category || null,
        source: source || null,
        country: country || null,
        readTimeSeconds: readTimeSeconds || 0,
      },
    });

    // Update article metrics if article exists in cache
    try {
      await prisma.article.update({
        where: { url: articleUrl },
        data: {
          ...(type === 'click' ? { clickCount: { increment: 1 } } : {}),
          ...(type === 'view' ? { viewCount: { increment: 1 } } : {}),
          ...(type === 'share' ? { shareCount: { increment: 1 } } : {}),
        },
      }).catch(() => {
        // Article not in cache, ignore
      });
    } catch {
      // Ignore article update errors
    }

    // Update reading history for authenticated users
    if (userId && userId !== 'anonymous') {
      await prisma.readingHistory.upsert({
        where: {
          userId_articleUrl: { userId, articleUrl },
        },
        update: {
          readCount: { increment: 1 },
          totalReadTime: { increment: readTimeSeconds || 0 },
          ...(articleTitle ? { articleTitle } : {}),
          ...(category ? { articleCategory: category } : {}),
          ...(source ? { articleSource: source } : {}),
        },
        create: {
          userId,
          articleUrl,
          articleTitle: articleTitle || '',
          articleImage: body.image || null,
          articleSource: source || null,
          articleCategory: category || null,
          articleSnippet: body.snippet || null,
          articleDate: body.date || null,
          readCount: 1,
          totalReadTime: readTimeSeconds || 0,
          bookmarked: type === 'bookmark',
        },
      }).catch(() => {});
    }

    return NextResponse.json({ success: true, id: interaction.id });
  } catch (error: any) {
    console.error('Interaction tracking error:', error);
    return NextResponse.json({ error: 'Failed to track interaction' }, { status: 500 });
  }
}

// GET: Get user's reading history and stats
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    // Get user stats
    const [totalClicks, totalViews, totalReadTime, categoryStats, recentHistory] = await Promise.all([
      prisma.interaction.count({ where: { userId, type: 'click' } }),
      prisma.interaction.count({ where: { userId, type: 'view' } }),
      prisma.interaction.aggregate({ where: { userId }, _sum: { readTimeSeconds: true } }),
      prisma.interaction.groupBy({
        by: ['category'],
        where: { userId, category: { not: null } },
        _count: { category: true },
        orderBy: { _count: { category: 'desc' } },
        take: 5,
      }),
      prisma.readingHistory.findMany({
        where: { userId },
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
    ]);

    return NextResponse.json({
      stats: {
        totalClicks,
        totalViews,
        totalReadTimeSeconds: totalReadTime._sum.readTimeSeconds || 0,
        topCategories: categoryStats.map((s) => ({
          category: s.category,
          count: s._count.category,
        })),
      },
      history: recentHistory,
    });
  } catch (error: any) {
    console.error('User stats error:', error);
    return NextResponse.json({ error: 'Failed to fetch stats' }, { status: 500 });
  }
}
