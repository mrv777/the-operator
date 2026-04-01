"use client";

import { useEffect, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, unknown> | null>(null);
  const [configText, setConfigText] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [paused, setPaused] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, statusRes] = await Promise.all([
          fetch("/api/settings"),
          fetch("/api/agent/status"),
        ]);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setConfig(data.config);
          setConfigText(JSON.stringify(data.config, null, 2));
        }
        if (statusRes.ok) {
          const status = await statusRes.json();
          setPaused(status.status === "PAUSED");
        }
      } catch { /* ignore */ }
    }
    load();
  }, []);

  const handleTextChange = useCallback((value: string) => {
    setConfigText(value);
    setParseError(null);
    try {
      JSON.parse(value);
    } catch (e) {
      setParseError((e as Error).message);
    }
  }, []);

  async function handleSave() {
    if (parseError) return;
    setSaving(true);
    setSaveStatus("idle");
    try {
      const parsed = JSON.parse(configText);
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: parsed }),
      });
      if (res.ok) {
        setConfig(parsed);
        setSaveStatus("success");
        setTimeout(() => setSaveStatus("idle"), 3000);
      } else {
        setSaveStatus("error");
      }
    } catch {
      setSaveStatus("error");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle() {
    try {
      const res = await fetch("/api/agent/toggle", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        setPaused(data.paused);
      }
    } catch { /* ignore */ }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Agent control */}
      <div className="bg-bg-card rounded-xl border border-border p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Agent Control</p>
            <p className="text-sm text-text-muted">Pause or resume the trading agent</p>
          </div>
          <button
            onClick={handleToggle}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              paused
                ? "bg-profit/20 text-profit hover:bg-profit/30"
                : "bg-warning/20 text-warning hover:bg-warning/30",
            )}
          >
            {paused ? "Resume Agent" : "Pause Agent"}
          </button>
        </div>
      </div>

      {/* Config editor */}
      <div className="bg-bg-card rounded-xl border border-border p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium">Configuration</p>
            <p className="text-sm text-text-muted">Edit config.json — changes take effect on next agent cycle</p>
          </div>
          <div className="flex items-center gap-2">
            {saveStatus === "success" && (
              <span className="text-profit text-xs">Saved</span>
            )}
            {saveStatus === "error" && (
              <span className="text-loss text-xs">Error saving</span>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !!parseError}
              className={cn(
                "px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                parseError
                  ? "bg-bg-card-hover text-text-muted cursor-not-allowed"
                  : "bg-signal/20 text-signal hover:bg-signal/30",
              )}
            >
              {saving ? "Saving..." : "Save Config"}
            </button>
          </div>
        </div>

        {parseError && (
          <div className="text-loss text-xs bg-loss/10 rounded-lg px-3 py-2">
            JSON Error: {parseError}
          </div>
        )}

        <textarea
          value={configText}
          onChange={(e) => handleTextChange(e.target.value)}
          spellCheck={false}
          className="w-full h-[500px] bg-bg-primary border border-border rounded-lg p-3 font-mono text-xs text-text-primary resize-y focus:outline-none focus:border-signal/50"
        />
      </div>

      {/* Blocklist section */}
      {config && (
        <BlocklistEditor
          blocklist={(config as { blocklist?: string[] }).blocklist ?? []}
          onUpdate={(bl) => {
            const updated = { ...config, blocklist: bl };
            setConfig(updated);
            setConfigText(JSON.stringify(updated, null, 2));
          }}
        />
      )}
    </div>
  );
}

function BlocklistEditor({
  blocklist,
  onUpdate,
}: {
  blocklist: string[];
  onUpdate: (bl: string[]) => void;
}) {
  const [input, setInput] = useState("");

  function addToken() {
    const trimmed = input.trim();
    if (trimmed && !blocklist.includes(trimmed)) {
      onUpdate([...blocklist, trimmed]);
      setInput("");
    }
  }

  function removeToken(token: string) {
    onUpdate(blocklist.filter((t) => t !== token));
  }

  return (
    <div className="bg-bg-card rounded-xl border border-border p-4 space-y-3">
      <div>
        <p className="font-medium">Token Blocklist</p>
        <p className="text-sm text-text-muted">Tokens the agent will never trade</p>
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="Token address..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addToken()}
          className="flex-1 bg-bg-primary border border-border rounded-lg px-3 py-2 text-sm font-mono text-text-primary focus:outline-none focus:border-signal/50"
        />
        <button
          onClick={addToken}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-signal/20 text-signal hover:bg-signal/30 transition-colors"
        >
          Add
        </button>
      </div>

      {blocklist.length > 0 ? (
        <div className="space-y-1">
          {blocklist.map((token) => (
            <div
              key={token}
              className="flex items-center justify-between bg-bg-card-hover rounded-lg px-3 py-2"
            >
              <span className="text-xs font-mono text-text-secondary">{token}</span>
              <button
                onClick={() => removeToken(token)}
                className="text-loss text-xs hover:text-loss/80"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-text-muted text-xs">No blocked tokens</p>
      )}
    </div>
  );
}
