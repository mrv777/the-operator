import type Database from "better-sqlite3";
import type { Config } from "./config";
import type { SignalRow } from "@/lib/db/queries";
import { updateSignal, getTokenNetflow } from "@/lib/db/queries";
import { getDexScreenerToken } from "@/lib/prices/dexscreener";
import { getTokenInfo, getSmDcas } from "@/lib/nansen/endpoints";
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

// ── Token info fetching (DexScreener primary, Nansen fallback) ──────

interface TokenInfoData {
  liquidity_usd: number | null;
  volume_24h_usd: number | null;
  market_cap_usd: number | null;
  top_10_holder_pct: number | null;
  created_at: string | null;
  total_holders: number | null;
}

async function fetchTokenData(
  tokenAddress: string,
  chain: string,
): Promise<{ data: TokenInfoData; source: string } | null> {
  // Try DexScreener first (free)
  const ds = await getDexScreenerToken(tokenAddress);
  if (ds.success) {
    logger.validate(`Token data from DexScreener`, { tokenAddress });
    return {
      source: "dexscreener",
      data: {
        liquidity_usd: ds.data.liquidityUsd,
        volume_24h_usd: ds.data.volume24hUsd,
        market_cap_usd: ds.data.marketCapUsd && ds.data.marketCapUsd > 0
          ? ds.data.marketCapUsd
          : ds.data.fdvUsd ?? null,
        top_10_holder_pct: null,
        created_at: ds.data.pairCreatedAt,
        total_holders: null,
      },
    };
  }

  logger.warn(`DexScreener failed for ${tokenAddress}: ${ds.error}, falling back to Nansen`);

  // Fallback to Nansen
  const nansenResult = await getTokenInfo(tokenAddress, chain);
  if (!nansenResult.success || !nansenResult.data) {
    return null;
  }

  const raw = nansenResult.data as unknown as RawTokenInfoPayload;
  const details = raw.data?.token_details;
  const metrics = raw.data?.spot_metrics;
  const mcap = details?.market_cap_usd && details.market_cap_usd > 0
    ? details.market_cap_usd
    : details?.fdv_usd ?? null;

  return {
    source: "nansen",
    data: {
      liquidity_usd: metrics?.liquidity_usd ?? null,
      volume_24h_usd: metrics?.volume_total_usd ?? null,
      market_cap_usd: mcap,
      top_10_holder_pct: null,
      created_at: details?.token_deployment_date ?? null,
      total_holders: metrics?.total_holders ?? null,
    },
  };
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

  // ── Fetch token info (DexScreener → Nansen fallback) ─────────────

  const tokenResult = await fetchTokenData(signal.token_address, signal.chain);

  if (!tokenResult) {
    logger.error(`Token info unavailable for ${signal.token_address}`);
    updateSignal(db, signal.id, {
      status: "FILTERED",
      filter_reason: "TOKEN_INFO_UNAVAILABLE",
      validated_at: new Date().toISOString(),
    });
    return { passed: false, enrichment: null, failReasons: ["TOKEN_INFO_UNAVAILABLE"], tokenInfo: null };
  }

  const tokenInfo = tokenResult.data;

  // ── Safety filters (ALL must pass) ───────────────────────────────

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

  // 4. Top 10 holders — skip if data unavailable
  // (Will be checked via flow-intelligence or separate endpoint when available)

  // 5. Token age
  if (tokenInfo.created_at) {
    const ageMs = Date.now() - new Date(tokenInfo.created_at).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    if (ageDays < config.validation.minTokenAgeDays) {
      failReasons.push(`Token age ${ageDays.toFixed(1)} days < ${config.validation.minTokenAgeDays} days`);
    }
  }

  // 6. SM net direction — computed locally from sm_trades (free)
  const netflow = getTokenNetflow(db, signal.token_address, signal.chain, config.convergence.windowHours);

  if (netflow.netFlowUsd < config.validation.minNetflowUsd) {
    failReasons.push(`SM net direction $${netflow.netFlowUsd.toFixed(0)} < $${config.validation.minNetflowUsd}`);
  }

  // ── Check if all filters passed ──────────────────────────────────

  if (failReasons.length > 0) {
    logger.validate(`Validation FAILED for ${signal.token_symbol ?? signal.token_address}`, {
      signalId: signal.id,
      reasons: failReasons,
      source: tokenResult.source,
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

  // Build enrichment inputs — use local netflow data
  const enrichment = applyEnrichmentBonuses({
    baseScore: signal.convergence_score,
    netflow: { net_flow_usd: netflow.netFlowUsd } as Parameters<typeof applyEnrichmentBonuses>[0]["netflow"],
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
    source: tokenResult.source,
    localNetflow: netflow.netFlowUsd,
  });

  return { passed: true, enrichment, failReasons: [], tokenInfo };
}
