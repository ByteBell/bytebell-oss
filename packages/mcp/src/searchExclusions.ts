export const EXCLUSION_CATEGORIES = ["tests", "vendor", "config", "generated", "docs", "build"] as const;
export type ExclusionCategory = (typeof EXCLUSION_CATEGORIES)[number];

interface CategoryFilters {
  suffixes: string[];
  contains: string[];
}

const PRESETS: Record<ExclusionCategory, CategoryFilters> = {
  tests: {
    suffixes: [".test.ts", ".test.tsx", ".test.js", ".spec.ts", ".spec.js", "_test.go", "_spec.rb"],
    contains: ["/__tests__/", "/tests/", "/test/", "/spec/"],
  },
  vendor: {
    suffixes: [],
    contains: ["/node_modules/", "/vendor/", "/third_party/", "/.yarn/"],
  },
  config: {
    suffixes: [".lock", ".yaml", ".yml", ".toml", ".ini"],
    contains: ["/.github/", "/.vscode/", "/.idea/"],
  },
  generated: {
    suffixes: [".min.js", ".min.css", ".d.ts.map", ".js.map", ".pb.go", ".pb.ts"],
    contains: ["/dist/", "/build/", "/out/", "/generated/", "/.next/"],
  },
  docs: {
    suffixes: [".md", ".mdx", ".rst", ".txt"],
    contains: ["/docs/", "/documentation/"],
  },
  build: {
    suffixes: [".lock"],
    contains: ["/dist/", "/build/", "/target/", "/.gradle/", "/.cache/"],
  },
};

export function buildExclusionParams(categories: readonly ExclusionCategory[]): CategoryFilters {
  const suffixes = new Set<string>();
  const contains = new Set<string>();
  for (const category of categories) {
    const preset = PRESETS[category];
    for (const suffix of preset.suffixes) {
      suffixes.add(suffix);
    }
    for (const fragment of preset.contains) {
      contains.add(fragment);
    }
  }
  return { suffixes: Array.from(suffixes), contains: Array.from(contains) };
}

export const EXCLUSION_WHERE = `
  AND NOT ANY(suffix IN $excludeSuffixes WHERE f.relativePath ENDS WITH suffix)
  AND NOT ANY(fragment IN $excludeContains WHERE f.relativePath CONTAINS fragment)
`;
