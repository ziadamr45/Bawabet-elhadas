'use client';

import { Newspaper, TrendingUp, Globe, Cpu, Heart, DollarSign, Trophy, Palette, GraduationCap, FlaskConical } from 'lucide-react';
import { CategoryId, CATEGORIES } from '@/lib/utils';

interface SidebarProps {
  activeCategory: CategoryId;
  onCategoryChange: (category: CategoryId) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  home: <Newspaper className="w-4 h-4" />,
  trending: <TrendingUp className="w-4 h-4" />,
  politics: <Globe className="w-4 h-4" />,
  economy: <DollarSign className="w-4 h-4" />,
  sports: <Trophy className="w-4 h-4" />,
  technology: <Cpu className="w-4 h-4" />,
  entertainment: <Palette className="w-4 h-4" />,
  health: <Heart className="w-4 h-4" />,
  science: <FlaskConical className="w-4 h-4" />,
  world: <Globe className="w-4 h-4" />,
  culture: <Palette className="w-4 h-4" />,
  education: <GraduationCap className="w-4 h-4" />,
};

export default function Sidebar({ activeCategory, onCategoryChange }: SidebarProps) {
  return (
    <aside className="hidden xl:block w-64 shrink-0">
      <div className="sticky top-20 space-y-4">
        {/* Categories */}
        <div className="bg-white dark:bg-[#303134] rounded-xl border border-gray-100 dark:border-gray-700 p-3">
          <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2 px-2">التصنيفات</h3>
          <nav className="space-y-0.5">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all ${
                  activeCategory === cat.id
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-bold'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                <span className={activeCategory === cat.id ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400'}>
                  {categoryIcons[cat.id]}
                </span>
                {cat.label}
              </button>
            ))}
          </nav>
        </div>

        {/* About */}
        <div className="bg-white dark:bg-[#303134] rounded-xl border border-gray-100 dark:border-gray-700 p-4">
          <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 mb-2">عن أخبار اليوم</h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            منصة أخبار عربية شاملة تجمع الأخبار من مصادر متعددة ومتنوعة باستخدام تقنيات الذكاء الاصطناعي والبحث المتقدم لتوفير تجربة إخبارية متكاملة.
          </p>
        </div>
      </div>
    </aside>
  );
}
