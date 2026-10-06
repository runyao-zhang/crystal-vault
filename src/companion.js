// 悬浮伴侣的宿主侧：找到它、把它拉起来、桥的生命周期、以及它死了怎么收场。
//
// **这个文件不是适配层**（它不进 adapter.js 那份契约），也不是核心——
// 它是插件的一个宿主侧工具模块，所以 `node:*` 和 `process` 在这儿是允许的。
// 写成独立文件是因为 `entry-plugin.js` 顶上那条规矩：「这个文件里不该有业务逻辑」。
//
// ── 三件必须做对的事 ──
//
// 1. **`ELECTRON_RUN_AS_NODE` 要从子进程环境里删掉。** 这一条是从上游继承下来的
//    陷阱：那个变量一旦在环境里，Electron 可执行文件会**当成纯 Node 启动**——
//    不建窗口、不报错、什么都不发生。用户看到的就是「点了没反应」。
//    `NODE_OPTIONS` 同理（可能塞进 --require 之类的东西）。
//
// 2. **只绑回环**（在 bridge/server.js 里），发现文件写在 %TEMP%。
//    那不是密码学隔离——同用户的进程读得到——但挡住了"随便一个网页扫 localhost"。
//
// 3. **伴侣死了要能重来。** 它可能是被任务管理器杀的、可能是崩的。
//    这里记着 child 的退出，下一次 launch 干净重来，而不是以为它还活着。

import { spawn } from "node:child_process";
import { existsSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createBridgeServer } from "./bridge/server.js";

/** 独立启动（不是插件 spawn 的）时靠这个文件找到桥。 */
const DISCOVERY_FILE = "crystal-vault-float.json";

/** 伴侣可执行文件的名字。electron-builder 那边 productName 定的。 */
const EXE_NAME = "CrystalFloat.exe";

/**
 * 按顺序找伴侣。**找得到就用，找不到回 null**——调用方据此决定是提示下载还是直接起。
 *
 * 顺序：显式设置 → 常见的安装位置 → vault 旁边（portable 那份解压在这儿）。
 */
export function detectCompanionPath({ explicit = "", vaultPath = "", env = process.env } = {}) {
  const candidates = [];
  if (explicit) candidates.push(explicit);
  const local = env.LOCALAPPDATA;
  const prog = env.PROGRAMFILES;
  const prog86 = env["PROGRAMFILES(X86)"];
  if (local) {
    candidates.push(join(local, "Programs", "CrystalFloat", EXE_NAME));
    candidates.push(join(local, "CrystalFloat", EXE_NAME));
  }
  if (prog) candidates.push(join(prog, "CrystalFloat", EXE_NAME));
  if (prog86) candidates.push(join(prog86, "CrystalFloat", EXE_NAME));
  if (vaultPath) candidates.push(join(vaultPath, EXE_NAME));

  for (const p of candidates) {
    try {
      if (p && existsSync(p)) return p;
    } catch {
      /* 权限之类的读不了就跳过 */
    }
  }
  return null;
}

/**
 * 桥 + 伴侣进程的生命周期。
 *
 * @param {object} opts
 * @param {object} opts.adapter   宿主适配层（createObsidianAdapter 的产物）
 * @param {object} opts.store     { get(key), set(key,value) }
 * @param {string} opts.version   插件版本，给 /health 报
 * @param {Function} [opts.onLog] 子进程输出的一行（诊断用）
 */
