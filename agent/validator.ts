import type Database from "better-sqlite3";
import type { Config } from "./config";
import type { SignalRow } from "@/lib/db/queries";
import { updateSignal } from "@/lib/db/queries";
import { getTokenInfo, getSmNetflow, getSmDcas } from "@/lib/nansen/endpoints";
import {
  applyEnrichmentBonuses,
  type EnrichmentResult,
} from "@/lib/scoring/convergence-score";
import { logger } from "@/lib/utils/logger";

// ── Real CLI response shapes (after client unwrap) ──────────────────

interface RawTokenInfoPayload {
  data: {
    name: string;
    symbol: string;
    contract_address: string;
    token_details: {
      token_deployment_date: string | null;
      market_cap_usd: number | null;
      fdv_usd?: number | null;
      circulating_supply: number | null;
      total_supply: number | null;
    };
    spot_metrics: {
      volume_total_usd: number | null;
      liquidity_usd: number | null;
      total_holders: number | null;
      unique_buyers: number | null;
      unique_sellers: number | null;
    };
  };
}

interface RawNetflowEntry {
  token_address?: string;
  net_flow_usd?: number;
  [key: string]: unknown;
}

interface RawNetflowPayload {
  data: RawNetflowEntry[];
  pagination?: unknown;
}

interface RawDcaEntry {
  wallet_address?: string;
  token_address?: string;
  [key: string]: unknown;
}

interface RawDcaPayload {
  data: RawDcaEntry[];
  pagination?: unknown;
}

// ── Types ───────────────────────────────────────────────────────────

export interface ValidationResult {
  passed: boolean;
  enrichment: EnrichmentResult | null;
  failReasons: string[];
  tokenInfo: {
    liquidity_usd: number | null;
    volume_24h_usd: number | null;
    market_cap_usd: number | null;
    top_10_holder_pct: number | null;
    created_at: string | null;
    total_holders: number | null;
  } | null;
}

// ── Core validation ─────────────────────────────────────────────────

