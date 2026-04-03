import type { SmTradeRow } from "@/lib/db/queries";
import type { SmNetflowEntry, SmDca } from "@/lib/nansen/types";

// ── Label quality scores (Section 4.3) ──────────────────────────────

const LABEL_SCORES: Record<string, number> = {
  Fund: 100,
  "Smart Trader": 80,
  "30D Smart Trader": 60,
  "90D Smart Trader": 40,
  "180D Smart Trader": 20,
};

function getLabelScore(label: string): number {
  return LABEL_SCORES[label] ?? 10;
}

// ── Wallet count scoring (Section 4.3) ──────────────────────────────

function scoreWalletCount(count: number): number {
  if (count >= 8) return 100;
  if (count >= 5) return 70;
  if (count >= 3) return 50;
  return 20;
}

// ── Label quality scoring ───────────────────────────────────────────

function scoreLabelQuality(labels: string[]): number {
  if (labels.length === 0) return 0;
  const total = labels.reduce((sum, l) => sum + getLabelScore(l), 0);
  return Math.round(total / labels.length);
}

// ── Volume scoring ──────────────────────────────────────────────────

function scoreVolume(combinedUsd: number): number {
  // $10K = baseline (50), $50K = strong (75), $200K+ = max (100)
  if (combinedUsd >= 200_000) return 100;
  if (combinedUsd >= 100_000) return 90;
  if (combinedUsd >= 50_000) return 75;
  if (combinedUsd >= 25_000) return 60;
  if (combinedUsd >= 10_000) return 50;
  return 30;
}

// ── Timing cluster scoring ──────────────────────────────────────────

function scoreTimingCluster(timestamps: string[]): number {
  if (timestamps.length < 2) return 50;

  const times = timestamps.map((t) => new Date(t).getTime()).sort((a, b) => a - b);
  const spanMs = times[times.length - 1] - times[0];
  const spanHours = spanMs / (1000 * 60 * 60);

  // Trades within 2h = very tight cluster (100)
  // Within 6h = tight (80)
  // Within 12h = moderate (60)
  // Within 24h = loose (40)
  if (spanHours <= 2) return 100;
  if (spanHours <= 6) return 80;
  if (spanHours <= 12) return 60;
  if (spanHours <= 24) return 40;
  return 20;
}

// ── Base convergence score ──────────────────────────────────────────

export interface ConvergenceScoreInput {
  /** Buy trades for this token within the window */
  buyTrades: SmTradeRow[];
  /** Distinct SM label types that contributed buy trades */
  distinctLabels: string[];
}

export interface ConvergenceScoreResult {
  total: number;
  walletCountScore: number;
  labelQualityScore: number;
  volumeScore: number;
  timingScore: number;
  walletCountWeighted: number;
  labelQualityWeighted: number;
  volumeWeighted: number;
  timingWeighted: number;
}

export function calculateConvergenceScore(input: ConvergenceScoreInput): ConvergenceScoreResult {
  const { buyTrades, distinctLabels } = input;

  const walletCountScore = scoreWalletCount(distinctLabels.length);
  const labelQualityScore = scoreLabelQuality(
    buyTrades.map((t) => t.sm_label),
  );
  const combinedVolume = buyTrades.reduce(
    (sum, t) => sum + (t.amount_usd ?? 0),
    0,
  );
  const volumeScore = scoreVolume(combinedVolume);
  const timingScore = scoreTimingCluster(buyTrades.map((t) => t.traded_at));

  // Weighted: wallet 30%, label 25%, volume 20%, timing 25%
  const walletCountWeighted = walletCountScore * 0.3;
  const labelQualityWeighted = labelQualityScore * 0.25;
  const volumeWeighted = volumeScore * 0.2;
  const timingWeighted = timingScore * 0.25;

  const total = Math.round(
    walletCountWeighted + labelQualityWeighted + volumeWeighted + timingWeighted,
  );

  return {
    total: Math.min(total, 100),
    walletCountScore,
    labelQualityScore,
    volumeScore,
    timingScore,
    walletCountWeighted,
    labelQualityWeighted,
    volumeWeighted,
    timingWeighted,
  };
}

// ── On-demand enrichment bonuses ────────────────────────────────────

export interface EnrichmentInput {
  baseScore: number;
  netflow?: SmNetflowEntry | null;
  dcas?: SmDca[];
  walletQualityBonus?: number;
}

export interface EnrichmentResult {
  enrichedScore: number;
  netflowBonus: number;
  dcaBonus: number;
  walletQualityBonus: number;
}

export function applyEnrichmentBonuses(input: EnrichmentInput): EnrichmentResult {
  let netflowBonus = 0;
  let dcaBonus = 0;
  const walletQualityBonus = input.walletQualityBonus ?? 0;

  // Netflow: positive net_flow_usd = +5 to +10
  if (input.netflow && input.netflow.net_flow_usd > 0) {
    // Scale: modest positive = +5, strong positive = +10
    netflowBonus = input.netflow.net_flow_usd >= 50_000 ? 10 : 5;
  }

  // DCA: presence of active DCA orders = +5 to +10
  if (input.dcas && input.dcas.length > 0) {
    dcaBonus = input.dcas.length >= 3 ? 10 : 5;
  }

  const enrichedScore = Math.min(
    Math.max(input.baseScore + netflowBonus + dcaBonus + walletQualityBonus, 0),
    100,
  );

  return { enrichedScore, netflowBonus, dcaBonus, walletQualityBonus };
}
