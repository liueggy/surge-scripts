// Surge 网络状态面板（已移除 GitHub 更新监控展示）
// 注意：手机 Surge 配置中的 gh-watch.js cron 仍需单独禁用。
const TEST_URL = "http://cp.cloudflare.com/generate_204";

function fmtBytes(n) {
  if (n == null || !Number.isFinite(Number(n))) return "-";
  n = Number(n);
  const units = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n.toFixed(0) : n.toFixed(n < 10 ? 1 : 0)) + " " + units[i];
}

function currentSelections() {
  try { return ($surge.selectGroupDetails() || {}).decisions || {}; }
  catch (e) { return {}; }
}

function getTraffic(cb) {
  try {
    $httpAPI("GET", "/v1/traffic", null, function (r) {
      cb(r && r.connector ? r.connector : null);
    });
  } catch (e) { cb(null); }
}

function mainPolicy(decisions) {
  return decisions["节点选择"] || decisions["智能助理"] || "DIRECT";
}

function probe(policy, cb) {
  const start = Date.now();
  try {
    $httpClient.get({ url: TEST_URL, policy: policy, timeout: 5 }, function (err) {
      cb(err ? null : Date.now() - start);
    });
  } catch (e) { cb(null); }
}

function build(policy, ms, traffic, decisions) {
  const lines = [];
  lines.push("🧭 当前策略：" + policy);
  lines.push(ms == null ? "⚡ HTTP 探测：不可用" : "⚡ HTTP 探测：" + ms + " ms");
  if (!traffic) {
    lines.push("📶 流量：读取失败");
  } else {
    let tin = 0, tout = 0, sin = 0, sout = 0;
    for (const k in traffic) {
      const c = traffic[k] || {};
      tin += Number(c.in) || 0;
      tout += Number(c.out) || 0;
      sin += Number(c.inCurrentSpeed) || 0;
      sout += Number(c.outCurrentSpeed) || 0;
    }
    lines.push("📶 ↑" + fmtBytes(tout) + " ↓" + fmtBytes(tin));
    lines.push("🚀 ↑" + fmtBytes(sout) + "/s ↓" + fmtBytes(sin) + "/s");
  }
  return lines.join("\n");
}

const decisions = currentSelections();
const policy = mainPolicy(decisions);
getTraffic(function (traffic) {
  probe(policy, function (ms) {
    $done({
      title: "Surge 网络状态",
      content: build(policy, ms, traffic, decisions),
      style: ms == null ? "alert" : "info"
    });
  });
});
