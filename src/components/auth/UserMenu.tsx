'use client';

import { useSession, signIn, signOut } from 'next-auth/react';
import { User, LogIn, LogOut, Loader2, BookOpen, Star, Eye } from 'lucide-react';
import { useState, useEffect } from 'react';

interface UserStats {
  totalClicks: number;
  totalViews: number;
  totalReadTimeSeconds: number;
  topCategories: { category: string; count: number }[];
}

export default function UserMenu() {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const [stats, setStats] = useState<UserStats | null>(null);

  useEffect(() => {
    if (session?.user && menuOpen) {
      fetch(`/api/interactions?userId=${(session.user as any).id}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.stats) setStats(data.stats);
        })
        .catch(() => {});
    }
  }, [session, menuOpen]);

  if (status === 'loading') {
    return (
      <div className="p-2">
        <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!session) {
    return (
      <button
        onClick={() => signIn('google')}
        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
      >
        <LogIn className="w-4 h-4" />
        <span className="hidden sm:inline">تسجيل الدخول</span>
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        {session.user?.image ? (
          <img src={session.user.image} alt="" className="w-7 h-7 rounded-full" />
        ) : (
          <div className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center">
            <User className="w-4 h-4 text-white" />
          </div>
        )}
      </button>

      {menuOpen && (
        <div className="absolute left-0 top-full mt-2 w-72 bg-white dark:bg-[#303134] rounded-xl shadow-2xl border border-gray-200 dark:border-gray-600 z-50 overflow-hidden">
          {/* User Info */}
          <div className="p-4 border-b border-gray-100 dark:border-gray-700">
            <div className="flex items-center gap-3">
              {session.user?.image ? (
                <img src={session.user.image} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                  <User className="w-6 h-6 text-white" />
                </div>
              )}
              <div className="min-w-0">
                <p className="font-bold text-sm text-gray-900 dark:text-white truncate">{session.user?.name}</p>
                <p className="text-xs text-gray-400 truncate">{session.user?.email}</p>
              </div>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <div className="p-3 border-b border-gray-100 dark:border-gray-700">
              <p className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2">إحصائيات القراءة</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                  <Eye className="w-4 h-4 mx-auto text-blue-500 mb-1" />
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{stats.totalViews}</p>
                  <p className="text-[10px] text-gray-400">مشاهدة</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                  <BookOpen className="w-4 h-4 mx-auto text-green-500 mb-1" />
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{stats.totalClicks}</p>
                  <p className="text-[10px] text-gray-400">قراءة</p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                  <Star className="w-4 h-4 mx-auto text-yellow-500 mb-1" />
                  <p className="text-sm font-bold text-gray-900 dark:text-white">{Math.round((stats.totalReadTimeSeconds || 0) / 60)}</p>
                  <p className="text-[10px] text-gray-400">دقيقة</p>
                </div>
              </div>
              {stats.topCategories && stats.topCategories.length > 0 && (
                <div className="mt-2">
                  <p className="text-[10px] text-gray-400 mb-1">التصنيفات المفضلة</p>
                  <div className="flex flex-wrap gap-1">
                    {stats.topCategories.slice(0, 3).map((cat) => (
                      <span key={cat.category} className="px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded text-[10px]">
                        {cat.category}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="p-2">
            <button
              onClick={() => { signOut(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
              تسجيل الخروج
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
