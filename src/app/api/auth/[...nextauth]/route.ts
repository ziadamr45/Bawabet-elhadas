// Auth route disabled - Google login removed
// If you need to re-enable auth, install next-auth and configure providers
import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ error: 'Auth disabled' }, { status: 404 });
}

export async function POST() {
  return NextResponse.json({ error: 'Auth disabled' }, { status: 404 });
}
