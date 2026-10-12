// claude 的 PreToolUse 入口：node scripts/hooks/claude-pretooluse.mjs
// 載入失敗時一律拒絕，不默默放行。
try {
  const { runPreToolUse } = await import("./adapter.mjs");
  await runPreToolUse();
} catch (error) {
  const reason = `PreToolUse 防護無法載入（scripts/hooks）：${error instanceof Error ? error.message : String(error)}`;
  const output = { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: reason } };
  process.stdout.write(`${JSON.stringify(output)}\n`);
}