export async function validateSignal(
  db: Database.Database,
  signal: SignalRow,
  config: Config,
): Promise<ValidationResult> {
  const failReasons: string[] = [];

  logger.validate(`Validating ${signal.token_symbol ?? signal.token_address}`, {
    signalId: signal.id,
    score: signal.convergence_score,
  });

  // Mark as validating
  updateSignal(db, signal.id, { status: "VALIDATING" });

  // ── Fetch token info ──────────────────────────────────────────────

  const tokenInfoResult = await getTokenInfo(signal.token_address, signal.chain);

  if (!tokenInfoResult.success || !tokenInfoResult.data) {
    logger.error(`Token info fetch failed for ${signal.token_address}`, {
      error: tokenInfoResult.error,
    });
    updateSignal(db, signal.id, {
      status: "FILTERED",
      filter_reason: "TOKEN_INFO_UNAVAILABLE",
      validated_at: new Date().toISOString(),
    });
    return { passed: false, enrichment: null, failReasons: ["TOKEN_INFO_UNAVAILABLE"], tokenInfo: null };
  }

  // Navigate the real CLI response structure
  const raw = tokenInfoResult.data as unknown as RawTokenInfoPayload;
  const details = raw.data?.token_details;
  const metrics = raw.data?.spot_metrics;

  // Use FDV as fallback when market cap is 0/null (common for pump.fun tokens)
  const mcap = details?.market_cap_usd && details.market_cap_usd > 0
    ? details.market_cap_usd
    : details?.fdv_usd ?? null;

  const tokenInfo = {
    liquidity_usd: metrics?.liquidity_usd ?? null,
    volume_24h_usd: metrics?.volume_total_usd ?? null,
    market_cap_usd: mcap,
    top_10_holder_pct: null as number | null, // Not directly available from this endpoint
    created_at: details?.token_deployment_date ?? null,
    total_holders: metrics?.total_holders ?? null,
  };

  // ── Safety filters (Section 4.6 — ALL must pass) ─────────────────

  // 1. Liquidity
  if (tokenInfo.liquidity_usd !== null && tokenInfo.liquidity_usd < config.validation.minLiquidityUsd) {
    failReasons.push(`Liquidity $${tokenInfo.liquidity_usd.toFixed(0)} < $${config.validation.minLiquidityUsd}`);
  }

  // 2. 24h Volume
  if (tokenInfo.volume_24h_usd !== null && tokenInfo.volume_24h_usd < config.validation.minVolume24hUsd) {
    failReasons.push(`24h volume $${tokenInfo.volume_24h_usd.toFixed(0)} < $${config.validation.minVolume24hUsd}`);
  }

  // 3. Market cap
  if (tokenInfo.market_cap_usd !== null && tokenInfo.market_cap_usd < config.validation.minMcapUsd) {
    failReasons.push(`Market cap $${tokenInfo.market_cap_usd.toFixed(0)} < $${config.validation.minMcapUsd}`);
  }

  // 4. Top 10 holders — skip if data unavailable from this endpoint
  // (Will be checked via flow-intelligence or separate endpoint when available)

  // 5. Token age
  if (tokenInfo.created_at) {
    const ageMs = Date.now() - new Date(tokenInfo.created_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < config.validation.minTokenAgeDays) {
      failReasons.push(`Token age ${ageDays.toFixed(1)} days < ${config.validation.minTokenAgeDays} days`);
    }
  }

  // 6. SM net direction — fetch netflow
  const netflowResult = await getSmNetflow(signal.chain, signal.token_address);
  let netflowForEnrichment: { net_flow_usd: number } | null = null;

  if (netflowResult.success && netflowResult.data) {
    const nfPayload = netflowResult.data as unknown as RawNetflowPayload;
    const entries = nfPayload.data ?? [];
    const entry = entries.find(
      (e) => e.token_address === signal.token_address,
    ) ?? (entries.length > 0 ? entries[0] : null);

    if (entry && typeof entry.net_flow_usd === "number") {
      netflowForEnrichment = { net_flow_usd: entry.net_flow_usd };
      if (entry.net_flow_usd < 0) {
        failReasons.push(`SM net direction negative: $${entry.net_flow_usd.toFixed(0)}`);
      }
    }
  }

  // ── Check if all filters passed ──────────────────────────────────

  if (failReasons.length > 0) {
    logger.validate(`Validation FAILED for ${signal.token_symbol ?? signal.token_address}`, {
      signalId: signal.id,
      reasons: failReasons,
    });
    updateSignal(db, signal.id, {
      status: "FILTERED",
      filter_reason: failReasons.join("; "),
      validated_at: new Date().toISOString(),
    });
    return { passed: false, enrichment: null, failReasons, tokenInfo };
  }

  // ── On-demand enrichment (netflow + DCA bonuses) ─────────────────

  let dcaCount = 0;
  const dcaResult = await getSmDcas(signal.chain, signal.token_address);
  if (dcaResult.success && dcaResult.data) {
    const dcaPayload = dcaResult.data as unknown as RawDcaPayload;
    dcaCount = (dcaPayload.data ?? []).length;
  }

  // Build minimal enrichment inputs matching the scoring interface
  const enrichment = applyEnrichmentBonuses({
    baseScore: signal.convergence_score,
    netflow: netflowForEnrichment ? { net_flow_usd: netflowForEnrichment.net_flow_usd } as Parameters<typeof applyEnrichmentBonuses>[0]["netflow"] : null,
    dcas: dcaCount > 0 ? Array.from({ length: dcaCount }, () => ({} as Parameters<typeof applyEnrichmentBonuses>[0]["dcas"] extends (infer U)[] | undefined ? U : never)) : [],
  });

  // Update signal with enriched score and mark as passed
  const finalStatus = enrichment.enrichedScore >= config.convergence.minScore
    ? "PASSED"
    : "WATCHING";

  updateSignal(db, signal.id, {
    convergence_score: enrichment.enrichedScore,
    status: finalStatus,
    validated_at: new Date().toISOString(),
  });

  logger.validate(`Validation PASSED for ${signal.token_symbol ?? signal.token_address}`, {
    signalId: signal.id,
    baseScore: signal.convergence_score,
    enrichedScore: enrichment.enrichedScore,
    netflowBonus: enrichment.netflowBonus,
    dcaBonus: enrichment.dcaBonus,
    status: finalStatus,
  });

  return { passed: true, enrichment, failReasons: [], tokenInfo };
}
