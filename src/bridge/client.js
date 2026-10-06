// 桥的客户端侧 —— 两种 transport，同一个接口。
//
// 为什么把它做成可插拔的：`createInprocTransport` 直接把调用打到**那个真的
// Obsidian 适配层**（测试里是 createFakeAdapter）上，于是
// 「核心 → 远程适配层 → transport → 宿主适配层」
// 这一整条链在生产里和在 Playwright 里**是同一条代码路径**，只是没有 socket。
// 这是整套设计唯一值得相信的地方：远程适配层的行为透明性由它来证明，
// 不需要起一个 Electron 才能验。
//
// 接口（remote.js 只认这五件事）：
//   call(method, args)          → RPC。**失败就 reject**，兜底由 remote.js 做
//   getStored(key) / setStored  → 命名空间化的 viewstate / prefs
//   blobUrl(path)               → 同步拿一个能塞进 <img src> 的地址
//   readBinary(path)            → ArrayBuffer | null
//   subscribe({onCard,onStatus})→ 订阅；返回退订函数

import { BRIDGE_VERSION, timeoutOf } from "./protocol.js";

/** 把任何形状的失败统一成一句话，别把 fetch 的 TypeError 原样漏给核心。 */
function reasonOf(e) {
  return String((e && e.message) || e || "未知错误");
}

// ────────────────────────────────────────────────────────────────
// 进程内（测试用）
// ────────────────────────────────────────────────────────────────

/**
 * 直接把调用打到 `adapter` 上，不走网络。
 *
 * @param {object} opts
 * @param {object} opts.adapter  宿主侧的适配层实现（契约那个形状）
 * @param {object} [opts.store]  { get(key), set(key, value) }；缺省用 localStorage
 * @param {Function} [opts.blobUrl] (path) => string。缺省回 ""（测试里图片多半不关心）
 * @param {Function|string|string[]} [opts.failOn]
 *   故障注入：哪些方法的 call 直接失败。传函数或方法名（可多个）。
 *   契约的逐方法兜底表最容易悄悄烂掉，这张网就是用来钉它的。
 * @param {Function} [opts.failStore] (key) => boolean，存储读写的故障注入
 */
export function createInprocTransport({ adapter, store, blobUrl, failOn, failStore } = {}) {
  const failSet =
    typeof failOn === "function"
      ? failOn
      : failOn == null
        ? () => false
        : (m) => (Array.isArray(failOn) ? failOn : [failOn]).includes(m);

  // 缺省的存储：localStorage（测试台里本来就有），拿不到就退回一个内存 Map。
  const mem = new Map();
  const backing =
    store ||
    {
      get(key) {
        try {
          return globalThis.localStorage ? globalThis.localStorage.getItem(key) : (mem.has(key) ? mem.get(key) : null);
        } catch {
          return mem.has(key) ? mem.get(key) : null;
        }
      },
      set(key, value) {
        try {
          if (globalThis.localStorage) globalThis.localStorage.setItem(key, value);
          else mem.set(key, value);
        } catch {
          mem.set(key, value);
        }
      },
    };

  let closed = false;

  return {
    kind: "inproc",

    async call(method, args = []) {
      if (closed) throw new Error("桥已经关了");
      if (failSet(method)) throw new Error("注入的失败：" + method);
      const fn = adapter && adapter[method];
      if (typeof fn !== "function") throw new Error("宿主适配层没有这个方法：" + method);
      return fn.apply(adapter, args);
    },

    async getStored(key) {
      if (failStore && failStore(key)) throw new Error("注入的存储读失败：" + key);
      return backing.get(key);
    },

    async setStored(key, value) {
      if (failStore && failStore(key)) throw new Error("注入的存储写失败：" + key);
      backing.set(key, value);
    },

    blobUrl(path) {
      return blobUrl ? blobUrl(path) : "";
    },

    async readBinary(path) {
      if (failSet("readBinary")) throw new Error("注入的失败：readBinary");
      const fn = adapter && adapter.readBinary;
      if (typeof fn !== "function") return null;
      return fn.call(adapter, path);
    },

    /**
     * 进程内的订阅。返回的不只是退订函数——还挂了一个 `emit`，
     * 让测试能**演**一次外部改动（走的是与真宿主同一条回调）。
     */
    subscribe({ onCard, onStatus } = {}) {
      const cb = (card, from, gone) => {
        if (onCard) onCard({ card: card || null, from, gone });
      };
      const off = typeof adapter.watchCards === "function" ? adapter.watchCards(cb) : () => {};
      if (onStatus) onStatus("open");
      const unsubscribe = () => {
        try {
          off();
        } catch {
          /* 退订失败不该把拆机搅黄 */
        }
      };
      unsubscribe.emit = (payload) => cb(payload && payload.card, payload && payload.from, payload && payload.gone);
      unsubscribe.status = (s) => onStatus && onStatus(s);
      return unsubscribe;
    },

    close() {
      closed = true;
    },
  };
}

