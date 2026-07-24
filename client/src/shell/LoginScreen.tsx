import { useState } from "react";
import { motion } from "framer-motion";
import { LogIn, Loader2 } from "lucide-react";
import { useAuth } from "../store/auth";

export default function LoginScreen() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(username, password, rememberMe);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[15000] flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-xl" />
      <motion.div
        initial={{ y: 20, opacity: 0, scale: 0.97 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="relative z-10 w-full max-w-sm rounded-2xl border border-edge bg-surface/95 p-8 shadow-window"
      >
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-xl bg-accent text-2xl font-bold text-accent-fg">
            A
          </div>
          <h1 className="text-xl font-semibold text-ink">Athena</h1>
          <p className="text-sm text-ink-muted">Sign in to your Student OS</p>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoFocus
            className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-edge bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-accent"
          />

          <label className="flex cursor-pointer items-center gap-2 pt-1 text-xs text-ink-muted select-none">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-edge accent-[var(--accent)]"
            />
            Remember this device (stay signed in for 90 days)
          </label>

          {error && (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-400">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-2.5 text-sm font-medium text-accent-fg transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-[11px] text-ink-muted">
          Don't have an account? Ask your administrator.
        </p>
      </motion.div>
    </div>
  );
}
