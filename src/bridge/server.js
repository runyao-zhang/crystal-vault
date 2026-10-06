// 桥的服务端 —— 住在 Obsidian 插件这一侧。
//
// 为什么在插件里而不是伴侣里：`app` / `vault` / `metadataCache` 都只在这一侧。
// 服务端做的事情少得出奇——它只是把已经有的一份适配层实现（createObsidianAdapter）
// 转发到网络上。**适配层本身一个字都不用改**，桥是第二个适配层实现，
// 转发给它而已（见 src/adapters/remote.js 顶上那段）。
//
// ⚠️ 三条纪律：
//   1. **只绑 127.0.0.1**，绝不 0.0.0.0。这台机器上的其它程序不该够得着它。
//   2. **任何一条路由出错都不许把插件搞崩**：全部包在 try 里，回一句人能读的错误。
//      这是用户的主力工具，一个连接把整个 Obsidian 带走是不可接受的。
//   3. token 每次启动重新生成（32 字节 hex）。它不是密码学意义上的隔离——
//      同用户的非管理员进程读得到 %TEMP% 里那个发现文件——而是"别让随便一个
//      网页/localhost 扫描器撞进来"。README 里要如实写，不暗示我们有不存在的隔离。

import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { RPC_METHODS, BRIDGE_VERSION, assertBridgeCoversContract } from "./protocol.js";

