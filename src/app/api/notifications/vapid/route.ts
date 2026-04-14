import { NextResponse } from 'next/server';

// ============ VAPID PUBLIC KEY: Returns the public key for client-side subscription ============
export async function GET() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_KEY || '';

  if (!publicKey) {
    return NextResponse.json(
      { error: 'VAPID keys not configured' },
      { status: 503 }
    );
  }

  return NextResponse.json({
    publicKey,
    // Pre-converted to Uint8Array base64 for client convenience
    // Client can use this directly: new Uint8Array([...])
  });
}
