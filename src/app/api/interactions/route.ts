import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateTrendingScore } from '@/lib/trending';

// POST: Track an interaction (click, view, read, share, bookmark)
// Also updates trending scores in real-time
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      articleUrl,
      articleTitle,
      type,
      category,
      source,
      country,
      readTimeSeconds,
      image,
      snippet,
      date,
    } = body;

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

    // ============ Update article metrics ============
    try {
      const article = await prisma.article.findUnique({
        where: { url: articleUrl },
        select: {
          viewCount: true,
          clickCount: true,
          shareCount: true,
          publishedAt: true,
          importanceScore: true,
        },
      });

      if (article) {
        // Increment counters
        const updateData: Record<string, any> = {};

        if (type === 'click') {
          updateData.clickCount = { increment: 1 };
        } else if (type === 'view') {
          updateData.viewCount = { increment: 1 };
        } else if (type === 'share') {
          updateData.shareCount = { increment: 1 };
        }

        // Recalculate trending score in real-time
        const newViewCount = article.viewCount + (type === 'view' ? 1 : 0);
        const newClickCount = article.clickCount + (type === 'click' ? 1 : 0);
        const newShareCount = article.shareCount + (type === 'share' ? 1 : 0);

        const newScore = calculateTrendingScore(
          newViewCount,
          newClickCount,
          newShareCount,
          article.publishedAt,
          article.importanceScore
        );

        updateData.trendingScore = newScore;

        await prisma.article.update({
          where: { url: articleUrl },
          data: updateData,
        }).catch(() => {});

        console.log(
          `[Track] ${type}: "${articleTitle?.substring(0, 40)}..." → ` +
          `score=${newScore} (views=${newViewCount}, clicks=${newClickCount})`
        );
      } else {
        // Article not in DB yet — just increment (don't create a full article)
        // The news fetcher will create it on next cycle
        await prisma.article.upsert({
          where: { url: articleUrl },
          update: {
            ...(type === 'click' ? { clickCount: { increment: 1 } } : {}),
            ...(type === 'view' ? { viewCount: { increment: 1 } } : {}),
            ...(type === 'share' ? { shareCount: { increment: 1 } } : {}),
          },
          create: {
            url: articleUrl,
            title: articleTitle || 'Unknown',
            snippet: snippet || null,
            image: image || null,
            source: source || null,
            category: category || null,
            publishedAt: date ? new Date(date) : new Date(),
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            ...(type === 'click' ? { clickCount: 1 } : {}),
            ...(type === 'view' ? { viewCount: 1 } : {}),
            ...(type === 'share' ? { shareCount: 1 } : {}),
          },
        }).catch(() => {});
      }
    } catch {
      // Ignore article update errors — interaction is still recorded
    }

    // ============ Update reading history for authenticated users ============
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
          articleImage: image || null,
          articleSource: source || null,
          articleCategory: category || null,
          articleSnippet: snippet || null,
          articleDate: date || null,
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
