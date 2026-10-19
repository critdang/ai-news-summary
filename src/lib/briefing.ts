export type BriefingImpact = "critical" | "medium" | "low";

export function briefingImpact(score: number): BriefingImpact {
  if (score >= 9) return "critical";
  if (score >= 6) return "medium";
  return "low";
}