export function createCompanion({ adapter, store, version = "", onLog = null } = {}) {
  let server = null;
  let conn = null; // {port, token}
  let child = null;
  let exited = false;

  /** 诊断环形缓冲：买家没有开发环境，这 200 行是他能给回来的唯一线索。 */
  const logs = [];
  function push(s) {
    logs.push(String(s));
    while (logs.length > 200) logs.shift();
    if (onLog) {
      try {
        onLog(logs[logs.length - 1]);
      } catch {
        /* 记日志不该把功能搅黄 */
      }
    }
  }

  /** 起桥（幂等）。**懒起**——没点过「独立窗口」的人不该多一个监听端口。 */
  async function ensureBridge() {
    if (conn) return conn;
    server = createBridgeServer({ adapter, store, version });
    conn = await server.start();
    push(`桥已启动：127.0.0.1:${conn.port}`);
    writeDiscovery();
    return conn;
  }

  /**
   * 发现文件：给"用户自己双击启动伴侣"那条路用。
   *
   * 写它，是为了两种启动顺序都能成立——先开 Obsidian 还是先开伴侣，
   * 对买家来说都该是"能用"。里面带 pid，读的时候要验它活着（见 server 那边）。
   */
  function writeDiscovery() {
    try {
      writeFileSync(
        join(tmpdir(), DISCOVERY_FILE),
        JSON.stringify({ port: conn.port, token: conn.token, pid: process.pid, startedAt: new Date().toISOString(), version }),
        "utf8"
      );
    } catch (e) {
      push("写发现文件失败（不影响从插件里启动）：" + ((e && e.message) || e));
    }
  }

  function clearDiscovery() {
    try {
      unlinkSync(join(tmpdir(), DISCOVERY_FILE));
    } catch {
      /* 本来就不在就算了 */
    }
  }

  /**
   * 把伴侣拉起来。
   *
   * **已经有一扇在跑就先关掉再开。** 这是刻意的，不是偷懒：伴侣那侧有单实例锁，
   * 第二次启动只会把旧窗拉到前面——那样「我要看结构窗」这条命令就会**没反应**
   * （旧窗还停在阅读器上）。而应用内那个「打开方式」循环本来也是"拆了重挂"
   * （见 entry-plugin.js 的 `_cycleOpenModeOnce`），所以这个行为是一致的。
   * 窗口位置存在伴侣自己的 userData 里，重启不会丢。
   *
   * @param {string} exe
   * @param {object} cfg
   * @param {"reader"|"story"} [cfg.mode]
   * @param {object} [cfg.seed]
   * @param {string} [cfg.cardsFolder]
   * @param {string} [cfg.appDir]
   *   **开发用**：未打包时把应用目录插在参数前面（`electron.exe <目录> --bridge …`）。
   *   打包之后 exe 自带入口，这一项留空。`dist/floating/` 本身就是合法的应用目录
   *   （有 package.json + main），所以不必先打包就能把整条链跑通。
   */
  async function launch(exe, cfg = {}) {
    if (!exe || !existsSync(exe)) throw new Error("找不到伴侣程序：" + (exe || "(未设置)"));
    const c = await ensureBridge();

    await killChild();

    const payload = {
      origin: `http://127.0.0.1:${c.port}`,
      token: c.token,
      cardsFolder: cfg.cardsFolder || "",
      keySuffix: ":float",
      mode: cfg.mode === "story" ? "story" : "reader",
      version,
      seed: cfg.seed || null,
    };

    const env = { ...process.env };
    // ⚠️ 见文件头第 1 条。这两个留在环境里，Electron 会当纯 Node 起来、什么都不显示。
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;

    const argv = [];
    if (cfg.appDir) argv.push(cfg.appDir);
    argv.push("--bridge", JSON.stringify(payload));

    push(`启动伴侣：${exe}${cfg.appDir ? " " + cfg.appDir : ""}（mode=${payload.mode}）`);
    child = spawn(exe, argv, {
      detached: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: false,
      env,
    });
    exited = false;

    child.stdout.on("data", (b) => push("[out] " + String(b).trimEnd()));
    child.stderr.on("data", (b) => push("[err] " + String(b).trimEnd()));
    child.on("exit", (code, sig) => {
      exited = true;
      push(`伴侣退出了（code=${code}${sig ? ", signal=" + sig : ""}）`);
      child = null;
    });
    child.on("error", (e) => {
      exited = true;
      push("伴侣启动失败：" + ((e && e.message) || e));
    });

    return { pid: child.pid, port: c.port };
  }

  function killChild() {
    return new Promise((resolve) => {
      if (!child || exited) {
        child = null;
        return resolve();
      }
      const c = child;
      const done = () => resolve();
      // 宽限一小会儿再强杀：给伴侣一个把自己那份窗口位置写完的机会
      // （它那是防抖 400ms 写的，直接 taskkill 会丢掉最后一次拖动）。
      const timer = setTimeout(() => {
        try {
          c.kill("SIGKILL");
        } catch {
          /* 已经没了 */
        }
        done();
      }, 1200);
      c.once("exit", () => {
        clearTimeout(timer);
        done();
      });
      try {
        c.kill();
      } catch {
        clearTimeout(timer);
        done();
      }
    });
  }

  return {
    ensureBridge,
    launch,
    isRunning: () => !!child && !exited,
    getLogs: () => logs.slice(),
    /**
     * 收摊：关伴侣、停桥、把发现文件删掉。
     * 顺序要紧——**先杀伴侣再停桥**：反过来的话，伴侣会看到桥没了，
     * 弹一句"连接断了"，而用户明明是正常关掉 Obsidian 的。
     */
    async stop() {
      await killChild();
      clearDiscovery();
      if (server) {
        try {
          await server.stop();
        } catch {
          /* 关不掉也不该挡住卸载 */
        }
        server = null;
        conn = null;
      }
    },
  };
}
