// ===== Achievement tier styling (client-side) =====
// The achievement definitions themselves (id/label/description/icon/tier/
// unlocked) come from the server in the /api/analytics/me payload. This file
// just maps a tier to display colors so the badge grid is consistent.

import type { AchievementTier } from "../../types";

export const TIER_STYLES: Record<
  AchievementTier,
  { ring: string; bg: string; text: string; glow: string; label: string }
> = {
  bronze: {
    ring: "border-amber-700/60",
    bg: "bg-amber-700/10",
    text: "text-amber-600",
    glow: "shadow-[0_0_12px_-2px_rgba(180,83,9,0.5)]",
    label: "Bronze",
  },
  silver: {
    ring: "border-slate-400/60",
    bg: "bg-slate-400/10",
    text: "text-slate-300",
    glow: "shadow-[0_0_12px_-2px_rgba(148,163,184,0.5)]",
    label: "Silver",
  },
  gold: {
    ring: "border-yellow-500/60",
    bg: "bg-yellow-500/10",
    text: "text-yellow-500",
    glow: "shadow-[0_0_14px_-2px_rgba(234,179,8,0.6)]",
    label: "Gold",
  },
  platinum: {
    ring: "border-cyan-400/60",
    bg: "bg-cyan-400/10",
    text: "text-cyan-300",
    glow: "shadow-[0_0_16px_-2px_rgba(34,211,238,0.7)]",
    label: "Platinum",
  },
};
