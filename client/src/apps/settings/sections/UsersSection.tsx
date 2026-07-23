import { useState, useEffect, useCallback } from "react";
import { Users as UsersIcon, Plus, Trash2, KeyRound, X, Loader2, ShieldCheck, User as UserIcon } from "lucide-react";
import { usersApi } from "../../../services/users";
import { useAuth } from "../../../store/auth";
import type { AdminUser, UserRole } from "../../../types";
import { SectionHeader, Card, Field, StatusPill, MsgBox, inputClass } from "../ui";

const AVATAR_PRESETS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6",
];

export default function UsersSection() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [resetting, setResetting] = useState<AdminUser | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await usersApi.list());
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section id="users" className="mb-8">
      <SectionHeader
        icon={<UsersIcon size={18} />}
        title="User Management"
        description="Create, edit, and remove user accounts. Administrators only."
      />

      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-ink-muted">{users.length} user(s)</span>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm text-accent-fg hover:opacity-90"
        >
          <Plus size={14} /> New user
        </button>
      </div>

      <Card className="overflow-visible p-0">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-ink-muted">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : users.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No users found.</p>
        ) : (
          <div className="divide-y divide-edge">
            {users.map((u) => (
              <UserRow
                key={u.id}
                u={u}
                isMe={u.id === me?.id}
                onEdit={() => setEditing(u)}
                onReset={() => setResetting(u)}
                onChanged={refresh}
              />
            ))}
          </div>
        )}
      </Card>

      {showCreate && (
        <CreateUserModal onClose={() => setShowCreate(false)} onCreated={refresh} />
      )}
      {editing && (
        <EditUserModal user={editing} onClose={() => setEditing(null)} onSaved={refresh} />
      )}
      {resetting && (
        <ResetPasswordModal
          user={resetting}
          onClose={() => setResetting(null)}
          onDone={refresh}
        />
      )}
    </section>
  );
}

function UserRow({
  u,
  isMe,
  onEdit,
  onReset,
  onChanged,
}: {
  u: AdminUser;
  isMe: boolean;
  onEdit: () => void;
  onReset: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const del = async () => {
    if (!confirm(`Delete user "${u.username}"? This removes all their data.`)) return;
    setBusy(true);
    setErr(null);
    try {
      await usersApi.remove(u.id);
      onChanged();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3">
      <div
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
        style={{ background: u.avatarColor }}
      >
        {(u.displayName || u.username || "U").charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-medium text-ink">
          <span className="truncate">{u.displayName || u.username}</span>
          {u.role === "ADMIN" && (
            <ShieldCheck size={13} className="shrink-0 text-accent" />
          )}
          {isMe && <span className="text-[10px] uppercase text-ink-muted">(you)</span>}
        </p>
        <p className="truncate text-xs text-ink-muted">
          @{u.username} · {new Date(u.createdAt).toLocaleDateString()}
        </p>
        {err && <p className="text-xs text-red-500">{err}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onEdit}
          disabled={busy}
          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-3 hover:text-ink"
          title="Edit"
        >
          <UserIcon size={15} />
        </button>
        <button
          onClick={onReset}
          disabled={busy}
          className="rounded-md p-1.5 text-ink-muted hover:bg-surface-3 hover:text-ink"
          title="Reset password"
        >
          <KeyRound size={15} />
        </button>
        {!isMe && (
          <button
            onClick={del}
            disabled={busy}
            className="rounded-md p-1.5 text-ink-muted hover:bg-red-500 hover:text-white"
            title="Delete"
          >
            <Trash2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-edge bg-surface shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-edge px-4 py-3">
          <h4 className="text-sm font-semibold text-ink">{title}</h4>
          <button onClick={onClose} className="rounded-md p-1 text-ink-muted hover:bg-surface-3">
            <X size={16} />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [avatarColor, setAvatarColor] = useState(AVATAR_PRESETS[0]);
  const [role, setRole] = useState<UserRole>("USER");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!username.trim() || !password) return;
    setBusy(true);
    setErr(null);
    try {
      await usersApi.create({
        username: username.trim(),
        password,
        displayName: displayName.trim(),
        avatarColor,
        role,
      });
      onCreated();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Create user" onClose={onClose}>
      <div className="space-y-3">
        <Field label="Username">
          <input value={username} onChange={(e) => setUsername(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        <Field label="Display name (optional)">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Avatar color">
          <div className="flex flex-wrap items-center gap-2">
            {AVATAR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setAvatarColor(c)}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  avatarColor === c ? "border-ink ring-2 ring-accent" : "border-transparent"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Field label="Role">
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className={inputClass}>
            <option value="USER">User</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </Field>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted hover:bg-surface-3">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !username.trim() || !password}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Create
          </button>
        </div>
      </div>
    </Modal>
  );
}

function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user: me } = useAuth();
  const [displayName, setDisplayName] = useState(user.displayName);
  const [avatarColor, setAvatarColor] = useState(user.avatarColor);
  const [role, setRole] = useState<UserRole>(user.role);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isSelf = user.id === me?.id;

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      await usersApi.update(user.id, {
        displayName: displayName.trim(),
        avatarColor,
        role: isSelf ? undefined : role,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Edit @${user.username}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Display name">
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Avatar color">
          <div className="flex flex-wrap items-center gap-2">
            {AVATAR_PRESETS.map((c) => (
              <button
                key={c}
                onClick={() => setAvatarColor(c)}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  avatarColor === c ? "border-ink ring-2 ring-accent" : "border-transparent"
                }`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Field label="Role" hint={isSelf ? "You cannot change your own role." : undefined}>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
            disabled={isSelf}
            className={inputClass}
          >
            <option value="USER">User</option>
            <option value="ADMIN">Administrator</option>
          </select>
        </Field>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted hover:bg-surface-3">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ResetPasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: AdminUser;
  onClose: () => void;
  onDone: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (password.length < 4) {
      setErr("Password must be at least 4 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      await usersApi.resetPassword(user.id, password);
      onDone();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Reset password for @${user.username}`} onClose={onClose}>
      <div className="space-y-3">
        <Field label="New password">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
        </Field>
        {err && <p className="text-xs text-red-500">{err}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="rounded-lg border border-edge px-3 py-2 text-sm text-ink-muted hover:bg-surface-3">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={busy || !password}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Reset
          </button>
        </div>
      </div>
    </Modal>
  );
}
