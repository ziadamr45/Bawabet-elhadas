'use client';

import { ReactNode } from 'react';

// Auth provider simplified - no longer wraps with SessionProvider
// Google login has been removed
export default function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
