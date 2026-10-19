import { runIngestion } from "./ingest.ts";

runIngestion().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error("[ingest] Fatal error:", message);
  process.exitCode = 1;
});