// ────────────────────────────────────────────────────────────────
// HTTP + SSE（生产用）
// ────────────────────────────────────────────────────────────────

/**
 * 真的走网络的那一份。跑在伴侣的渲染进程里（那里有 fetch 和 EventSource）。
 *
 * @param {object} opts
 * @param {string} opts.origin  如 "http://127.0.0.1:51234"
 * @param {string} opts.token   启动时由插件生成、随命令行传进来
 * @param {Function} [opts.fetchImpl] 便于测试替换
 * @param {Function} [opts.EventSourceImpl]
 */
export function createHttpTransport({ origin, token, fetchImpl, EventSourceImpl } = {}) {
  const doFetch = fetchImpl || ((...a) => globalThis.fetch(...a));
  const ES = EventSourceImpl || globalThis.EventSource;
  const base = String(origin || "").replace(/\/+$/, "");
  let closed = false;

  function authHeaders() {
    return { authorization: "Bearer " + token };
  }

  async function post(path, body, timeoutMs) {
    if (closed) throw new Error("桥已经关了");
    const ctl = typeof AbortController === "function" ? new AbortController() : null;
    const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs || 15000) : null;
    try {
      const res = await doFetch(base + path, {
        method: "POST",
        headers: { ...authHeaders(), "content-type": "application/json" },
        body: JSON.stringify(body == null ? {} : body),
        signal: ctl ? ctl.signal : undefined,
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    kind: "http",

    async call(method, args = []) {
      const env = await post("/rpc/" + encodeURIComponent(method), { args }, timeoutOf(method));
      // 信封是诚实的：{ok:false} 就是「这次调用没成功」。
      // 翻译成各方法自己契约形状的那句话，是 remote.js 的活（见 protocol.js 的 FALLBACKS）。
      if (!env || env.ok !== true) throw new Error((env && env.error && env.error.message) || "调用失败");
      return env.value;
    },

    async getStored(key) {
      const env = await post("/store/get", { key });
      if (!env || env.ok !== true) throw new Error((env && env.error && env.error.message) || "读存储失败");
      return env.value == null ? null : String(env.value);
    },

    async setStored(key, value) {
      const env = await post("/store/set", { key, value: value == null ? null : String(value) });
      if (!env || env.ok !== true) throw new Error((env && env.error && env.error.message) || "写存储失败");
    },

    // ⚠️ 这个必须是**同步**的：契约里 assetUrl 是 `(path) => string`，不是 Promise。
    // 端口和 token 在启动时就知道了，所以拼得出来——不必等一次往返。
    blobUrl(path) {
      return base + "/blob/" + encodeURIComponent(String(path == null ? "" : path)) + "?token=" + encodeURIComponent(token || "");
    },

    async readBinary(path) {
      try {
        const url = this.blobUrl(path);
        const res = await doFetch(url, { headers: authHeaders() });
        if (!res.ok) return null; // 读不出来按契约回 null，**绝不抛**
        return await res.arrayBuffer();
      } catch {
        return null;
      }
    },

    subscribe({ onCard, onStatus } = {}) {
      if (!ES) {
        if (onStatus) onStatus("closed");
        return () => {};
      }
      const url = base + "/events?token=" + encodeURIComponent(token || "");
      const es = new ES(url);
      es.onopen = () => onStatus && onStatus("open");
      es.onerror = () => onStatus && onStatus("closed"); // EventSource 自己会重连
      es.onmessage = (ev) => {
        if (!ev || !ev.data) return;
        if (ev.data === "ping") return; // 心跳，不是事件
        let payload;
        try {
          payload = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (onCard) onCard(payload);
      };
      const unsubscribe = () => {
        try {
          es.close();
        } catch {
          /* 同上 */
        }
      };
      unsubscribe.status = (s) => onStatus && onStatus(s);
      return unsubscribe;
    },

    close() {
      closed = true;
    },
  };
}

export { BRIDGE_VERSION };
