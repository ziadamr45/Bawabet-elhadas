'use client';

import { Newspaper } from 'lucide-react';
import { CATEGORIES } from '@/lib/utils';

export default function Footer() {
  return (
    <footer className="bg-gray-50 dark:bg-[#171717] border-t border-gray-200 dark:border-gray-700 mt-12">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <Newspaper className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">أخبار اليوم</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              منصة أخبار عربية شاملة تجمع الأخبار من مصادر متعددة ومتنوعة لتوفير تغطية إخبارية متكاملة.
            </p>
          </div>

          {/* Categories */}
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white mb-3">التصنيفات</h4>
            <ul className="space-y-1.5">
              {CATEGORIES.slice(0, 6).map((cat) => (
                <li key={cat.id}>
                  <span className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors">
                    {cat.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* More categories */}
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white mb-3">المزيد</h4>
            <ul className="space-y-1.5">
              {CATEGORIES.slice(6).map((cat) => (
                <li key={cat.id}>
                  <span className="text-sm text-gray-500 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 cursor-pointer transition-colors">
                    {cat.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Info */}
          <div>
            <h4 className="font-bold text-gray-900 dark:text-white mb-3">معلومات</h4>
            <ul className="space-y-1.5">
              <li><span className="text-sm text-gray-500 dark:text-gray-400">سياسة الخصوصية</span></li>
              <li><span className="text-sm text-gray-500 dark:text-gray-400">شروط الاستخدام</span></li>
              <li><span className="text-sm text-gray-500 dark:text-gray-400">اتصل بنا</span></li>
              <li><span className="text-sm text-gray-500 dark:text-gray-400">من نحن</span></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 mt-6 pt-6 text-center">
          <p className="text-xs text-gray-400 dark:text-gray-500">
            © 2026 أخبار اليوم - جميع الحقوق محفوظة. مدعوم بالذكاء الاصطناعي
          </p>
        </div>
      </div>
    </footer>
  );
}
