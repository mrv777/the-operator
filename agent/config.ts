import { z } from "zod";
import fs from "fs";
import path from "path";

const QuietHoursSchema = z.object({
  enabled: z.boolean(),
  startUtc: z.number().min(0).max(23),
  endUtc: z.number().min(0).max(23),
  reducedIntervalMs: z.number().positive(),
});

const ScanningSchema = z.object({
  scanIntervalMs: z.number().positive(),
  chains: z.array(z.string()).min(1),
  quietHours: QuietHoursSchema,
});

const ConvergenceSchema = z.object({
  windowHours: z.number().positive(),
  minWallets: z.number().int().min(2),
  minScore: z.number().min(0).max(100),
  minVolumeUsd: z.number().nonnegative(),
});

const ValidationSchema = z.object({
  minLiquidityUsd: z.number().nonnegative(),
  minVolume24hUsd: z.number().nonnegative(),
  minMcapUsd: z.number().nonnegative(),
  maxTop10HolderPct: z.number().min(0).max(100),
  minTokenAgeDays: z.number().nonnegative(),
});

const ExecutionSchema = z.object({
  maxPositionPct: z.number().min(0).max(100),
  maxTotalExposurePct: z.number().min(0).max(100),
  maxSlippage: z.number().min(0).max(1),
  maxPriceImpactPct: z.number().min(0).max(100),
  minTradeUsd: z.number().positive(),
});

const TrailingStopTierSchema = z.object({
  maxMcap: z.number().positive().optional(),
  stopPct: z.number().min(0).max(100),
});

const TakeProfitTierSchema = z.object({
  multiplier: z.number().positive(),
  sellPct: z.number().min(0).max(100),
});

const PositionManagementSchema = z.object({
  checkIntervalMs: z.number().positive(),
  trailingStop: z.object({
    microCap: TrailingStopTierSchema,
    smallCap: TrailingStopTierSchema,
    midCap: TrailingStopTierSchema,
  }),
  emergencyStopPct: z.number().min(0).max(100),
  takeProfitTiers: z.array(TakeProfitTierSchema),
  timeExitDays: z.number().positive(),
  timeExitMinChangePct: z.number().nonnegative(),
});

const PositionSizingSchema = z.object({
  score70_79Pct: z.number().min(0).max(100),
  score80_89Pct: z.number().min(0).max(100),
  score90_100Pct: z.number().min(0).max(100),
});

const PortfolioSchema = z.object({
  snapshotIntervalMs: z.number().positive(),
});

const CacheSchema = z.object({
  defaultTtlMs: z.number().nonnegative(),
  perEndpoint: z.record(z.string(), z.number().nonnegative()),
});

const RetrySchema = z.object({
  maxRetries: z.number().int().min(0),
  retryDelayMs: z.number().nonnegative(),
});

export const ConfigSchema = z.object({
  scanning: ScanningSchema,
  convergence: ConvergenceSchema,
  validation: ValidationSchema,
  execution: ExecutionSchema,
  positionManagement: PositionManagementSchema,
  positionSizing: PositionSizingSchema,
  portfolio: PortfolioSchema,
  cache: CacheSchema,
  retry: RetrySchema,
  blocklist: z.array(z.string()),
});

export type Config = z.infer<typeof ConfigSchema>;

const CONFIG_PATH = path.resolve(process.env.CONFIG_PATH ?? "config.json");

export function loadConfig(configPath?: string): Config {
  const filePath = configPath ?? CONFIG_PATH;
  const raw = fs.readFileSync(filePath, "utf-8");
  const json = JSON.parse(raw);
  return ConfigSchema.parse(json);
}
