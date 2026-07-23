import { useState } from "react";
import { User, Loader2, KeyRound, ShieldCheck } from "lucide-react";
import { useAuth } from "../../../store/auth";
import { SectionHeader, Card, Field, SaveButton, MsgBox, inputClass } from "../ui";

const AVATAR_PRESETS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#ef4444",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#06b6d4", "#3b82f6",
];

export default function AccountSection() {
  const { user, updateProfile, changePassword } = useAuth();

  const [displayName, setDisplayName] = useState(user?.displayName ?? "");
  const [avatarColor, setAvatarColor] = useState(user?.avatarColor ?? "#6366f1");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<string | null>(null);
  const [profileErr, setProfileErr] = useState(false);

  const [curPw, setCurPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState(false);

  const saveProfile = async () => {
    setProfileBusy(true);
    setProfileErr(false);
    setProfileMsg(null);
    try {
      await updateProfile({ displayName: displayName.trim(), avatarColor });
      setProfileMsg("Profile updated.");
    } catch (e) {
      setProfileErr(true);
      setProfileMsg(e instanceof Error ? e.message : "Failed to update profile");
    } finally {
      setProfileBusy(false);
    }
  };

  const savePassword = async () => {
    if (newPw.length < 4) {
      setPwErr(true);
      setPwMsg("New password must be at least 4 characters.");
      return;
    }
    if (newPw !== confirmPw) {
      setPwErr(true);
      setPwMsg("New passwords do not match.");
      return;
    }
    setPwBusy(true);
    setPwErr(false);
    setPwMsg(null);
    try {
      await changePassword(curPw, newPw);
      setCurPw("");
      setNewPw("");
      setConfirmPw("");
      setPwMsg("Password changed.");
    } catch (e) {
      setPwErr(true);
      setPwMsg(e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setPwBusy(false);
    }
  };

  return (
    <section id="account" className="mb-8">
      <SectionHeader icon={<User size={18} />} title="Account" description="Your profile and sign-in credentials." />

      <Card className="mb-4">
        <div className="mb-4 flex items-center gap-4">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-full text-xl font-semibold text-white"
            style={{ background: avatarColor }}
          >
            {(displayName || user?.username || "U").charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-ink">{displayName || "—"}</p>
            <p className="text-sm text-ink-muted">@{user?.username}</p>
            <p className="mt-1 flex items-center gap-1 text-[11px] uppercase tracking-wide text-ink-muted">
              <ShieldCheck size={11} /> {user?.role === "ADMIN" ? "Administrator" : "User"}
            </p>
          </div>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <Field label="Display name">
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
              placeholder="Your name"
            />
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
              <input
                type="color"
                value={avatarColor}
                onChange={(e) => setAvatarColor(e.target.value)}
                className="h-7 w-7 cursor-pointer rounded-full border border-edge bg-transparent"
              />
            </div>
          </Field>
        </div>

        <div className="flex items-center gap-2">
          <SaveButton busy={profileBusy} onClick={saveProfile} disabled={!displayName.trim()}>
            Save profile
          </SaveButton>
        </div>
        <MsgBox msg={profileMsg} error={profileErr} />
      </Card>

      <Card>
        <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
          <KeyRound size={15} /> Change password
        </h4>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Current password">
            <input
              type="password"
              value={curPw}
              onChange={(e) => setCurPw(e.target.value)}
              className={inputClass}
              autoComplete="current-password"
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              value={newPw}
              onChange={(e) => setNewPw(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
          <Field label="Confirm new password">
            <input
              type="password"
              value={confirmPw}
              onChange={(e) => setConfirmPw(e.target.value)}
              className={inputClass}
              autoComplete="new-password"
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <SaveButton
            busy={pwBusy}
            onClick={savePassword}
            disabled={!curPw || !newPw || !confirmPw}
          >
            Update password
          </SaveButton>
        </div>
        <MsgBox msg={pwMsg} error={pwErr} />
      </Card>
    </section>
  );
}
