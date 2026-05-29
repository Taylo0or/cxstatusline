import { spawnSync } from "node:child_process";

const scenarios = [
  ["compact", "compact", 5],
  ["usage", "usage", 5],
  ["git", "git", 8],
  ["multiline", "multiline", 8]
];

for (const [name, preset, maxAvgMs] of scenarios) {
  const result = spawnSync(process.execPath, [
    "./bin/cxstatusline.js",
    "bench",
    "--iterations",
    "200",
    "--preset",
    preset,
    "--format",
    "plain",
    "--width",
    "120",
    "--max-avg-ms",
    String(maxAvgMs)
  ], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.stdout.trim()) console.log(`${name}: ${result.stdout.trim()}`);
  if (result.stderr.trim()) console.error(result.stderr.trim());
  if (result.status !== 0) process.exit(result.status ?? 1);
}
