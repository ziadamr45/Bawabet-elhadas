// ============================================================
// بوابة الحدث - Z-AI SDK Helper
// Creates ZAI instances using environment variables (works on Vercel)
// Falls back to file-based config for local CLI usage
// ============================================================

import ZAI from 'z-ai-web-dev-sdk';

// Configuration from environment variables
const ZAI_BASE_URL = process.env.Z_AI_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4';
const ZAI_API_KEY = process.env.Z_AI_API_KEY || '';

// Singleton instance for reuse
let zaiInstance: InstanceType<typeof ZAI> | null = null;

/**
 * Get a Z-AI SDK instance.
 * - First tries environment variables (works on Vercel and all deployments)
 * - Falls back to ZAI.create() which reads from .z-ai-config file
 */
export async function getZAI(): Promise<any> {
  if (zaiInstance) return zaiInstance;

  // Try environment variables first (works on Vercel)
  if (ZAI_API_KEY) {
    try {
      // Directly instantiate ZAI with config (bypasses file-based config)
      // @ts-ignore - constructor is private in types but accessible at runtime
      zaiInstance = new ZAI({ baseUrl: ZAI_BASE_URL, apiKey: ZAI_API_KEY });
      console.log('[ZAI] Initialized with environment variables');
      return zaiInstance;
    } catch (error: any) {
      console.error('[ZAI] Failed to init from env vars:', error.message);
    }
  }

  // Fallback to config file (local development with .z-ai-config)
  try {
    zaiInstance = await ZAI.create();
    console.log('[ZAI] Initialized from config file');
    return zaiInstance;
  } catch (error: any) {
    console.error('[ZAI] Config file not found either:', error.message);
    throw new Error(
      'Z-AI SDK configuration not found. Set Z_AI_API_KEY env var or create .z-ai-config file.'
    );
  }
}

/**
 * Reset the singleton (useful for testing or when config changes)
 */
export function resetZAI(): void {
  zaiInstance = null;
}
