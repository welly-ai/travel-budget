// codex 的 Stop 入口：node scripts/hooks/codex-stop.mjs
// 載入失敗（腳本或設定壞掉）時一律擋下，不默默放行。
try {
  const { runStop } = await import("./adapter.mjs");
  await runStop();
} catch (error) {
  const reason = `Stop 關卡無法載入（scripts/hooks）：${error instanceof Error ? error.message : String(error)}`;
  process.stdout.write(`${JSON.stringify({ decision: "block", reason })}\n`);
}
