import { getDb } from "@/lib/db/schema";
import { getAgentState, setAgentState, updateSignal } from "@/lib/db/queries";
import { configureClient } from "@/lib/nansen/client";
import { getAccountInfo } from "@/lib/nansen/endpoints";
import { initLogger, logger } from "@/lib/utils/logger";
import { loadConfig } from "./config";
import { scanSmDexTrades } from "./scanner";
import {
  detectConvergenceEvents,
  persistConvergenceEvent,
} from "./convergence";
import { validateSignal } from "./validator";
import { executeSignalTrade } from "./executor";
import { checkAllPositions } from "./position-manager";
import { shouldTakeSnapshot, writePortfolioSnapshot } from "./portfolio";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runCycle(
  db: ReturnType<typeof getDb>,
  config: ReturnType<typeof loadConfig>,
): Promise<void> {
  const cycleStart = Date.now();

  // ── 1. SCAN ───────────────────────────────────────────────────────
  const scanResults = await scanSmDexTrades(db, config);
  const totalInserted = scanResults.reduce((s, r) => s + r.tradesInserted, 0);
  const totalFound = scanResults.reduce((s, r) => s + r.tradesFound, 0);

  logger.info(`Scan cycle complete`, {
    chainsScanned: scanResults.length,
    tradesFound: totalFound,
    tradesInserted: totalInserted,
  });

  // ── 2. DETECT ─────────────────────────────────────────────────────
  const convergences = detectConvergenceEvents(db, config);

  if (convergences.length === 0) {
    logger.info("No convergence events detected this cycle");
  } else {
    logger.signal(`Detected ${convergences.length} convergence event(s)`, {
      tokens: convergences.map((c) => c.tokenSymbol ?? c.tokenAddress),
    });
  }

  // ── 3. VALIDATE each convergence event ────────────────────────────
  for (const event of convergences) {
    // Persist (insert or update) the signal first
    const signal = persistConvergenceEvent(db, event);

    // Skip validation if score below minimum validation threshold
    if (signal.convergence_score < config.convergence.minValidationScore) {
      logger.signal(
        `Signal #${signal.id} score ${signal.convergence_score} < ${config.convergence.minValidationScore}, skipping validation`,
        { tokenAddress: signal.token_address },
      );
      continue;
    }

    // Skip if already traded (dedup — trade-once flag)
    if (event.alreadyTraded) {
      logger.signal(
        `Signal #${signal.id} already traded, skipping`,
        { tokenAddress: signal.token_address },
      );
      continue;
    }

    // Skip re-validation if signal is WATCHING and wallet count hasn't increased
    if (
      signal.status === "WATCHING" &&
      event.existingSignalId !== null &&
      signal.wallet_count === event.walletCount
    ) {
      continue;
    }

    const validation = await validateSignal(db, signal, config);

    if (!validation.passed) {
      continue; // validator already updates signal status to FILTERED
    }

    // ── 4. EXECUTE — trade if score meets threshold ────────────────
    const enrichedScore = validation.enrichment?.enrichedScore ?? signal.convergence_score;

    if (enrichedScore >= config.convergence.minScore) {
      logger.trade(
        `Signal #${signal.id} qualified for execution: ${signal.token_symbol ?? signal.token_address} (score: ${enrichedScore})`,
        {
          signalId: signal.id,
          tokenAddress: signal.token_address,
          chain: signal.chain,
          score: enrichedScore,
          walletCount: signal.wallet_count,
          isContested: signal.is_contested === 1,
        },
      );

      const result = await executeSignalTrade(db, signal, config);

      if (result.success) {
        updateSignal(db, signal.id, { status: "TRADED" });
      } else {
        logger.trade(`Execution skipped/failed for signal #${signal.id}: ${result.reason}`, {
          signalId: signal.id,
        });
      }
    } else {
      logger.signal(
        `Signal #${signal.id} score ${enrichedScore} < ${config.convergence.minScore}, added to watchlist`,
        { tokenAddress: signal.token_address },
      );
    }
  }

  // ── 5. MANAGE — check all open positions for exit conditions ────
  try {
    await checkAllPositions(db, config);
  } catch (err) {
    logger.error("Position management check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 6. SNAPSHOT — write portfolio snapshot if interval elapsed ──
  try {
    if (shouldTakeSnapshot(db, config)) {
      await writePortfolioSnapshot(db, config);
    }
  } catch (err) {
    logger.error("Portfolio snapshot failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ── 7. CREDITS — check Nansen credit balance ──────────────────────
  try {
    const account = getAccountInfo();
    if (account) {
      setAgentState(db, "nansen_credits", String(account.credits_remaining));
      setAgentState(db, "nansen_plan", account.plan);
    }
  } catch { /* non-critical */ }

  // Update cycle stats
  const totalScans = parseInt(getAgentState(db, "total_scans") ?? "0", 10) + 1;
  setAgentState(db, "total_scans", String(totalScans));

  const elapsed = ((Date.now() - cycleStart) / 1000).toFixed(1);
  logger.info(`Cycle #${totalScans} completed in ${elapsed}s`);
}

async function main(): Promise<void> {
  // ── Initialize ────────────────────────────────────────────────────
  const config = loadConfig();
  const db = getDb();
  initLogger(db);

  // Configure Nansen client with cache/retry settings from config
  configureClient({
    defaultTtlMs: config.cache.defaultTtlMs,
    perEndpointTtl: config.cache.perEndpoint,
    maxRetries: config.retry.maxRetries,
    retryDelayMs: config.retry.retryDelayMs,
  });

  logger.info("The Operator agent starting", {
    chains: config.scanning.chains,
    scanIntervalMs: config.scanning.scanIntervalMs,
    convergenceWindow: config.convergence.windowHours,
    minWallets: config.convergence.minWallets,
    minScore: config.convergence.minScore,
  });

  setAgentState(db, "agent_started_at", new Date().toISOString());

  // Check for crash recovery
  const lastScan = getAgentState(db, "last_scan_at");
  if (lastScan) {
    logger.info(`Resuming from last scan at ${lastScan}`);
  }

  // ── Agent loop ────────────────────────────────────────────────────
  let running = true;

  const shutdown = () => {
    logger.info("Shutdown signal received, stopping after current cycle");
    running = false;
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (running) {
    try {
      await runCycle(db, config);
    } catch (err) {
      logger.error("Agent cycle failed", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }

    if (!running) break;

    // Determine sleep interval (respect quiet hours)
    let interval = config.scanning.scanIntervalMs;
    if (config.scanning.quietHours.enabled) {
      const hour = new Date().getUTCHours();
      const { startUtc, endUtc } = config.scanning.quietHours;
      const inQuietHours =
        startUtc < endUtc
          ? hour >= startUtc && hour < endUtc
          : hour >= startUtc || hour < endUtc;
      if (inQuietHours) {
        interval = config.scanning.quietHours.reducedIntervalMs;
      }
    }

    logger.info(`Next scan in ${(interval / 1000 / 60).toFixed(1)} minutes`);
    await sleep(interval);
  }

  logger.info("Agent stopped");
  db.close();
}

// Support both loop mode and single-cycle mode
const singleCycle = process.argv.includes("--once");

if (singleCycle) {
  const config = loadConfig();
  const db = getDb();
  initLogger(db);
  configureClient({
    defaultTtlMs: config.cache.defaultTtlMs,
    perEndpointTtl: config.cache.perEndpoint,
    maxRetries: config.retry.maxRetries,
    retryDelayMs: config.retry.retryDelayMs,
  });
  logger.info("Running single agent cycle (--once)");
  setAgentState(db, "agent_started_at", new Date().toISOString());
  runCycle(db, config)
    .then(() => {
      logger.info("Single cycle complete");
      db.close();
      process.exit(0);
    })
    .catch((err) => {
      logger.error("Single cycle failed", {
        error: err instanceof Error ? err.message : String(err),
      });
      db.close();
      process.exit(1);
    });
} else {
  main().catch((err) => {
    console.error("Fatal agent error:", err);
    process.exit(1);
  });
}
