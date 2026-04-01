import type Database from "better-sqlite3";
import { insertAgentLog } from "@/lib/db/queries";

export type EventType = "SCAN" | "SIGNAL" | "VALIDATE" | "TRADE" | "EXIT" | "ERROR" | "INFO";
export type Severity = "INFO" | "WARN" | "ERROR";

interface LogEntry {
  eventType: EventType;
  severity: Severity;
  message: string;
  data?: Record<string, unknown>;
}

let _db: Database.Database | null = null;

export function initLogger(db: Database.Database): void {
  _db = db;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function writeStdout(entry: LogEntry): void {
  const timestamp = formatTimestamp();
  const prefix = `[${timestamp}] [${entry.severity}] [${entry.eventType}]`;
  const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
  const line = `${prefix} ${entry.message}${dataStr}`;

  if (entry.severity === "ERROR") {
    console.error(line);
  } else if (entry.severity === "WARN") {
    console.warn(line);
  } else {
    console.log(line);
  }
}

function writeDb(entry: LogEntry): void {
  if (!_db) return;
  try {
    insertAgentLog(_db, {
      event_type: entry.eventType,
      severity: entry.severity,
      message: entry.message,
      data_json: entry.data ? JSON.stringify(entry.data) : null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Don't let DB write failures crash the logger
    console.error(`[LOGGER] Failed to write to agent_log: ${entry.message}`);
  }
}

function log(entry: LogEntry): void {
  writeStdout(entry);
  writeDb(entry);
}

export const logger = {
  scan(message: string, data?: Record<string, unknown>) {
    log({ eventType: "SCAN", severity: "INFO", message, data });
  },

  signal(message: string, data?: Record<string, unknown>) {
    log({ eventType: "SIGNAL", severity: "INFO", message, data });
  },

  validate(message: string, data?: Record<string, unknown>) {
    log({ eventType: "VALIDATE", severity: "INFO", message, data });
  },

  trade(message: string, data?: Record<string, unknown>) {
    log({ eventType: "TRADE", severity: "INFO", message, data });
  },

  exit(message: string, data?: Record<string, unknown>) {
    log({ eventType: "EXIT", severity: "INFO", message, data });
  },

  info(message: string, data?: Record<string, unknown>) {
    log({ eventType: "INFO", severity: "INFO", message, data });
  },

  warn(message: string, data?: Record<string, unknown>) {
    log({ eventType: "INFO", severity: "WARN", message, data });
  },

  error(message: string, data?: Record<string, unknown>) {
    log({ eventType: "ERROR", severity: "ERROR", message, data });
  },
};
