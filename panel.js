// ============================================================
// panel.js — Surge 信息面板（generic 脚本）
// 节点延迟 / 流量 / GitHub 关注仓库状态
// GitHub 数据由 gh-watch.js 写入（key: ghwatch_state）
// ============================================================

const TEST_URL = "http://cp.cloudflare.com/generate_204";
const GH_KEY = "ghwatch_state";

function fmtBytes(n) {
  if (n == null || isNaN(n)) return "-";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
  return (i === 0 ? n : n.toFixed(n < 10 ? 1 : 0)) + u[i];
}

function currentSelections() {
  try {
    return ($surge.selectGroupDetails() || {}).decisions || {};
  } catch (e) {
    return {};
  }
}

function getTraffic(cb) {
  try {
    $httpAPI("GET", "/v1/traffic", null, function (r) {
      cb(r && r.connector ? r.connector : null);
    });
  } catch (e) {
    cb(null);
  }
}

function mainPolicy(decisions) {
  return decisions["节点选择"] || decisions["智能助理"] || "DIRECT";
}

function probe(policy, cb) {
  const t0 = Date.now();
  try {
    $httpClient.get({ url: TEST_URL, policy: policy, timeout: 5 }, function (err) {
      cb(err ? null : Date.now() - t0);
    });
  } catch (e) {
    cb(null);
  }
}

function ghState() {
  try {
    const s = $persistentStore.read(GH_KEY);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}

const KIND = { release: "发布", tag: "tag", commit: "提交" };

function ghLines() {
  const st = ghState();
  if (!st || !st.repos) return ["🐙 GitHub：尚未检查（等 cron 跑一次）"];

  const names = Object.keys(st.repos);
  const fresh = names.filter(function (n) {
    const r = st.repos[n];
    return r && r.isNew;
  });
  const failed = names.filter(function (n) {
    const r = st.repos[n];
    return r && r.error;
  });

  let head = "🐙 关注 " + names.length + " 个 · " + (st.checkedAt || "?") + " 检查";
  if (st.token) head += " · 🔑";
  if (failed.length > 0) head += " · ⚠ " + failed.length + " 失败";

  const out = [head];

  if (fresh.length > 0) {
    out[0] += "\n   ⚠️ " + fresh.length + " 个更新";
    fresh.slice(0, 3).forEach(function (n) {
      const r = st.repos[n];
      const t = (r.zh || r.title || "").slice(0, 18);
      out.push("   · " + n.split("/")[1] + " " + r.tag + " " + t);
    });
  } else {
    names.slice(0, 2).forEach(function (n) {
      const r = st.repos[n];
      if (!r || !r.tag) return;
      const t = (r.zh || r.title || "").slice(0, 16);
      out.push("   · " + n.split("/")[1] + " " + r.tag + " " + t);
    });
  }
  return out;
}

function build(policy, ms, traffic, decisions) {
  const lines = [];
  lines.push("🧭 " + (decisions["节点选择"] || "-"));
  lines.push(ms == null ? "⚡ 延迟：不可用" : "⚡ 延迟 " + ms + " ms");

  if (traffic) {
    let tin = 0, tout = 0, sin = 0, sout = 0;
    for (const k in traffic) {
      const c = traffic[k] || {};
      tin += c.in || 0; tout += c.out || 0;
      sin += c.inCurrentSpeed || 0; sout += c.outCurrentSpeed || 0;
    }
    lines.push("📶 ↑" + fmtBytes(tin) + " ↓" + fmtBytes(tout) +
      " · ↑" + fmtBytes(sout) + "/s ↓" + fmtBytes(sin) + "/s");
  } else {
    lines.push("📶 流量：读取失败");
  }

  ghLines().forEach(function (l) { lines.push(l); });
  return lines.join("\n");
}

const decisions = currentSelections();
const policy = mainPolicy(decisions);

getTraffic(function (traffic) {
  probe(policy, function (ms) {
    $done({
      title: "Surge 状态",
      content: build(policy, ms, traffic, decisions),
      style: ms == null ? "alert" : "info",
    });
  });
});
