// GoPlus Security API — free, no auth, 30 calls/min
// Docs: https://docs.gopluslabs.io/reference/solanatokensecurityusingget
//
// Fail-open: on any error or unexpected response, returns { safe: true }.
// GoPlus downtime should never block trades.

import { logger } from "@/lib/utils/logger";

const BASE_URL = "https://api.gopluslabs.io/api/v1/solana/token_security";

export interface GoPlusResult {
  safe: boolean;
  reasons: string[];
}

interface GoPlusAuthority {
  address: string;
  malicious_address: number; // 1 = flagged malicious
}

interface GoPlusSecurityField {
  status: string; // "0" or "1"
  authority?: GoPlusAuthority[];
}

interface GoPlusTokenData {
  trusted_token?: number; // 1 = known trusted (e.g., USDC)
  mintable?: GoPlusSecurityField;
  freezable?: GoPlusSecurityField;
  balance_mutable_authority?: GoPlusSecurityField;
  closable?: GoPlusSecurityField;
  non_transferable?: number; // 1 = can't transfer
  transfer_fee?: { max_fee?: number }; // hidden transfer fees
  [key: string]: unknown;
}

/**
 * Check if a Solana token has dangerous on-chain properties.
 *
 * Hard-fail conditions:
 * - balance_mutable_authority active (owner can change anyone's balance)
 * - non_transferable = 1 (can't transfer tokens)
 * - mint/freeze authority with malicious-flagged address
 * - closable active (can close token accounts)
 *
 * Soft-pass (not blocked but logged):
 * - mintable/freezable with non-malicious authority (common on legit tokens like USDC)
 */
export async function checkTokenSecurity(
  tokenAddress: string,
): Promise<GoPlusResult> {
  try {
    const res = await fetch(
      `${BASE_URL}?contract_addresses=${tokenAddress}`,
      { signal: AbortSignal.timeout(10_000) },
    );

    if (!res.ok) {
      logger.warn(`GoPlus HTTP ${res.status} for ${tokenAddress}`);
      return { safe: true, reasons: [] };
    }

    const json = await res.json() as {
      code: number;
      result?: Record<string, GoPlusTokenData>;
    };

    if (json.code !== 1 || !json.result) {
      logger.warn(`GoPlus unexpected response for ${tokenAddress}`, {
        code: json.code,
      });
      return { safe: true, reasons: [] };
    }

    const data = json.result[tokenAddress];
    if (!data) {
      // Token not in GoPlus database — fail-open
      return { safe: true, reasons: [] };
    }

    // Trusted tokens (e.g., USDC, USDT) skip all checks
    if (data.trusted_token === 1) {
      return { safe: true, reasons: [] };
    }

    const reasons: string[] = [];

    // 1. Balance mutable authority — owner can change anyone's balance
    if (data.balance_mutable_authority?.status === "1") {
      reasons.push("balance mutable authority active");
    }

    // 2. Non-transferable — can't transfer/sell tokens
    if (data.non_transferable === 1) {
      reasons.push("token is non-transferable");
    }

    // 3. Closable — can close token accounts
    if (data.closable?.status === "1") {
      reasons.push("token accounts can be closed by authority");
    }

    // 4. Mintable with malicious authority — can inflate supply (rug)
    if (data.mintable?.status === "1") {
      const hasMalicious = data.mintable.authority?.some(
        (a) => a.malicious_address === 1,
      );
      if (hasMalicious) {
        reasons.push("mint authority flagged as malicious");
      }
    }

    // 5. Freezable with malicious authority — can freeze your tokens
    if (data.freezable?.status === "1") {
      const hasMalicious = data.freezable.authority?.some(
        (a) => a.malicious_address === 1,
      );
      if (hasMalicious) {
        reasons.push("freeze authority flagged as malicious");
      }
    }

    // 6. Hidden transfer fees (significant)
    if (data.transfer_fee && typeof data.transfer_fee.max_fee === "number") {
      if (data.transfer_fee.max_fee > 0) {
        reasons.push(`hidden transfer fee detected (max: ${data.transfer_fee.max_fee})`);
      }
    }

    return { safe: reasons.length === 0, reasons };
  } catch (err) {
    // Fail-open: GoPlus errors should never block trading
    logger.warn(`GoPlus check failed for ${tokenAddress}`, {
      error: err instanceof Error ? err.message : String(err),
    });
    return { safe: true, reasons: [] };
  }
}
