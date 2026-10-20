import { groupSourcesByCategory } from "@/lib/readerCategories";

describe("groupSourcesByCategory", () => {
  it("groups sources and sums article counts by category", () => {
    const sources = [
      { id: "a", category: "AI", categoryColor: "#123456", _count: { articles: 3 } },
      { id: "b", category: "AI", categoryColor: null, _count: { articles: 2 } },
      { id: "c", category: "Maker", categoryColor: "#654321", _count: { articles: 4 } },
    ];

    expect(groupSourcesByCategory(sources)).toEqual([
      {
        value: "AI",
        label: "AI",
        count: 5,
        color: "#123456",
        sources: sources.slice(0, 2),
      },
      {
        value: "Maker",
        label: "Maker",
        count: 4,
        color: "#654321",
        sources: sources.slice(2),
      },
    ]);
  });

  it("places blank and whitespace-only categories under Uncategorized", () => {
    const sources = [
      { id: "a", category: "", _count: { articles: 1 } },
      { id: "b", category: "   ", _count: { articles: 2 } },
    ];

    const [group] = groupSourcesByCategory(sources);

    expect(group.label).toBe("Uncategorized");
    expect(group.count).toBe(3);
    expect(group.sources).toEqual(sources);
  });
});
