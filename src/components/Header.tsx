'use client';

import { Search, Menu, X, Newspaper, Globe } from 'lucide-react';
import { CATEGORIES, CategoryId, COUNTRIES, CountryCode } from '@/lib/utils';
import ThemeToggle from './ThemeToggle';
import UserMenu from './auth/UserMenu';
import { useState } from 'react';

interface HeaderProps {
  activeCategory: CategoryId;
  onCategoryChange: (category: CategoryId) => void;
  onSearchOpen: () => void;
  country: CountryCode;
  onCountryChange: (country: CountryCode) => void;
}

export default function Header({ activeCategory, onCategoryChange, onSearchOpen, country, onCountryChange }: HeaderProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [countryMenuOpen, setCountryMenuOpen] = useState(false);

  const currentCountry = COUNTRIES.find((c) => c.code === country) || COUNTRIES[0];

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-[#202124] border-b border-gray-200 dark:border-gray-700 shadow-sm">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => onCategoryChange('home')}>
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Newspaper className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white hidden sm:block">
              بوابة الحدث
            </h1>
          </div>

          {/* Center - Category Tabs (Desktop) */}
          <nav className="hidden lg:flex items-center gap-1 overflow-x-auto">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => onCategoryChange(cat.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-all ${
                  activeCategory === cat.id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </nav>

          {/* Left actions */}
          <div className="flex items-center gap-2">
            {/* Country selector */}
            <div className="relative">
              <button
                onClick={() => setCountryMenuOpen(!countryMenuOpen)}
                className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-sm text-gray-600 dark:text-gray-300"
              >
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">{currentCountry.label}</span>
              </button>
              {countryMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-40 bg-white dark:bg-[#303134] rounded-lg shadow-xl border border-gray-200 dark:border-gray-600 z-50 max-h-60 overflow-y-auto">
                  {COUNTRIES.map((c) => (
                    <button
                      key={c.code}
                      onClick={() => {
                        onCountryChange(c.code as CountryCode);
                        setCountryMenuOpen(false);
                      }}
                      className={`w-full text-right px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        country === c.code ? 'text-blue-600 font-bold bg-blue-50 dark:bg-blue-900/20' : 'text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <UserMenu />
            <ThemeToggle />
            <button
              onClick={onSearchOpen}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              aria-label="بحث"
            >
              <Search className="w-5 h-5 text-gray-600 dark:text-gray-300" />
            </button>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors lg:hidden"
              aria-label="القائمة"
            >
              {mobileMenuOpen ? (
                <X className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              ) : (
                <Menu className="w-5 h-5 text-gray-600 dark:text-gray-300" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-[#202124]">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => {
                    onCategoryChange(cat.id);
                    setMobileMenuOpen(false);
                  }}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all ${
                    activeCategory === cat.id
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