/** 最大请求体。RPC 的载荷都是小 JSON；给 8MB 绰绰有余，同时挡住内存打爆。 */
const MAX_BODY = 8 * 1024 * 1024;

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(new Error("请求体太大"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("请求体不是合法 JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(body);
}

/**
 * @param {object} opts
 * @param {object} opts.adapter   宿主侧的适配层（createObsidianAdapter 的产物）
 * @param {object} opts.store     { get(key), set(key, value) } —— 插件的 data.json
 * @param {number} [opts.version] 插件版本，给 /health 报
 * @returns {{start: () => Promise<{port:number, token:string}>, stop: () => Promise<void>}}
 */
export function createBridgeServer({ adapter, store, version = "", heartbeatMs = 5000 } = {}) {
  if (!adapter) throw new Error("[bridge] 缺少 adapter");
  assertBridgeCoversContract();

  const token = randomBytes(32).toString("hex");
  /** SSE 客户端。每个是一条 `res`，外加一个还活着没有的标记。 */
  const clients = new Set();
  let server = null;
  let stopWatch = null;
  let stopped = false;

  /** 从 url 里取 token：Authorization 头优先，其次是 query（`<img src>` 和 EventSource 设不了头）。 */
  function tokenOk(req, url) {
    const h = req.headers && req.headers.authorization;
    if (h && h.startsWith("Bearer ")) return h.slice(7) === token;
    return url.searchParams.get("token") === token;
  }

  function broadcast(payload) {
    const line = "data: " + JSON.stringify(payload) + "\n\n";
    for (const res of Array.from(clients)) {
      try {
        res.write(line);
      } catch {
        clients.delete(res);
      }
    }
  }

  // 订阅一次，广播给所有客户端。**一次**——不是每个 SSE 连接订阅一次，
  // 那样客户端开三个窗口就会有三份重复的 vault 监听（fake.js 顶上那段
  // 记着"宿主重挂时旧实例的监听没退"这类堆积是怎么来的）。
  function ensureWatch() {
    if (stopWatch || typeof adapter.watchCards !== "function") return;
    stopWatch = adapter.watchCards((card, from, gone) => {
      broadcast({ card: card || null, from: from || null, gone: gone || null });
    });
  }

  async function handleRpc(req, res, method) {
    // 只有归类为 RPC 的方法才走这条路由。不在名单里的一律拒掉——
    // 不拒的话 `/rpc/loadViewState` 会绕过 /store 那条命名空间逻辑，
    // 直接打到宿主适配层上，用**没有后缀的键**读写，两边就串了。
    if (!RPC_METHODS.includes(method)) {
      return sendJson(res, 404, { ok: false, error: { message: "这个方法不走 RPC：" + method } });
    }
    const body = await readBody(req);
    const args = Array.isArray(body.args) ? body.args : [];
    try {
      const value = await adapter[method].apply(adapter, args);
      sendJson(res, 200, { ok: true, value: value === undefined ? null : value });
    } catch (e) {
      // 逐方法的兜底是**客户端**的活（它才知道每个方法的契约形状），
      // 这里只如实报"失败了"。
      sendJson(res, 200, { ok: false, error: { message: String((e && e.message) || e) } });
    }
  }

  async function handleStore(req, res, action) {
    const body = await readBody(req);
    const key = String(body.key == null ? "" : body.key);
    if (!key) return sendJson(res, 200, { ok: false, error: { message: "缺 key" } });
    try {
      if (action === "get") {
        const v = store && store.get ? store.get(key) : null;
        sendJson(res, 200, { ok: true, value: v == null ? null : String(v) });
      } else {
        if (!store || !store.set) return sendJson(res, 200, { ok: false, error: { message: "宿主没有存储" } });
        // 值一律以**字符串**过桥：视图状态与偏好本来就是 JSON 文本，
        // 让它们在线路上保持一种形状，省掉"有时是对象有时是串"的整类怪事。
        store.set(key, body.value == null ? null : String(body.value));
        sendJson(res, 200, { ok: true, value: null });
      }
    } catch (e) {
      sendJson(res, 200, { ok: false, error: { message: String((e && e.message) || e) } });
    }
  }

  /**
   * 原始字节，**支持 Range**。
   *
   * 为什么不让 RPC 直接回 base64/数组：PDF 动辄几十 MB，塞进 JSON 要走
   * 一次完整的字符串化 + 解析，内存翻好几倍；而 pdf.js 想按需取页时，
   * Range 是它唯一能用的方式。
   */
  async function handleBlob(req, res, url) {
    let path = decodeURIComponent(url.pathname.slice("/blob/".length));
    if (!path) return sendJson(res, 404, { ok: false, error: { message: "缺路径" } });
    let buf;
    try {
      buf = await adapter.readBinary(path);
    } catch {
      buf = null;
    }
    if (buf == null) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      return res.end("读不到");
    }
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const total = bytes.length;

    // Range: bytes=a-b（pdf.js 会这么要）。解析不出来就整份发。
    const range = req.headers.range;
    let start = 0;
    let end = total - 1;
    let partial = false;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      if (m && (m[1] || m[2])) {
        if (m[1]) {
          start = Number(m[1]);
          end = m[2] ? Math.min(Number(m[2]), total - 1) : total - 1;
        } else {
          start = Math.max(0, total - Number(m[2])); // 后缀范围：最后 N 字节
          end = total - 1;
        }
        if (start > end || start >= total) {
          res.writeHead(416, { "content-range": "bytes */" + total });
          return res.end();
        }
        partial = true;
      }
    }

    const slice = bytes.subarray(start, end + 1);
    const headers = {
      "content-type": "application/octet-stream",
      "content-length": String(slice.length),
      "accept-ranges": "bytes",
      "cache-control": "no-store",
    };
    if (partial) headers["content-range"] = "bytes " + start + "-" + end + "/" + total;
    res.writeHead(partial ? 206 : 200, headers);
    res.end(Buffer.from(slice));
  }

  function handleEvents(req, res) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    res.write(": connected\n\n");
    clients.add(res);
    ensureWatch();
    // 心跳：伴侣那边的看门狗靠它判断"桥还活着没有"。
    // 顺带把中间任何一层缓冲/代理的空闲超时顶掉。
    // 间隔可配（**为了能被测**：默认 5 秒，探针里调成 150ms 就不用干等）。
    const beat = setInterval(() => {
      try {
        res.write("data: ping\n\n");
      } catch {
        /* 下一次写失败时会被清掉 */
      }
    }, heartbeatMs);
    const cleanup = () => {
      clearInterval(beat);
      clients.delete(res);
    };
    req.on("close", cleanup);
    req.on("error", cleanup);
  }

  async function route(req, res) {
    let url;
    try {
      url = new URL(req.url, "http://127.0.0.1");
    } catch {
      return sendJson(res, 400, { ok: false, error: { message: "坏 URL" } });
    }

    // /health 不要 token：伴侣启动时用它判断"那个端口上是不是我们的桥"，
    // 不做任何数据操作，泄露不了什么。
    if (url.pathname === "/health") {
      return sendJson(res, 200, { ok: true, version, bridge: BRIDGE_VERSION });
    }

    if (!tokenOk(req, url)) {
      return sendJson(res, 401, { ok: false, error: { message: "token 不对" } });
    }

    if (req.method === "GET" && url.pathname === "/events") return handleEvents(req, res);
    if (req.method === "GET" && url.pathname.startsWith("/blob/")) return handleBlob(req, res, url);
    if (req.method === "POST" && url.pathname === "/store/get") return handleStore(req, res, "get");
    if (req.method === "POST" && url.pathname === "/store/set") return handleStore(req, res, "set");
    if (req.method === "POST" && url.pathname.startsWith("/rpc/")) {
      return handleRpc(req, res, decodeURIComponent(url.pathname.slice("/rpc/".length)));
    }
    return sendJson(res, 404, { ok: false, error: { message: "没有这条路由" } });
  }

  return {
    async start() {
      if (server) return { port: server.address().port, token };
      server = createServer((req, res) => {
        // ⚠️ 最外面这一层是保命的：任何路由里漏出来的异常都不许掀翻插件。
        Promise.resolve()
          .then(() => route(req, res))
          .catch((e) => {
            try {
              sendJson(res, 500, { ok: false, error: { message: String((e && e.message) || e) } });
            } catch {
              /* 连回话都回不了就算了 */
            }
          });
      });
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        // 只绑回环。0.0.0.0 会让同网段的机器够得着这个库。
        server.listen(0, "127.0.0.1", () => {
          server.off("error", reject);
          resolve();
        });
      });
      return { port: server.address().port, token };
    },

    async stop() {
      if (stopped) return;
      stopped = true;
      if (stopWatch) {
        try {
          stopWatch();
        } catch {
          /* 退订失败不该挡住关机 */
        }
        stopWatch = null;
      }
      for (const res of Array.from(clients)) {
        try {
          res.end();
        } catch {
          /* 同上 */
        }
      }
      clients.clear();
      if (server) {
        await new Promise((resolve) => server.close(() => resolve()));
        server = null;
      }
    },
  };
}
