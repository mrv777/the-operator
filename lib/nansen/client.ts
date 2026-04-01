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
  // Nansen CLI outputs JSON for research commands — parse it directly
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
  const parsed = JSON.parse(jsonStr);

  // Nansen CLI wraps responses in { success: boolean, data: <payload> }.
  // Unwrap so callers get the inner payload typed as T.
  if (
    parsed &&
    typeof parsed === "object" &&
    "success" in parsed &&
    "data" in parsed
  ) {
    if (!parsed.success) {
      throw new Error(parsed.error ?? parsed.message ?? "CLI returned success=false");
    }
    return parsed.data as T;
  }

  return parsed as T;
}

// ── Trade CLI text parser ───────────────────────────────────────────
// Trade commands output human-readable text, not JSON.

export interface ParsedTradeQuote {
  quoteId: string;
  inputAmount: number;
  outputAmount: number;
  inUsd: number;
  outUsd: number;
  priceImpactPct: number;
  tradingFeeUsd: number;
  networkFeeUsd: number;
  source: string;
}

export interface ParsedTradeExecution {
  txHash: string;
  status: "success" | "failed";
  message: string;
}

function parseNumber(s: string): number {
  return parseFloat(s.replace(/[$,]/g, ""));
}

export function parseTradeQuoteOutput(raw: string): ParsedTradeQuote {
  // Extract Quote ID — required, fail hard if missing
  const quoteIdMatch = raw.match(/Quote ID:\s*(\S+)/);
  if (!quoteIdMatch) {
    throw new Error(
      `Nansen CLI output format may have changed — could not parse Quote ID.\n` +
      `Raw output (first 500 chars):\n${raw.substring(0, 500)}\n\n` +
      `Check for a nansen-cli update: nansen --version (current: see changelog)`,
    );
  }

  // Parse the first quote block (best quote)
  const sourceMatch = raw.match(/Quote #1 \((\w+)\)/);
  const inputMatch = raw.match(/Input:\s+(\d+)\s*→/);
  const outputMatch = raw.match(/Output:\s+(\d+)\s*→/);
  const inUsdMatch = raw.match(/In USD:\s+\$([0-9.e+-]+)/);
  const outUsdMatch = raw.match(/Out USD:\s+\$([0-9.e+-]+)/);
  const impactMatch = raw.match(/Price [Ii]mpact[^:]*:\s+([0-9.e+-]+)%/);
  const tradingFeeMatch = raw.match(/Trading Fee:\s+\$([0-9.e+-]+)/);
  const networkFeeMatch = raw.match(/Network Fee:\s+\$([0-9.e+-]+)/);

  // Price impact may show as warning line instead
  const impactWarnMatch = raw.match(/Price impact is ([0-9.e+-]+)%/);

  // Critical fields — refuse to trade if we can't parse USD values
  const missingFields: string[] = [];
  if (!inUsdMatch) missingFields.push("In USD");
  if (!outUsdMatch) missingFields.push("Out USD");
  if (!outputMatch) missingFields.push("Output amount");

  if (missingFields.length > 0) {
    throw new Error(
      `Nansen CLI output format may have changed — could not parse: ${missingFields.join(", ")}.\n` +
      `Raw output (first 500 chars):\n${raw.substring(0, 500)}\n\n` +
      `This is a safety stop to prevent trading with bad data.\n` +
      `Check for a nansen-cli update or report at https://github.com/nansen-ai/nansen-cli/issues`,
    );
  }

  return {
    quoteId: quoteIdMatch[1],
    inputAmount: inputMatch ? parseInt(inputMatch[1], 10) : 0,
    outputAmount: parseInt(outputMatch![1], 10),
    inUsd: parseNumber(inUsdMatch![1]),
    outUsd: parseNumber(outUsdMatch![1]),
    priceImpactPct: impactMatch
      ? parseNumber(impactMatch[1])
      : impactWarnMatch
        ? parseNumber(impactWarnMatch[1])
        : 0,
    tradingFeeUsd: tradingFeeMatch ? parseNumber(tradingFeeMatch[1]) : 0,
    networkFeeUsd: networkFeeMatch ? parseNumber(networkFeeMatch[1]) : 0,
    source: sourceMatch?.[1] ?? "unknown",
  };
}

export function parseTradeExecuteOutput(raw: string): ParsedTradeExecution {
  // Look for tx hash (Solana base58 signatures are 87-88 chars)
  const txMatch = raw.match(/(?:tx_hash|signature|Transaction|tx)[:\s]+([A-HJ-NP-Za-km-z1-9]{43,88})/i)
    ?? raw.match(/([A-HJ-NP-Za-km-z1-9]{80,88})/); // fallback: grab long base58 string

  const isFailed = /fail|error|rejected|reverted/i.test(raw);

  // If we can't find a tx hash and it doesn't look like a failure, the format may have changed
  if (!txMatch && !isFailed) {
    throw new Error(
      `Nansen CLI output format may have changed — could not parse tx hash from execute output.\n` +
      `Raw output (first 500 chars):\n${raw.substring(0, 500)}\n\n` +
      `This is a safety stop to prevent untracked trades.\n` +
      `Check for a nansen-cli update or report at https://github.com/nansen-ai/nansen-cli/issues`,
    );
  }

  return {
    txHash: txMatch?.[1] ?? "",
    status: isFailed ? "failed" : "success",
    message: raw.trim(),
  };
}

// Raw CLI call that returns unparsed text (for trade commands)
export function nansenCliCallRaw(command: string): string {
  return execNansenCli(command);
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
