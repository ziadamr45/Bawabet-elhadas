// ============================================================
// بوابة الحدث - Z-AI SDK Helper
// Creates ZAI instances using environment variables (works on Vercel)
// Falls back to file-based config for local CLI usage
// ============================================================

import ZAI from 'z-ai-web-dev-sdk';

// Configuration from environment variables
const ZAI_BASE_URL = process.env.Z_AI_BASE_URL || '';
const ZAI_API_KEY = process.env.Z_AI_API_KEY || '';
const ZAI_CHAT_ID = process.env.Z_AI_CHAT_ID || '';
const ZAI_USER_ID = process.env.Z_AI_USER_ID || '';
const ZAI_TOKEN = process.env.Z_AI_TOKEN || '';

// Singleton instance for reuse
let zaiInstance: any = null;

/**
 * Get a Z-AI SDK instance.
 * Priority:
 * 1. Full env vars (Z_AI_BASE_URL + Z_AI_API_KEY + Z_AI_TOKEN) - works on Vercel
 * 2. ZAI.create() which reads from .z-ai-config file - local dev
 */
export async function getZAI(): Promise<any> {
  if (zaiInstance) return zaiInstance;

  // Try environment variables first (works on Vercel)
  if (ZAI_BASE_URL && ZAI_API_KEY) {
    try {
      const config: Record<string, string> = {
        baseUrl: ZAI_BASE_URL,
        apiKey: ZAI_API_KEY,
      };
      if (ZAI_CHAT_ID) config.chatId = ZAI_CHAT_ID;
      if (ZAI_USER_ID) config.userId = ZAI_USER_ID;
      if (ZAI_TOKEN) config.token = ZAI_TOKEN;

      // @ts-ignore - constructor is private in types but accessible at runtime
      zaiInstance = new ZAI(config);
      return zaiInstance;
    } catch (error: any) {
      console.error('[ZAI] Failed to init from env vars:', error.message);
    }
  }

  // Fallback to config file (local development with .z-ai-config)
  try {
    zaiInstance = await ZAI.create();
    return zaiInstance;
  } catch (error: any) {
    console.error('[ZAI] Config file not found either:', error.message);
    throw new Error(
      'Z-AI SDK configuration not found. Set Z_AI_BASE_URL and Z_AI_API_KEY env vars or create .z-ai-config file.'
    );
  }
}

/**
 * Reset the singleton (useful for testing or when config changes)
 */
export function resetZAI(): void {
  zaiInstance = null;
}
