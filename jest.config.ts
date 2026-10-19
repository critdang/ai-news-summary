/** Jest config for AI News Summary (Feed2040 app). */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src", "<rootDir>/scripts"],
  testMatch: ["**/__tests__/**/*.test.ts", "**/*.test.ts"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        isolatedModules: true,
        tsconfig: "./tsconfig.json",
      },
    ],
  },
  collectCoverageFrom: [
    "src/lib/**/*.ts",
    "scripts/**/*.ts",
    "!src/lib/auth.ts",
    "!src/lib/rate-limit.ts",
  ],
  coverageDirectory: "<rootDir>/coverage",
  verbose: true,
};
