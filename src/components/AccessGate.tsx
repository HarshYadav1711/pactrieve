"use client";

import {FormEvent, useCallback, useEffect, useState} from "react";

type AccessStatus = {
  required: boolean;
  unlocked: boolean;
  misconfigured?: boolean;
};

/**
 * Shared deployment passphrase UI. Shown when the host requires unlock
 * or when a public host is missing PACTRIEVE_ACCESS_TOKEN. Not multi-user auth.
 */
export function AccessGate({onUnlocked}: {onUnlocked?: () => void}) {
  const [status, setStatus] = useState<AccessStatus | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const probe = useCallback(async () => {
    try {
      const meta = await fetch("/api/access", {cache: "no-store"});
      const metaJson = (await meta.json()) as AccessStatus;
      setStatus({
        required: Boolean(metaJson.required),
        unlocked: Boolean(metaJson.unlocked),
        misconfigured: Boolean(metaJson.misconfigured)
      });
      if (metaJson.required && metaJson.unlocked && !metaJson.misconfigured) onUnlocked?.();
    } catch {
      setStatus({required: false, unlocked: true, misconfigured: false});
    }
  }, [onUnlocked]);

  useEffect(() => {
    void probe();
  }, [probe]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/access", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({token: token.trim()})
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Invalid access token.");
        return;
      }
      setStatus({required: true, unlocked: true, misconfigured: false});
      setToken("");
      onUnlocked?.();
    } catch {
      setError("Could not unlock this deployment.");
    } finally {
      setBusy(false);
    }
  }

  if (!status || !status.required || (status.unlocked && !status.misconfigured)) {
    return null;
  }

  if (status.misconfigured) {
    return (
      <div className="error-banner access-gate" role="alert">
        <b>Deployment access gate misconfigured</b>
        <p>
          This host is public but <code>PACTRIEVE_ACCESS_TOKEN</code> is not set. Document APIs
          stay locked until an operator configures the shared evaluator passphrase in the hosting
          environment. Synthetic contracts only — not a multi-user login.
        </p>
      </div>
    );
  }

  return (
    <div className="error-banner access-gate" role="dialog" aria-labelledby="access-gate-title">
      <b id="access-gate-title">Deployment access required</b>
      <p>
        This public instance is locked with a shared evaluator passphrase. Enter it once to use
        document APIs. Synthetic contracts only — not a multi-user login.
      </p>
      <form className="access-gate-form" onSubmit={event => void submit(event)}>
        <label className="sr-only" htmlFor="access-token">
          Access token
        </label>
        <input
          id="access-token"
          type="password"
          autoComplete="off"
          value={token}
          onChange={e => setToken(e.target.value)}
          placeholder="Shared access token"
          disabled={busy}
        />
        <button className="button primary" type="submit" disabled={busy || !token.trim()}>
          {busy ? "Unlocking…" : "Unlock"}
        </button>
      </form>
      {error && <span className="warning-text">{error}</span>}
    </div>
  );
}
