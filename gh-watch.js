// ============================================================
// gh-watch.js — Surge cron 脚本：追踪你关心的 GitHub 仓库
//
// 特性
//   · 用 GITHUB_TOKEN（存在 $persistentStore，key: ghwatch_token）
//     配额 5000/h，可读私有仓库
//   · 仓库列表放在 gist 的 repos.json 里，随时手动加，不用改脚本
//   · 英文标题自动翻译成中文（translate.googleapis.com，带本地缓存）
//   · 只在有更新时推送通知
//
// repos.json 两种写法都支持：
//   ["owner/repo", "owner/repo2"]
//   [{"repo":"owner/repo","note":"备注"}, ...]
// ============================================================

// 仓库列表单独放在一个 Gist 里，方便手动编辑
const REPOS_URL =
  "https://gist.githubusercontent.com/liueggy/f724f6e76178912f669fa042957d8a71/raw/repos.json";

const TOKEN_KEY = "ghwatch_token";
const STATE_KEY = "ghwatch_state";
const TR_KEY = "ghwatch_tr";
const NOTIFY = true;
const MAX_TR_CACHE = 300;

// 拉不到 repos.json 时的兜底
const FALLBACK_REPOS = ["Rabbit-Spec/Surge", "ddgksf2013/Scripts"];

function hm() {
  const d = new Date();
  const p = (x) => (x < 10 ? "0" + x : "" + x);
  return p(d.getHours()) + ":" + p(d.getMinutes());
}

function readJSON(key, dflt) {
  try {
    const s = $persistentStore.read(key);
    if (s) return JSON.parse(s);
  } catch (e) {}
  return dflt;
}

function writeJSON(key, obj) {
  try {
    $persistentStore.write(JSON.stringify(obj), key);
    return true;
  } catch (e) {
    console.log("write " + key + " failed: " + e);
    return false;
  }
}

function http(opts, cb) {
  try {
    $httpClient.get(opts, function (err, resp, data) {
      cb(err, resp, data);
    });
  } catch (e) {
    cb(String(e), null, null);
  }
}

// ---------- 仓库列表 ----------
function loadRepos(cb) {
  http({ url: REPOS_URL + "?t=" + Date.now(), timeout: 12 }, function (e, r, d) {
    let list = null;
    if (!e && r && r.status === 200 && d) {
      try {
        const j = JSON.parse(d);
        const arr = Array.isArray(j) ? j : j.repos || [];
        list = arr
          .map(function (x) {
            if (typeof x === "string") return { repo: x, note: "" };
            if (x && x.repo) return { repo: x.repo, note: x.note || "" };
            return null;
          })
          .filter(Boolean);
      } catch (err) {
        console.log("repos.json 解析失败: " + err);
      }
    }
    if (!list || list.length === 0) {
      console.log("用兜底仓库列表");
      list = FALLBACK_REPOS.map(function (r) {
        return { repo: r, note: "" };
      });
    }
    cb(list);
  });
}

// ---------- 翻译（英文 → 中文，带缓存）----------
function translate(text, cache, cb) {
  if (!text || !/[A-Za-z]{3,}/.test(text)) return cb(text || "");
  if (cache[text]) return cb(cache[text]);
  const u =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=zh-CN&dt=t&q=" +
    encodeURIComponent(text);
  http({ url: u, timeout: 10 }, function (e, r, d) {
    if (e || !r || r.status !== 200 || !d) {
      console.log("翻译失败，保留原文");
      return cb(text);
    }
    try {
      const arr = JSON.parse(d)[0];
      const out = arr
        .map(function (seg) {
          return seg && seg[0] ? seg[0] : "";
        })
        .join("")
        .trim();
      if (out) {
        cache[text] = out;
        return cb(out);
      }
    } catch (err) {
      console.log("翻译解析失败");
    }
    cb(text);
  });
}

// ---------- GitHub API ----------
function ghHeaders(token) {
  const h = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Surge-gh-watch",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (token) h.Authorization = "Bearer " + token;
  return h;
}

