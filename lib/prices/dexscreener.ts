// DexScreener free API — no auth, no rate-limit key needed.
// Docs: https://docs.dexscreener.com

const BASE_URL = "https://api.dexscreener.com/tokens/v1/solana";

export interface DexScreenerTokenData {
  priceUsd: number;
  liquidityUsd: number;
  volume24hUsd: number;
  fdvUsd: number | null;
  marketCapUsd: number | null;
  pairCreatedAt: string | null; // ISO string (converted from Unix ms)
}

interface DexScreenerPair {
  baseToken: { address: string; symbol: string };
  quoteToken: { address: string; symbol: string };
  priceUsd: string | null;
  liquidity?: { usd: number | null };
  volume?: { h24: number | null };
  fdv?: number | null;
  marketCap?: number | null;
  pairCreatedAt?: number | null;
}

/**
 * Fetch token market data from DexScreener (free, no auth).
 * Aggregates liquidity and volume across all pairs for the token.
 * Uses the highest-liquidity pair for price, mcap, FDV, and creation date.
 */
export async function getDexScreenerToken(
  tokenAddress: string,
): Promise<{ success: true; data: DexScreenerTokenData } | { success: false; error: string }> {
  try {
    const res = await fetch(`${BASE_URL}/${tokenAddress}`, {
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return { success: false, error: `DexScreener HTTP ${res.status}` };
    }

    const pairs = (await res.json()) as DexScreenerPair[];

    if (!Array.isArray(pairs) || pairs.length === 0) {
      return { success: false, error: "No pairs found on DexScreener" };
    }

    // Pick the highest-liquidity pair for price/mcap/fdv/age
    const best = pairs.reduce((a, b) =>
      ((a.liquidity?.usd ?? 0) >= (b.liquidity?.usd ?? 0) ? a : b),
    );

    // Aggregate liquidity and volume across all pairs
    const totalLiquidityUsd = pairs.reduce(
      (sum, p) => sum + (p.liquidity?.usd ?? 0), 0,
    );
    const totalVolume24hUsd = pairs.reduce(
      (sum, p) => sum + (p.volume?.h24 ?? 0), 0,
    );

    const createdAtMs = best.pairCreatedAt;
    const pairCreatedAt = createdAtMs
      ? new Date(createdAtMs).toISOString()
      : null;

    return {
      success: true,
      data: {
        priceUsd: parseFloat(best.priceUsd ?? "0"),
        liquidityUsd: totalLiquidityUsd,
        volume24hUsd: totalVolume24hUsd,
        fdvUsd: best.fdv ?? null,
        marketCapUsd: best.marketCap ?? null,
        pairCreatedAt,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
