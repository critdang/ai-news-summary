import { briefingImpact } from "@/lib/briefing";

describe("briefingImpact", () => {
  it.each([
    [10, "critical"],
    [9, "critical"],
    [8.9, "medium"],
    [6, "medium"],
    [5.9, "low"],
    [0, "low"],
  ])("maps score %s to %s", (score, impact) => {
    expect(briefingImpact(score)).toBe(impact);
  });
});
