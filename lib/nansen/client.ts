import { execSync } from "child_process";
import type { NansenCliResult } from "./types";

// ── TTL Cache ────────────────────────────────────────────────────────

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

const DEFAULT_TTL_MS = 300_000; // 5 min

// Commands that should never be cached
const NEVER_CACHE = ["trade quote", "trade execute"];

// Map config shorthand keys to command substrings
const ENDPOINT_KEY_MAP: Record<string, string> = {
  "sm-dex-trades": "dex-trades",
  "sm-netflow": "netflow",
  "sm-holdings": "holdings",
  "sm-dcas": "dcas",
  "sm-perp-trades": "perp-trades",
  "token-info": "token info",
  "token-flow": "flow-intelligence",
  "token-dex-trades": "token dex-trades",
};

export function getCacheTtl(command: string, perEndpoint?: Record<string, number>): number {
  if (NEVER_CACHE.some((nc) => command.includes(nc))) return 0;
  if (perEndpoint) {
    for (const [key, ttl] of Object.entries(perEndpoint)) {
      // Try direct match first, then mapped match
      const matchStr = ENDPOINT_KEY_MAP[key] ?? key;
      if (command.includes(matchStr)) return ttl;
    }
  }
  return DEFAULT_TTL_MS;
}

export function invalidateCacheForToken(tokenAddress: string): void {
  for (const key of cache.keys()) {
    if (key.includes(tokenAddress)) {
      cache.delete(key);
    }
  }
}

export function clearCache(): void {
  cache.clear();
}

export function getCacheStats(): { size: number; keys: string[] } {
  return { size: cache.size, keys: [...cache.keys()] };
}

// ── CLI Executor ─────────────────────────────────────────────────────

export interface NansenClientOptions {
  defaultTtlMs?: number;
  perEndpointTtl?: Record<string, number>;
  maxRetries?: number;
  retryDelayMs?: number;
}

const DEFAULT_OPTIONS: Required<NansenClientOptions> = {
  defaultTtlMs: DEFAULT_TTL_MS,
  perEndpointTtl: {},
  maxRetries: 1,
  retryDelayMs: 5000,
};

let clientOptions: Required<NansenClientOptions> = { ...DEFAULT_OPTIONS };

export function configureClient(options: NansenClientOptions): void {
  clientOptions = { ...DEFAULT_OPTIONS, ...options };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execNansenCli(command: string): string {
  const fullCommand = `nansen ${command}`;
  const output = execSync(fullCommand, {
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env },
  });
  return output.trim();
}

function parseCliOutput<T>(raw: string): T {
  // Nansen CLI outputs JSON — parse it directly
  // If the output contains non-JSON prefix (e.g. progress lines), extract the JSON part
  const jsonStart = raw.indexOf("{");
  const jsonArrayStart = raw.indexOf("[");

  let start: number;
  if (jsonStart === -1 && jsonArrayStart === -1) {
    throw new Error(`No JSON found in CLI output: ${raw.substring(0, 200)}`);
  } else if (jsonStart === -1) {
    start = jsonArrayStart;
  } else if (jsonArrayStart === -1) {
    start = jsonStart;
  } else {
    start = Math.min(jsonStart, jsonArrayStart);
  }

  const jsonStr = raw.substring(start);
  return JSON.parse(jsonStr) as T;
}

export async function nansenCliCall<T>(
  command: string,
  options?: { skipCache?: boolean },
): Promise<NansenCliResult<T>> {
  const ttl = getCacheTtl(command, clientOptions.perEndpointTtl);

  // Check cache (unless skip requested or ttl is 0)
  if (!options?.skipCache && ttl > 0) {
    const cached = cache.get(command);
    if (cached && cached.expiresAt > Date.now()) {
      return {
        success: true,
        data: cached.data as T,
        error: null,
        cached: true,
        command,
      };
    }
  }

  // Execute with retry
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= clientOptions.maxRetries; attempt++) {
    try {
      const raw = execNansenCli(command);
      const parsed = parseCliOutput<T>(raw);

      // Store in cache if ttl > 0
      if (ttl > 0) {
        cache.set(command, {
          data: parsed,
          expiresAt: Date.now() + ttl,
        });
      }

      return {
        success: true,
        data: parsed,
        error: null,
        cached: false,
        command,
      };
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);

      // Don't retry trade execute (risk of double trade)
      if (command.includes("trade execute")) {
        break;
      }

      // Wait before retry (except on last attempt)
      if (attempt < clientOptions.maxRetries) {
        await sleep(clientOptions.retryDelayMs);
      }
    }
  }

  return {
    success: false,
    data: null,
    error: lastError,
    cached: false,
    command,
  };
}
