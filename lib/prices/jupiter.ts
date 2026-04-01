// Use lite-api (no key required, deprecation postponed indefinitely).
// When JUPITER_API_KEY is set, upgrade to api.jup.ag automatically.
const LITE_API = "https://lite-api.jup.ag/price/v3";
const PAID_API = "https://api.jup.ag/price/v3";

// Well-known Solana token addresses
export const KNOWN_TOKENS = {
  SOL: "So11111111111111111111111111111111111111112",
  USDC: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
} as const;

export interface JupiterPriceData {
  usdPrice: number;
  blockId: number;
  decimals: number;
  priceChange24h: number | null;
  createdAt: string;
  liquidity: number;
}

// lite-api returns flat: { [mint]: JupiterPriceData }
// api.jup.ag may wrap in { data: ... } — handle both
type JupiterRawResponse =
  | Record<string, JupiterPriceData>
  | { data: Record<string, JupiterPriceData> };

/**
 * Fetch real-time prices for one or more Solana token mint addresses.
 * Falls back to lite-api.jup.ag (no auth) unless JUPITER_API_KEY is set.
 */
export async function getJupiterPrices(
  mintAddresses: string[],
): Promise<Record<string, number>> {
  if (mintAddresses.length === 0) return {};

  const apiKey = process.env.JUPITER_API_KEY;
  const baseUrl = apiKey ? PAID_API : LITE_API;
  const ids = mintAddresses.join(",");
  const url = `${baseUrl}?ids=${ids}`;

  const headers: Record<string, string> = {};
  if (apiKey) {
    headers["x-api-key"] = apiKey;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Jupiter Price API error: ${res.status} ${res.statusText}`);
  }

  const json = (await res.json()) as JupiterRawResponse;

  // Normalize: unwrap { data: ... } if present, otherwise use as-is
  const raw = json as Record<string, unknown>;
  const entries: Record<string, JupiterPriceData> =
    raw.data && typeof raw.data === "object" && !Array.isArray(raw.data)
      ? (raw.data as Record<string, JupiterPriceData>)
      : (json as Record<string, JupiterPriceData>);

  const prices: Record<string, number> = {};
  for (const [mint, entry] of Object.entries(entries)) {
    if (entry?.usdPrice != null) {
      prices[mint] = entry.usdPrice;
    }
  }

  return prices;
}

/**
 * Fetch price for a single token mint address. Returns null if unavailable.
 */
export async function getJupiterPrice(mintAddress: string): Promise<number | null> {
  const prices = await getJupiterPrices([mintAddress]);
  return prices[mintAddress] ?? null;
}