function api(url, token, cb) {
  http({ url: url, headers: ghHeaders(token), timeout: 15 }, function (e, r, d) {
    if (e) return cb("NET:" + e, null, null);
    let j = null;
    try {
      j = d ? JSON.parse(d) : null;
    } catch (err) {}
    return cb(null, r ? r.status : 0, j);
  });
}

function fetchLatest(item, token, cb) {
  const base = "https://api.github.com/repos/" + item.repo;

  api(base + "/releases/latest", token, function (e, status, rel) {
    if (!e && status === 200 && rel && rel.tag_name) {
      return cb(null, {
        kind: "release",
        tag: rel.tag_name,
        title: rel.name || rel.tag_name,
        url: rel.html_url || "https://github.com/" + item.repo,
        at: rel.published_at || "",
      });
    }
    // 没有 release → 看最新提交
    api(base + "/commits?per_page=1", token, function (e2, st2, cs) {
      if (!e2 && st2 === 200 && Array.isArray(cs) && cs.length > 0) {
        const c = cs[0];
        const msg = (c.commit && c.commit.message) || "";
        return cb(null, {
          kind: "commit",
          tag: (c.sha || "").slice(0, 7),
          title: msg.split("\n")[0],
          url: c.html_url || "",
          at: (c.commit && c.commit.author && c.commit.author.date) || "",
        });
      }
      cb((e2 || e) || "HTTP " + (st2 || status), null);
    });
  });
}

// ---------- 主流程 ----------
const token = ($persistentStore.read(TOKEN_KEY) || "").trim();
const state = readJSON(STATE_KEY, { repos: {} });
if (!state.repos) state.repos = {};
const trCache = readJSON(TR_KEY, {});

loadRepos(function (items) {
  if (items.length === 0) {
    $done({});
    return;
  }

  let pending = items.length;
  const changed = [];

  function finishAll() {
    // 翻译缓存瘦身
    const keys = Object.keys(trCache);
    if (keys.length > MAX_TR_CACHE) {
      keys.slice(0, keys.length - MAX_TR_CACHE).forEach(function (k) {
        delete trCache[k];
      });
    }
    writeJSON(TR_KEY, trCache);
    state.checkedAt = hm();
    state.checkedTs = Date.now();
    state.token = !!token;
    state.repos_ok = items.length;
    writeJSON(STATE_KEY, state);

    if (changed.length > 0) {
      console.log("更新: " + changed.join(" | "));
      if (NOTIFY) {
        const body = changed
          .map(function (c) {
            return c.repo + " " + c.zh;
          })
          .join("\n")
          .slice(0, 400);
        $notification.post(
          "GitHub 有更新",
          changed.length + " 个仓库",
          body
        );
      }
      try {
        $surge.logbook("GitHub 更新：" + changed.map(function (c) { return c.repo; }).join("、"));
      } catch (err) {}
    } else {
      console.log("无更新（" + items.length + " 个仓库）");
    }
    $done({});
  }

  items.forEach(function (item) {
    fetchLatest(item, token, function (err, info) {
      const prev = state.repos[item.repo] || {};

      if (err || !info) {
        state.repos[item.repo] = {
          tag: prev.tag || null,
          kind: prev.kind || null,
          title: prev.title || null,
          zh: prev.zh || null,
          note: item.note || prev.note || "",
          isNew: false,
          error: String(err).slice(0, 60),
          at: prev.at || null,
        };
        console.log(item.repo + " 失败: " + err);
        if (--pending === 0) finishAll();
        return;
      }

      const firstRun = !prev.tag;
      const isNew = !firstRun && prev.tag !== info.tag;

      // 翻译标题（无更新时也用缓存，避免重复请求）
      translate(info.title, trCache, function (zh) {
        state.repos[item.repo] = {
          tag: info.tag,
          kind: info.kind,
          title: info.title,
          zh: zh,
          url: info.url,
          note: item.note || "",
          publishedAt: info.at,
          isNew: isNew,
          at: hm(),
          error: null,
        };
        if (isNew) {
          changed.push({ repo: item.repo, zh: zh, kind: info.kind });
        } else if (firstRun) {
          console.log(item.repo + " 基线 [" + info.kind + "] " + info.tag + " " + zh);
        }
        if (--pending === 0) finishAll();
      });
    });
  });
});
