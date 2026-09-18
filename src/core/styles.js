// 样式表。原脚本里是内联的字符串数组，这里原样搬过来。
// 新增样式集中在文件末尾，按归属的票号标注。

const BASE = [
  ".kb-v13-root{",
  "  position:relative;display:flex;align-items:center;justify-content:center;",
  "  font-family:system-ui,sans-serif;user-select:none;",
  "}",

  ".kb-v13-trigger{",
  "  padding:18px 36px;border-radius:12px;cursor:pointer;transition:all .3s;",
  "  display:flex;align-items:center;gap:16px;",
  "  background:#fff;border:0.5px solid rgba(59,130,246,0.15);",
  "  box-shadow:0 1px 3px rgba(0,0,0,.04);",
  "}",
  ".kb-v13-trigger:hover{",
  "  border-color:rgba(59,130,246,0.35);",
  "  box-shadow:0 2px 8px rgba(59,130,246,0.08);",
  "  transform:translateY(-1px);",
  "}",
  ".kb-v13-trigger-icon{",
  "  width:40px;height:40px;display:flex;align-items:center;justify-content:center;",
  "  background:rgba(59,130,246,0.06);border-radius:10px;",
  "}",
  ".kb-v13-trigger-text{display:flex;flex-direction:column;text-align:left;}",
  ".kb-v13-trigger-title{font-size:16px;font-weight:700;color:#1e293b;letter-spacing:0.5px;}",
  ".kb-v13-trigger-sub{font-size:12px;color:#94a3b8;font-weight:400;margin-top:2px;}",

  "/* ===== 全屏层 ===== */",
  ".kb-v13-fullscreen{",
  "  display:none;position:fixed;inset:0;z-index:9990;",
  "  background:radial-gradient(ellipse at 50% 30%,#0f1d2d,#060b14);",
  "  font-family:system-ui,sans-serif;user-select:none;",
  // ⚠️ **这一条是必需的，不是装饰。** 晶体库是一套**自绘深色**的界面，
  // 但卡片正文是交给**宿主的渲染器**画的（`hologram.js` 的 renderInto），
  // 那一路的 HTML 不带颜色、`color` 靠继承。不在这里把字色定死的话，
  // 它继承的是宿主 `<body>`——深色主题下继承到浅字（看着一直是对的），
  // **浅色主题下继承到深字，压在自绘的深底上就是「正文变暗、被深色盖住」**
  // （用户 09-17 报的）。`.kb-v13-holo-concept` 有自己的 color，所以
  // 只有「正文」那一段坏——这个不对称正是问题的指纹。
  //
  // 取的是 `.kb-v13-card-title` 那个色（库里正文那一档的既定基调），
  // 深色主题下的观感与从前基本一致。
  "  color:rgba(220,235,255,.85);",
  "  overflow:hidden;flex-direction:column;",
  "}",
  ".kb-v13-fullscreen.open{display:flex;animation:v13FsIn .5s ease;}",
  // 刚保存引起的重挂不淡入。写盘会让 Dataview 重跑整个块，宿主把旧容器销毁后重建，
  // 晶体库因此"关掉再开"一次；再加上这 0.5s 的淡入，用户看到的就是一次明显的闪退。
  // 这个动作本身在宿主侧、消不掉，但至少别在它上面再加一层视觉噪音。
  ".kb-v13-fullscreen.kb-v13-restored.open{animation:none;}",
  "@keyframes v13FsIn{from{opacity:0}to{opacity:1}}",

  "/* 粒子 */",
  ".kb-v13-particles{position:absolute;inset:0;pointer-events:none;overflow:hidden;}",
  ".kb-v13-dot{position:absolute;width:3px;height:3px;border-radius:50%;background:rgba(0,180,255,0.4);animation:v13Float 6s ease-in-out infinite;box-shadow:0 0 6px rgba(0,180,255,0.3);}",
  ".kb-v13-dot:nth-child(2n){animation-delay:-3s;background:rgba(0,200,255,0.2);width:2px;height:2px;box-shadow:0 0 3px rgba(0,200,255,0.1);}",
  ".kb-v13-dot:nth-child(3n){animation-delay:-1.5s;width:1.5px;height:1.5px;background:rgba(0,220,255,0.25);box-shadow:none;}",
  "@keyframes v13Float{0%,100%{transform:translateY(0)}50%{transform:translateY(-18px)}}",

  "/* 网格 */",
  ".kb-v13-grid{position:absolute;inset:0;pointer-events:none;",
  "  background-image:linear-gradient(rgba(255,255,255,0.08) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.08) 1px,transparent 1px);",
  "  background-size:60px 60px;}",

  "/* 顶部栏 */",
  ".kb-v13-topbar{",
  "  position:relative;z-index:10;display:flex;align-items:center;padding:14px 28px;",
  "  border-bottom:1px solid rgba(255,255,255,0.3);",
  "}",
  ".kb-v13-logo{font-size:15px;font-weight:700;letter-spacing:3px;color:rgba(0,200,255,0.65);margin-right:16px;text-shadow:0 0 12px rgba(0,180,255,0.25);}",
  ".kb-v13-topbar-info{font-size:12px;color:rgba(0,180,255,0.25);letter-spacing:1px;margin-right:auto;}",
  ".kb-v13-topbar-close{",
  "  width:36px;height:36px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;",
  "  border:1px solid rgba(0,180,255,0.1);background:rgba(0,180,255,0.03);color:rgba(0,180,255,0.3);font-size:16px;transition:all .25s;",
  "}",
  ".kb-v13-topbar-close:hover{background:rgba(255,60,60,.1);border-color:rgba(255,60,60,.3);color:rgba(255,60,60,.6);}",

  "/* ===== 主舞台 ===== */",
  ".kb-v13-stage{position:relative;flex:1;overflow:hidden;}",

  "/* ===== 晶体 ===== */",
  ".kb-v13-crystal{",
  "  position:absolute;cursor:pointer;",
  // 3.0 刀 1：这一条**必须显式写出来**，不能靠默认值。
  // 晶体现在住在一个 pointer-events:none 的世界容器里（见文件末尾 CANVAS 块），
  // 而 pointer-events 是**继承**属性——不写 auto 的话整层晶体全部点不动。
  // 更要命的是 crystals.js 复位用的是 `el.style.pointerEvents = ""`（清掉内联值
  // = 回到继承），所以「先设 none 再复位」那条路也会把它复位成 none。
  // 写在这里而不是世界容器上：容器要对空白区域透明（让点击落到 stage），
  // 晶体要对点击不透明——两件事，得分开声明。
  "  pointer-events:auto;",
  "  background:transparent;clip-path:none;box-shadow:none;filter:none;",
  "  transition:all .45s cubic-bezier(.22,.61,.36,1);",
  "  z-index:1;",
  "}",
  ".kb-v13-crystal:hover{z-index:100!important;}",
  ".kb-v13-crystal.fly{transition:all .5s cubic-bezier(.25,.46,.45,.94);z-index:80!important;}",
  ".kb-v13-crystal.at-center{z-index:90!important;}",
  ".kb-v13-crystal.dimmed{pointer-events:none;opacity:.08;transform:scale(0.55);}",

  ".kb-v13-hex-inner{",
  "  position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;",
  "  pointer-events:none;text-align:center;",
  "}",
  ".kb-v13-crystal-icon{font-size:22px;margin-bottom:3px;color:rgba(0,200,255,0.55);}",
  ".kb-v13-crystal-name{font-size:13px;font-weight:700;color:rgba(220,235,255,.9);letter-spacing:1px;}",
  ".kb-v13-crystal-count{font-size:11px;color:rgba(0,180,255,0.35);margin-top:2px;}",

  "/* 波纹 */",
  ".kb-v13-ripple{",
  "  position:absolute;inset:-8px;pointer-events:none;opacity:0;",
  "  border:1px solid rgba(59,130,246,0.18);animation:v13Ripple 3s ease-in-out infinite;animation-delay:.3s;",
  "}",
  ".kb-v13-crystal.at-center .kb-v13-ripple{animation:v13Ripple .8s ease-in-out infinite;border-color:rgba(59,130,246,0.35);}",
  "@keyframes v13Ripple{0%,100%{transform:scale(1);opacity:0.5}50%{transform:scale(1.12);opacity:0}}",

  "/* 轨道环 */",
  ".kb-v13-orbit{",
  "  position:absolute;inset:-16px;pointer-events:none;border-radius:50%;opacity:0;",
  "  border:2px solid transparent;animation:v13Orbit 4s linear infinite;animation-delay:.3s;",
  "  border-top-color:rgba(59,130,246,0.25);border-right-color:rgba(59,130,246,0.10);",
  "  clip-path:polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);",
  "}",
  ".kb-v13-crystal:hover .kb-v13-orbit{animation-duration:1.5s;border-top-color:rgba(59,130,246,0.45);border-right-color:rgba(59,130,246,0.20);}",
  ".kb-v13-crystal.at-center .kb-v13-orbit{animation-duration:1.2s;border-top-color:rgba(59,130,246,0.50);border-right-color:rgba(59,130,246,0.25);}",
  "@keyframes v13Orbit{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}",

  "/* 轨道光点 */",
  ".kb-v13-orb-dot{",
  "  position:absolute;width:5px;height:5px;border-radius:50%;pointer-events:none;",
  "  background:rgba(59,130,246,0.35);animation:v13OrbDot 3s linear infinite;",
  "}",
  "@keyframes v13OrbDot{0%{transform:rotate(0deg) translateX(80px) rotate(0deg)}100%{transform:rotate(360deg) translateX(80px) rotate(-360deg)}}",

  "/* 粒子爆散 */",
  ".kb-v13-burst{position:absolute;inset:0;pointer-events:none;overflow:visible;}",
  ".kb-v13-bp{",
  "  position:absolute;width:5px;height:5px;border-radius:50%;pointer-events:none;",
  "  background:var(--bp-clr,rgba(59,130,246,0.7));",
  "  box-shadow:0 0 6px var(--bp-clr,rgba(59,130,246,0.5));",
  "  animation:v13Burst .8s ease-out both;",
  "}",
  "@keyframes v13Burst{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--bx),var(--by)) scale(0);opacity:0}}",

  "/* ===== 卡片波浪网格 ===== */",

  "/* 波浪漂移 */",
  ".kb-v13-wave{display:flex;justify-content:center;gap:10px;flex-wrap:nowrap;width:100%;}",
  ".kb-v13-wave>*{pointer-events:auto;}",
  ".kb-v13-w1{animation:v13Wave1 8s ease-in-out infinite;}",
  ".kb-v13-w2{animation:v13Wave2 7s ease-in-out infinite;}",
  ".kb-v13-w3{animation:v13Wave3 9s ease-in-out infinite;}",
  ".kb-v13-w4{animation:v13Wave4 6s ease-in-out infinite;}",
  "@keyframes v13Wave1{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}",
  "@keyframes v13Wave2{0%,100%{transform:translateY(6px)}50%{transform:translateY(-6px)}}",
  "@keyframes v13Wave3{0%,100%{transform:translateY(-6px)}50%{transform:translateY(8px)}}",
  "@keyframes v13Wave4{0%,100%{transform:translateY(4px)}50%{transform:translateY(-7px)}}",

  "/* ===== 卡片面板 ===== */",
  ".kb-v13-cards-area{",
  "  display:none;position:absolute;top:0;left:0;right:0;bottom:0;z-index:1;",
  "  pointer-events:none;",
  "}",
  ".kb-v13-cards-area.open{display:block;animation:v13CAIn .6s ease;}",
  "@keyframes v13CAIn{from{opacity:0}to{opacity:1}}",
  ".kb-v13-grid-stage{",
  "  position:absolute;inset:0;overflow:hidden;",
  "}",

  ".kb-v13-card{",
  "  position:absolute;transition:all .35s cubic-bezier(.22,.61,.36,1);",
  "  cursor:pointer;pointer-events:auto;min-width:0;",
  "}",

  ".kb-v13-card-body{",
  "  position:absolute;inset:0;border-radius:8px;overflow:hidden;",
  "  background:rgba(10,20,40,0.75);border:1px solid rgba(0,180,255,0.15);",
  "  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);",
  "  box-shadow:0 4px 20px rgba(0,0,0,.3);",
  "  transition:all .35s;display:flex;flex-direction:column;",
  "}",
  ".kb-v13-card:hover .kb-v13-card-body{",
  "  border-color:rgba(0,200,255,0.45);",
  "  box-shadow:0 4px 28px rgba(0,0,0,.4),0 0 20px rgba(0,200,255,0.10);",
  "}",

  ".kb-v13-card-header{",
  "  padding:12px 14px;border-bottom:1px solid rgba(0,200,255,0.06);",
  "  display:flex;align-items:center;gap:10px;",
  "}",
  ".kb-v13-card-strip{width:8px;height:36px;border-radius:4px;flex-shrink:0;}",
  ".kb-v13-card-title{font-size:14px;font-weight:700;color:rgba(220,235,255,.85);}",
  ".kb-v13-card-concept{",
  "  padding:10px 14px;font-size:12px;line-height:1.6;color:rgba(200,225,250,.7);flex:1;",
  "}",

  "/* 玻璃反光 → 边框流光 */",
  ".kb-v13-card-body::after{",
  "  content:'';position:absolute;inset:0;border-radius:8px;pointer-events:none;",
  "  padding:1.5px;",
  "  background:linear-gradient(120deg,transparent 30%,rgba(59,130,246,0.3) 50%,transparent 70%);",
  "  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);",
  "  -webkit-mask-composite:xor;mask-composite:exclude;",
  "  opacity:0;transition:opacity .35s;",
  "}",
  ".kb-v13-card:hover .kb-v13-card-body::after{opacity:1;}",
  "/* 边框脉冲 */",
  ".kb-v13-card:hover .kb-v13-card-body{",
  "  animation:v13CardPulse 1.5s ease-in-out infinite;",
  "}",
  "@keyframes v13CardPulse{",
  "  0%,100%{box-shadow:0 4px 24px rgba(0,0,0,.06),0 0 16px rgba(59,130,246,0.08)}",
  "  50%{box-shadow:0 4px 28px rgba(0,0,0,.06),0 0 24px rgba(59,130,246,0.15)}",
  "}",

  "/* 卡片入场 */",
  ".kb-v13-card-in{animation:v13CardPop .5s cubic-bezier(.22,.61,.36,1) both;}",
  "@keyframes v13CardPop{from{opacity:0;transform:translateY(40px) scale(0.8)}to{}}",

  "/* ===== 翻页 ===== */",
  ".kb-v13-pages{",
  "  position:absolute;bottom:28px;left:50%;transform:translateX(-50%);pointer-events:auto;",
  "  display:none;align-items:center;gap:16px;",
  "}",
  ".kb-v13-nav-arrow{",
  "  width:40px;height:40px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;",
  "  border:1px solid rgba(0,200,255,0.15);background:rgba(10,20,40,0.7);color:rgba(0,200,255,0.4);",
  "  font-size:18px;transition:all .25s;",
  "}",
  ".kb-v13-nav-arrow:hover{background:rgba(0,200,255,0.06);border-color:rgba(0,200,255,0.4);color:rgba(0,200,255,0.7);}",
  ".kb-v13-page-info{font-size:12px;color:rgba(0,200,255,0.25);min-width:100px;text-align:center;}",

  "/* ===== hover 浮层 ===== */",
  ".kb-v13-tooltip{",
  "  display:none;position:fixed;z-index:99999;pointer-events:none;",
  // 同 `.kb-v13-fullscreen`：挂在 body 上的第三个自绘深底，字色得自己定。
  "  color:rgba(220,235,255,.85);",
  "  background:rgba(8,16,30,0.95);border:1px solid rgba(0,200,255,0.25);border-radius:8px;",
  "  padding:14px 16px;box-shadow:0 4px 24px rgba(0,0,0,.4);",
  "  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);",
  "  max-width:320px;",
  "}",
  ".kb-v13-tooltip.show{display:block;animation:v13TtIn .2s ease;}",
  "@keyframes v13TtIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}",
  ".kb-v13-tooltip::after{",
  "  content:'';position:absolute;top:0;left:0;right:0;height:1px;",
  "  background:linear-gradient(90deg,transparent,var(--tt-clr,rgba(0,200,255,0.25)),transparent);",
  "  animation:v13TtScn 2s linear infinite;",
  "}",
  "@keyframes v13TtScn{from{top:0}to{top:100%}}",
  ".kb-v13-tooltip-title{font-size:13px;font-weight:700;color:rgba(0,200,255,0.8);margin-bottom:6px;}",
  ".kb-v13-tooltip-concept{font-size:12px;line-height:1.6;color:rgba(200,225,250,.7);}",
  ".kb-v13-tooltip-source{font-size:10px;color:rgba(0,200,255,0.3);margin-top:6px;}",
  ".kb-v13-tooltip-reason{font-size:12px;line-height:1.6;color:rgba(200,225,250,.7);margin-top:4px;}",

  "/* 三角箭头 */",
  ".kb-v13-tt-arrow{",
  "  position:absolute;top:-6px;left:50%;transform:translateX(-50%);",
  "  width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;",
  "  border-bottom:7px solid rgba(8,16,30,0.95);",
  "}",

  "/* ===== 全息详情面板 (保留暗色 = 对比弹出效果) ===== */",
  ".kb-v13-overlay{",
  "  display:none;position:fixed;inset:0;z-index:9999;",
  "  background:rgba(4,8,20,.88);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);",
  "  align-items:center;justify-content:center;",
  // 同 `.kb-v13-fullscreen` 那一条：全息面板住在这一层里，而**它是挂在 body 上的
  // 另一个根**（`app.js` 里 `doc.body.appendChild(overlay)`），
  // 光在前一层定字色管不到它。宿主是浅色主题时，不改这一条的话
  // 面板正文照样是深字压深底。
  "  color:rgba(220,235,255,.85);",
  "}",
  ".kb-v13-overlay.open{display:flex;animation:v13OvIn .3s ease;}",
  "@keyframes v13OvIn{from{opacity:0}to{opacity:1}}",

  // z-index:10 是层叠不变量「背景 < 连线 < 卫星 < 面板 < 浮窗」里面板那一档。
  // 从前这里没有 z-index，而卫星挂在遮罩**外面**、天生在遮罩之上，于是卫星永远压着
  // 面板：既盖住正文，也盖住右上角那枚 ✎。光给面板加 z-index 治不好——子元素跳不出
  // 遮罩自己的层叠上下文，得先把卫星搬进来（见 app.js mounting 处的注释）。
  ".kb-v13-hologram{",
  "  position:relative;z-index:10;width:500px;max-width:90vw;max-height:82vh;overflow-y:scroll;overflow-x:hidden;scrollbar-width:none;",
  "  padding:36px 32px;border-radius:14px;",
  "  background:rgba(6,14,30,0.97);border:1px solid rgba(0,200,255,0.15);",
  "  box-shadow:0 0 60px rgba(0,200,255,0.06);",
  "}",
  ".kb-v13-hologram::-webkit-scrollbar{display:none;}",
  "@keyframes v13HoloFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}",

  ".kb-v13-hologram::before{",
  "  content:'';position:absolute;inset:-1px;border-radius:15px;padding:1px;",
  "  background:conic-gradient(from 0deg,var(--holo-clr),transparent 40%,transparent 60%,var(--holo-clr));",
  "  -webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);",
  "  -webkit-mask-composite:xor;mask-composite:exclude;",
  "  animation:v13Rotate 5s linear infinite;pointer-events:none;",
  "}",
  "@keyframes v13Rotate{from{transform:rotate(0)}to{transform:rotate(360deg)}}",

  ".kb-v13-hologram::after{",
  "  content:'';position:absolute;top:0;left:0;right:0;height:1px;",
  "  background:linear-gradient(90deg,transparent,rgba(0,200,255,0.15),transparent);",
  "  animation:v13Scan 2.5s linear infinite;pointer-events:none;",
  "}",
  "@keyframes v13Scan{from{top:0}to{top:100%}}",

  ".kb-v13-holo-title{position:relative;z-index:1;font-size:20px;font-weight:700;letter-spacing:1px;margin-bottom:10px;}",
  ".kb-v13-holo-concept{position:relative;z-index:1;font-size:14px;line-height:1.8;margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid rgba(255,255,255,.05);color:rgba(180,200,230,.7);}",
  // 概念走渲染器后可能产出块级元素，压掉首尾多余间距
  ".kb-v13-holo-concept>*:first-child{margin-top:0;}",
  ".kb-v13-holo-concept>*:last-child{margin-bottom:0;}",
  ".kb-v13-holo-meta{position:relative;z-index:1;display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;}",
  ".kb-v13-holo-body{position:relative;z-index:1;margin-top:6px;padding:14px 16px;border-radius:10px;border:1px solid rgba(0,200,255,0.10);background:rgba(0,8,20,0.35);max-height:42vh;overflow-y:auto;overflow-x:hidden;}",
  ".kb-v13-holo-body::-webkit-scrollbar{width:5px;}",
  ".kb-v13-holo-body::-webkit-scrollbar-thumb{background:rgba(0,200,255,.25);border-radius:3px;}",
  ".kb-v13-holo-body img{display:block;max-width:100%;height:auto;margin:10px auto;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,.35);}",
  ".kb-v13-holo-tag{padding:4px 12px;border-radius:12px;font-size:11px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);color:rgba(255,255,255,.35);}",
  ".kb-v13-holo-related{position:relative;z-index:1;font-size:12px;line-height:1.8;color:rgba(0,200,255,.3);}",
  ".kb-v13-holo-close{position:absolute;top:14px;right:18px;z-index:2;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);color:rgba(255,255,255,.2);font-size:16px;transition:all .25s;}",
  ".kb-v13-holo-close:hover{background:rgba(255,60,60,.1);border-color:rgba(255,60,60,.25);color:rgba(255,60,60,.6);}",

  // 右上角三枚：由右往左是 关 ✕ / 改 ✎ / 开 ↗，每枚相隔 38px（32 的直径 + 6 的缝）
  ".kb-v13-holo-edit{position:absolute;top:14px;right:56px;z-index:2;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);color:rgba(255,255,255,.2);font-size:14px;transition:all .25s;}",
  ".kb-v13-holo-edit:hover{background:rgba(0,200,255,.08);border-color:rgba(0,200,255,.25);color:rgba(0,200,255,.5);}",
  ".kb-v13-holo-open{position:absolute;top:14px;right:94px;z-index:2;width:32px;height:32px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);color:rgba(255,255,255,.2);font-size:13px;transition:all .25s;}",
  ".kb-v13-holo-open:hover{background:rgba(0,200,255,.08);border-color:rgba(0,200,255,.25);color:rgba(0,200,255,.5);}",

  "/* #16 卡片内编辑：面板原地切成表单 */",
  // 编辑态把只读的那几块藏起来（标题留着——手机上它还是拖动手柄）
  ".kb-v13-editing .kb-v13-holo-concept,.kb-v13-editing .kb-v13-holo-meta,.kb-v13-editing .kb-v13-holo-body{display:none;}",
  // 编辑态加宽：正文是等宽代码，500px 里一行放不下几个字。
  // ⚠️ 别给 width 加 transition：卫星是按面板 getBoundingClientRect 算椭圆的，
  // 动画中间值会让它们按一个不存在的几何摆一圈。进/出编辑态时 editform 会各重排一次。
  // max-width:94vw 这个组合本身就是手机的夹取惯用法（390px 屏上算出来 366px），
  // 不需要另写媒体查询——但**别在媒体查询里把它写回固定 px**。
  ".kb-v13-hologram.kb-v13-editing{width:880px;max-width:94vw;}",
  // 面板是 cursor:grab（#10 可拖），cursor 会继承进输入框——在正文里划选时看着像要拖动
  ".kb-v13-edit-input{cursor:auto;}",
  // 正文：等宽、能拉高。高度按「面板 82vh 减去操作栏与三个 FM 字段」估的，
  // 面板自己是 overflow-y:scroll，短屏下不会撑破，操作栏吸顶不动。
  ".kb-v13-edit-body{min-height:22vh;height:34vh;max-height:52vh;resize:vertical;font-family:ui-monospace,Menlo,Consolas,monospace;line-height:1.55;white-space:pre-wrap;tab-size:2;}",
  // 撤销条（editform.js 末尾那一节）。夹在标签区与正文之间，所以看得见。
  ".kb-v13-undo{position:relative;z-index:2;display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:10px;padding:8px 12px;border-radius:8px;border:1px solid rgba(120,220,160,.22);background:rgba(0,40,20,.35);}",
  ".kb-v13-undo-text{font-size:12px;line-height:1.5;color:rgba(160,240,200,.85);}",
  ".kb-v13-undo-btn{padding:4px 14px;font-size:13px;}",
  ".kb-v13-undo-failed{border-color:rgba(255,140,120,.3);background:rgba(50,10,0,.35);color:rgba(255,180,160,.85);font-size:12px;line-height:1.5;}",
  ".kb-v13-editform{position:relative;z-index:1;display:flex;flex-direction:column;gap:12px;padding:4px 22px 20px;}",
  ".kb-v13-edit-row{display:flex;flex-direction:column;gap:6px;}",
  ".kb-v13-edit-cap{font-size:12px;letter-spacing:.05em;color:rgba(0,200,255,.5);}",
  // font-size 必须 ≥16px：小于 16 时 iOS Safari 一聚焦就自动放大整页，
  // 放大之后表单横向溢出面板，很难退回去。16 是那条线的位置，不是审美选择。
  // 用 % 或 em 都不行——它们会跟着面板走，面板一改宽就掉到 16 以下。
  // ⚠️ 底色与字色带 !important，这是**必须**的，不是图省事：
  // 宿主（Obsidian 及各家主题）会统一给 input / textarea 套一层表单控件的底色，
  // 而主题的样式表常常注入在我们的 <style> 之后——同优先级时后到的赢，于是在深色
  // 主题里这几个框会变成一大块刺眼的白底。本面板是自绘 UI，不该继承宿主的表单皮肤。
  // 顺带用不透明的底色：半透明是拿面板底色当假设，宿主一变就又不可控了。
  // color-scheme 让光标、选区、滚动条、iOS 输入法候选框都按深色走。
  ".kb-v13-edit-input{width:100%;box-sizing:border-box;font-size:16px;line-height:1.5;font-family:inherit;padding:8px 10px;border-radius:6px;border:1px solid rgba(0,200,255,.18);background-color:#0a1526 !important;color:#e6f5ff !important;caret-color:#7fd8ff;color-scheme:dark;resize:vertical;}",
  ".kb-v13-edit-input:focus{outline:none;border-color:rgba(0,200,255,.5);background-color:#0d1c30 !important;}",
  // 划选的颜色也跟着定死：宿主主题的 ::selection 在深底上常常是浅底白字，一样看不见
  ".kb-v13-edit-input::selection{background:rgba(0,140,200,.45);color:#f2fbff;}",
  ".kb-v13-edit-hint{font-size:11px;line-height:1.5;color:rgba(255,255,255,.28);}",
  // 操作栏吸顶。iOS 键盘弹起来会盖住下半屏，操作栏跟着滚走就等于没有——
  // 而移动端没有 Esc 也没有 Ctrl+Enter，这两枚按钮是唯一出口。
  ".kb-v13-edit-bar{position:sticky;top:0;z-index:3;display:flex;gap:10px;padding:10px 0;background:linear-gradient(to bottom,rgba(8,14,28,.98),rgba(8,14,28,.92));border-bottom:1px solid rgba(0,200,255,.12);}",
  ".kb-v13-edit-btn{font-size:14px;font-family:inherit;padding:8px 18px;border-radius:6px;cursor:pointer;border:1px solid rgba(0,200,255,.25);background:rgba(0,200,255,.06);color:rgba(0,200,255,.8);transition:all .2s;}",
  ".kb-v13-edit-btn:hover{background:rgba(0,200,255,.14);}",
  ".kb-v13-edit-btn:disabled{opacity:.4;cursor:default;}",
  ".kb-v13-edit-save{background:rgba(0,200,255,.16);color:rgba(180,240,255,.95);}",
  ".kb-v13-edit-drop{border-color:rgba(255,90,90,.3);background:rgba(255,60,60,.08);color:rgba(255,140,140,.85);}",
  ".kb-v13-edit-drop:hover{background:rgba(255,60,60,.16);}",
  ".kb-v13-edit-status{font-size:12px;line-height:1.6;color:rgba(255,255,255,.4);}",
  ".kb-v13-edit-status[hidden]{display:none;}",
  ".kb-v13-edit-status:empty{display:none;}",
  ".kb-v13-edit-warn{color:rgba(255,200,120,.85);display:flex;align-items:center;gap:10px;flex-wrap:wrap;}",
  ".kb-v13-edit-conflict{color:rgba(255,150,150,.9);display:flex;align-items:center;gap:10px;flex-wrap:wrap;}",
  ".kb-v13-edit-warn-text{flex:1 1 100%;}",
  // 别人那份的开头几行。等宽字体 + 可滚，长 frontmatter 不会把面板撑破
  ".kb-v13-edit-diff{flex:1 1 100%;margin:0;padding:8px 10px;max-height:140px;overflow:auto;font-size:11px;line-height:1.5;font-family:ui-monospace,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-all;border-radius:6px;border:1px solid rgba(255,120,120,.2);background:rgba(40,0,0,.25);color:rgba(255,200,200,.7);}",

  "/* 光束 */",
  ".kb-v13-beam{position:absolute;bottom:-60px;left:10%;right:10%;height:60px;background:linear-gradient(to bottom,rgba(0,200,255,.04),transparent);clip-path:polygon(25% 0,75% 0,100% 100%,0 100%);pointer-events:none;}",

  "/* 卫星卡片 */",
  // 卫星容器的层级（连线 1 < 卫星 2 < 面板 10）。容器自身铺满视口但不吃事件，
  // 事件留给里面的卫星自己——它们仍是 position:fixed，坐标照旧。
  "#kb-satellites{position:fixed;inset:0;z-index:2;pointer-events:none;}",
  ".kb-v13-satellite{position:fixed;z-index:2;cursor:pointer;transition:all .35s;pointer-events:auto;}",
  ".kb-v13-satellite:hover{z-index:3;transform:translateY(-6px);}",
  ".kb-v13-sat-body{",
  "  border-radius:6px;overflow:hidden;",
  "  background:rgba(6,14,30,0.92);border:1px solid rgba(0,200,255,0.15);",
  "  box-shadow:0 2px 16px rgba(0,0,0,.3);",
  "  transition:all .3s;",
  "}",
  ".kb-v13-satellite:hover .kb-v13-sat-body{border-color:rgba(0,200,255,0.4);box-shadow:0 2px 20px rgba(0,0,0,.4),0 0 14px rgba(0,200,255,0.10);}",
  ".kb-v13-sat-strip{position:absolute;left:0;top:0;bottom:0;width:6px;border-radius:6px 0 0 6px;}",
  ".kb-v13-sat-title{font-size:12px;font-weight:700;color:rgba(220,235,255,.75);}",

  "/* 卫星连线 */",
  ".kb-v13-sat-lines{position:fixed;inset:0;width:100%;height:100%;z-index:1;pointer-events:none;}",
  ".kb-v13-sat-line{",
  "  stroke-dasharray:6,4;animation:v13SatFlow 2s linear infinite;",
  "}",
  "@keyframes v13SatFlow{to{stroke-dashoffset:-20}}",

  "/* 孤立卡标记 */",
  // #20：孤岛的**显示**被撤了，只剩数据。`.kb-v13-card-orphan` 与 `data-orphan`
  // 仍然打在卡片上（contract.spec.js 钉着），但不再有任何一条规则让它们显形——
  // 孤岛现在只出现在顶栏那份汇总里（见本文件末尾 MULTILEVEL 附近的 op-* 一族，
  // 以及 orphans.js）。原来的三条在这里：卡面红虚线、卡面「孤」圆标、晶体「孤」圆标。
  "/* 反向链接卫星（琥珀色） */",
  ".kb-v13-sat-back .kb-v13-sat-title{color:rgba(245,200,120,.9);}",
  ".kb-v13-sat-back:hover{z-index:3;transform:translateY(-4px);}",
];

// ===== #5 正文原生渲染：交给宿主渲染器，这里只给容器兜底排版 =====
const RENDER_HOST = [
  // 宿主渲染器（Obsidian MarkdownRenderer / 网页端 marked）产出的原生标签，
  // 在全息面板暗色底上给一套基础配色，保证和笔记里观感一致。
  ".kb-v13-holo-body > *:first-child{margin-top:0;}",
  ".kb-v13-holo-body > *:last-child{margin-bottom:0;}",
  ".kb-v13-holo-body h1,.kb-v13-holo-body h2,.kb-v13-holo-body h3,.kb-v13-holo-body h4{",
  "  color:#cfe6ff;line-height:1.4;margin:14px 0 8px;font-weight:700;}",
  ".kb-v13-holo-body h1{font-size:17px;}",
  ".kb-v13-holo-body h2{font-size:15px;}",
  ".kb-v13-holo-body h3,.kb-v13-holo-body h4{font-size:13.5px;}",
  ".kb-v13-holo-body p{margin:0 0 10px;line-height:1.7;font-size:13px;color:rgba(190,210,235,.85);}",
  ".kb-v13-holo-body ul,.kb-v13-holo-body ol{margin:0 0 10px;padding-left:22px;font-size:13px;line-height:1.7;color:rgba(190,210,235,.85);}",
  ".kb-v13-holo-body li{margin:2px 0;}",
  ".kb-v13-holo-body blockquote{",
  "  margin:0 0 10px;padding:6px 12px;border-left:3px solid rgba(0,200,255,.28);",
  "  background:rgba(0,200,255,.04);border-radius:0 6px 6px 0;color:rgba(180,205,235,.8);}",
  ".kb-v13-holo-body blockquote p:last-child{margin-bottom:0;}",
  ".kb-v13-holo-body strong{color:#e6f2ff;font-weight:700;}",
  ".kb-v13-holo-body em{color:#cfe6ff;}",
  ".kb-v13-holo-body hr{border:none;border-top:1px solid rgba(255,255,255,.08);margin:12px 0;}",
  ".kb-v13-holo-body a{color:#7fd7ff;text-decoration:none;border-bottom:1px solid rgba(127,215,255,.3);}",
  ".kb-v13-holo-body a:hover{border-bottom-color:rgba(127,215,255,.7);}",
  ".kb-v13-holo-body code{font-family:Consolas,'Courier New',monospace;font-size:12px;background:rgba(0,200,255,.08);padding:1px 5px;border-radius:4px;color:#7fd7ff;}",
  ".kb-v13-holo-body pre{margin:0 0 12px;padding:12px 14px;border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.06);overflow-x:auto;line-height:1.6;}",
  ".kb-v13-holo-body pre code{background:none;padding:0;color:#dcebff;font-size:12px;}",
  ".kb-v13-holo-body table{border-collapse:collapse;margin:4px 0 12px;width:100%;font-size:12.5px;}",
  ".kb-v13-holo-body th,.kb-v13-holo-body td{border:1px solid rgba(255,255,255,.10);padding:6px 10px;text-align:left;line-height:1.6;color:rgba(200,220,245,.9);}",
  ".kb-v13-holo-body th{background:rgba(0,200,255,.08);color:#9fdcff;font-weight:700;}",
  ".kb-v13-holo-body tr:nth-child(odd) td{background:rgba(255,255,255,.015);}",
  // 公式（MathJax / KaTeX 均按各自结构渲染，这里只保证不撑破面板）。
  // 两个作用域写在同一份声明里：公式只有一个第二落点——公式围栏被搬进浮窗（mathfloat.js），
  // 那时它脱离 .kb-v13-holo-body、落进 .kb-v13-cfloat-body。复制一份声明迟早漂，所以并排写。
  //
  // overflow-x:auto 那一条尤其别漏：少了它，宽公式会把**窗**撑宽而不是在自己内部横向滚，
  // 与正文里的表现不一致。
  ".kb-v13-holo-body mjx-container,.kb-v13-cfloat-body mjx-container,",
  ".kb-v13-holo-body .katex,.kb-v13-cfloat-body .katex{color:#e2eeff;font-size:1.05em;}",
  ".kb-v13-holo-body mjx-container[display='true'],.kb-v13-cfloat-body mjx-container[display='true'],",
  ".kb-v13-holo-body .katex-display,.kb-v13-cfloat-body .katex-display{",
  "  display:block;margin:10px 0;overflow-x:auto;overflow-y:hidden;text-align:center;}",
];

// ===== #6 「概念」默认遮住 =====
const CONCEPT_MASK = [
  ".kb-v13-card-tags{",
  "  display:flex;flex-wrap:wrap;gap:4px;padding:0 14px 8px;",
  "}",
  ".kb-v13-card-tag{",
  "  font-size:10px;line-height:1.5;padding:1px 7px;border-radius:9px;",
  "  border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.02);",
  "  color:rgba(255,255,255,.35);white-space:nowrap;",
  "}",

  // 概念区默认被盖住：只留一层朦胧的斜纹，看不出内容
  ".kb-v13-card-concept{position:relative;}",
  ".kb-v13-card-concept .kb-v13-concept-body{",
  "  transition:filter .25s ease,opacity .25s ease;",
  "  filter:blur(5px);opacity:.25;",
  "}",
  ".kb-v13-card-concept.revealed .kb-v13-concept-body{filter:none;opacity:1;}",
  ".kb-v13-concept-cover{",
  "  position:absolute;inset:6px 10px;border-radius:6px;pointer-events:none;",
  "  display:flex;align-items:center;justify-content:center;gap:6px;",
  "  background:repeating-linear-gradient(135deg,rgba(0,200,255,.05) 0 6px,rgba(0,0,0,0) 6px 12px);",
  "  border:1px dashed rgba(0,200,255,.18);",
  "  color:rgba(0,200,255,.45);font-size:11px;letter-spacing:1px;",
  "  transition:opacity .25s ease;",
  "}",
  ".kb-v13-card-concept.revealed .kb-v13-concept-cover{opacity:0;}",
  // 没有「概念」的卡：不留空白破绽
  ".kb-v13-card-concept.is-empty .kb-v13-concept-cover{",
  "  background:none;border-style:solid;border-color:rgba(255,255,255,.04);",
  "  color:rgba(255,255,255,.16);letter-spacing:0;",
  "}",

  // 展开的大卡上概念区可滚动，免得长概念撑破卡面
  ".kb-v13-card-concept.big .kb-v13-concept-body{max-height:100%;overflow:hidden;}",
];

// ===== #7 点晶体，高亮相连的晶体 =====
const CRYSTAL_LINKS = [
  ".kb-v13-crystal.selected{",
  "  z-index:120!important;",
  "  filter:drop-shadow(0 0 16px hsla(var(--sel-hue,200),80%,60%,0.55));",
  "}",
  ".kb-v13-crystal.selected .kb-v13-crystal-name{color:#fff;}",
  // 与选中晶体相连：亮起来
  ".kb-v13-crystal.linked{",
  "  z-index:110!important;",
  "  filter:drop-shadow(0 0 12px hsla(var(--sel-hue,200),80%,60%,0.35));",
  "}",
  ".kb-v13-crystal.linked .kb-v13-crystal-name{color:rgba(240,250,255,.95);}",
  ".kb-v13-crystal.unlinked{opacity:.28;filter:grayscale(.6);}",

  // 选中时晶体之间的连线（按需出现，不常驻）
  ".kb-v13-crystal-links{",
  "  position:absolute;inset:0;z-index:115;pointer-events:none;overflow:visible;",
  "}",
  ".kb-v13-cl-line{animation:v13ClFlow 2s linear infinite;}",
  "@keyframes v13ClFlow{to{stroke-dashoffset:-24}}",
  ".kb-v13-cl-label{",
  "  position:absolute;z-index:116;pointer-events:none;",
  "  transform:translate(-50%,-50%);white-space:nowrap;max-width:200px;",
  "  padding:3px 9px;border-radius:10px;",
  "  background:rgba(6,14,30,.94);border:1px solid rgba(0,200,255,.3);",
  "  color:rgba(190,225,255,.9);font-size:10.5px;line-height:1.4;",
  "  box-shadow:0 2px 12px rgba(0,0,0,.4);",
  "}",
  ".kb-v13-cl-label b{color:#7fd7ff;font-weight:700;}",
  // 选中提示
  ".kb-v13-select-hint{",
  "  position:absolute;left:50%;bottom:88px;transform:translateX(-50%);z-index:118;",
  "  display:none;padding:6px 16px;border-radius:14px;pointer-events:none;",
  "  background:rgba(6,14,30,.85);border:1px solid rgba(0,200,255,.18);",
  "  color:rgba(0,200,255,.55);font-size:11.5px;letter-spacing:.5px;",
  "}",
  ".kb-v13-select-hint.show{display:block;}",
];

// ===== #11 代码块悬浮窗 =====
// 设计定位：它是乐器，不是弹窗。
//   - 不压暗背景、不加遮罩：卡片在后头仍然可见可交互，它是拿在手上看的工具。
//   - 安静对吵闹：库里到处是无限动画，这里反着来——精确、静止、发丝边框。
//     所以下面**没有一处循环动画**，只有开合这一下响应动作。
//   - 一切让位于「一行命令不折行」：所有尺寸决策都为这个让路。
//   - 不引入新色相，全部用现有青色系；琥珀色是反链专用的，不借。
//
// #15 起这一节是**代码窗与图片窗共用**的壳：凡带 .kb-v13-ifloat 的选择器，
// 就是"两扇窗长得一样"的那部分（窗壳、标题栏、关闭、占位条、抓角）。
// 只有 .kb-v13-cfloat 一个前缀的，是代码块特有的（语言名、行数、不折行的 <pre> 皮肤）；
// 图片特有的在下面 IMAGEFLOAT 一节。
const CODEFLOAT = [
  ".kb-v13-cfloat,.kb-v13-ifloat{",
  "  position:fixed;z-index:10050;display:flex;flex-direction:column;",
  "  box-sizing:border-box;border-radius:12px;overflow:hidden;",
  "  background:rgba(6,14,30,.97);border:1px solid rgba(0,200,255,0.18);",
  "  box-shadow:0 12px 40px rgba(0,0,0,.5);",
  "  backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);",
  "  font-family:system-ui,sans-serif;",
  "  animation:v13CfIn .16s cubic-bezier(.22,.61,.36,1);",
  "}",
  "@keyframes v13CfIn{from{opacity:0;transform:scale(.99)}}",

  // 标题栏是拖动区：cursor 与 touch-action 缺一不可，
  // 少了 touch-action 手机上会先滚页面再收到 move，拖不动。
  ".kb-v13-cfloat-bar,.kb-v13-ifloat-bar{",
  "  flex:0 0 auto;display:flex;align-items:center;gap:10px;height:32px;padding:0 6px 0 12px;",
  "  border-bottom:1px solid rgba(0,200,255,0.14);",
  "  cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;",
  "}",
  ".kb-v13-cfloat-bar:active,.kb-v13-ifloat-bar:active{cursor:grabbing;}",
  ".kb-v13-cfloat-lang{",
  "  font-family:Consolas,'Courier New',monospace;font-size:11px;letter-spacing:.6px;",
  "  color:rgba(0,200,255,0.55);",
  "}",
  // 行数靠右端：跟左边的语言名一头一尾，不是中间点串起来的模板写法
  ".kb-v13-cfloat-lines{",
  "  margin-left:auto;font-family:Consolas,'Courier New',monospace;font-size:11px;",
  "  color:rgba(0,200,255,0.35);",
  "}",
  ".kb-v13-cfloat-close,.kb-v13-ifloat-close{",
  "  flex:0 0 auto;width:22px;height:22px;border-radius:50%;cursor:pointer;",
  "  display:flex;align-items:center;justify-content:center;",
  "  border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.02);",
  "  color:rgba(255,255,255,.25);font-size:11px;line-height:1;transition:all .2s;",
  "}",
  ".kb-v13-cfloat-close:hover,.kb-v13-ifloat-close:hover{background:rgba(255,60,60,.1);border-color:rgba(255,60,60,.25);color:rgba(255,60,60,.6);}",

  ".kb-v13-cfloat-body{flex:1;min-height:0;overflow:auto;padding:10px 12px;}",
  ".kb-v13-cfloat-body::-webkit-scrollbar{width:5px;height:5px;}",
  ".kb-v13-cfloat-body::-webkit-scrollbar-thumb{background:rgba(0,200,255,.25);border-radius:3px;}",
  // 搬过来的 <pre> 脱离了 .kb-v13-holo-body 的样式作用域，皮肤要在这儿重来一份
  // （真宿主里还多丢一层 .markdown-rendered，同理）。少这一份，代码块一浮起来就"掉漆"。
  // width:max-content 是「不折行」的兜底：窗被拉窄也只出横向滚动，不回行。
  ".kb-v13-cfloat-body pre{",
  "  width:max-content;min-width:100%;box-sizing:border-box;margin:0;padding:12px 14px;",
  "  border-radius:8px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.06);",
  "  overflow-x:auto;line-height:1.6;",
  "}",
  ".kb-v13-cfloat-body pre code{",
  "  font-family:Consolas,'Courier New',monospace;font-size:12px;background:none;padding:0;color:#dcebff;",
  "}",

  // 原位占位条：斜纹沿用 #6 概念遮罩那一套语言——「这里的东西被移走了」
  ".kb-v13-cfloat-slot,.kb-v13-ifloat-slot{",
  "  display:flex;align-items:center;gap:12px;margin:0 0 12px;padding:8px 10px 8px 12px;",
  "  border-radius:8px;border:1px dashed rgba(0,200,255,0.22);",
  "  background:repeating-linear-gradient(135deg,rgba(0,200,255,.04) 0 6px,rgba(0,0,0,0) 6px 12px);",
  "  color:rgba(0,200,255,0.5);font-size:11.5px;letter-spacing:.3px;",
  "}",
  ".kb-v13-cfloat-slot-text,.kb-v13-ifloat-slot-text{margin-right:auto;}",
  ".kb-v13-cfloat-slot-btn,.kb-v13-ifloat-slot-btn{",
  "  flex:0 0 auto;padding:4px 12px;border-radius:12px;cursor:pointer;font-family:inherit;",
  "  border:1px solid rgba(0,200,255,0.25);background:rgba(0,200,255,0.05);",
  "  color:rgba(0,200,255,0.7);font-size:11px;transition:all .2s;",
  "}",
  ".kb-v13-cfloat-slot-btn:hover,.kb-v13-ifloat-slot-btn:hover{background:rgba(0,200,255,0.12);border-color:rgba(0,200,255,0.5);color:#8fdcff;}",

  // 悬浮窗是挂在遮罩里的（原因写在 codefloat.js：遮罩会跟着实例一起被清掉，
  // 挂 body 的话代码块重跑后会留下关不掉的孤儿窗）。它靠 z-index:10050 压住面板，
  // 与卫星同处遮罩这一个层叠上下文，所以不再需要抬整个遮罩（那是卫星还在遮罩外面
  // 时的补丁，副作用是开着窗时卫星点不动——点击会落到遮罩上变成关面板）。

  // 开着一扇窗时，卫星与连线收起来。浮窗是「拿在手上看」的焦点态，旁边那圈虚线与
  // 卡片此时只是干扰，而卫星的定位本来就是围绕面板算的，面板被窗压住时它们也没有
  // 参照物。类名由 floatwin.js 开关（开第一扇加、收最后一扇摘）。
  //
  // 用 display:none 而不是 z-index 压住：satLines 的可见性是行内 style.display 在管
  // （有连线时清成 ""、没有时写成 "none"），行内值优先于任何选择器——被清成 "" 时
  // 这条规则才生效，正好是我们要的时机；真没有连线时它自己本来就是 none，不冲突。
  ".kb-v13-overlay.kb-v13-floats-open #kb-satellites,",
  ".kb-v13-overlay.kb-v13-floats-open #kb-sat-lines{display:none;}",

  // 右下角抓角：一条发丝直角，不用斜纹点阵——那是通用弹窗的写法
  ".kb-v13-cfloat-grip,.kb-v13-ifloat-grip{",
  "  position:absolute;right:0;bottom:0;width:18px;height:18px;",
  "  cursor:nwse-resize;touch-action:none;",
  "}",
  ".kb-v13-cfloat-grip::before,.kb-v13-ifloat-grip::before{",
  "  content:'';position:absolute;right:3px;bottom:3px;width:7px;height:7px;",
  "  border-right:1px solid rgba(0,200,255,0.3);border-bottom:1px solid rgba(0,200,255,0.3);",
  "}",
  ".kb-v13-cfloat-grip:hover::before,.kb-v13-ifloat-grip:hover::before{border-color:rgba(0,200,255,0.65);}",

  // 正文里那个还没搬走的 <pre>：可以「拿起来」的一点点提示，外加键盘焦点环
  ".kb-v13-holo-body pre.kb-v13-cfloat-src{cursor:pointer;transition:border-color .2s;}",
  ".kb-v13-holo-body pre.kb-v13-cfloat-src:hover{border-color:rgba(0,200,255,0.35);}",
  // 公式围栏的容器同样「可以拿起来」（mathfloat.js 挂的入口）。它没有 <pre> 那层边框，
  // 所以不做 border-color 那一套——给光标，另加一层很淡的底色当提示。
  // 不设内边距：底色正好箍住公式，多一圈反而像多长了个框。
  ".kb-v13-holo-body .kb-v13-mathfence.kb-v13-cfloat-src{cursor:pointer;border-radius:8px;transition:background .2s;}",
  ".kb-v13-holo-body .kb-v13-mathfence.kb-v13-cfloat-src:hover{background:rgba(0,200,255,0.045);}",
  ".kb-v13-cfloat-src:focus-visible{outline:1px solid rgba(0,200,255,0.55);outline-offset:2px;}",
];

// ===== #15 图片悬浮层 =====
// 窗壳、标题栏、关闭按钮、占位条、抓角全部复用上面 CODEFLOAT 那一节（共用选择器），
// 这里只写"图"特有的三件事：零内边距的图片盒、标题栏里的两个读数、正文里那张图的提示。
// 设计定位与 #11 完全一致：乐器不是弹窗，不压暗背景，一处循环动画都没有。
const IMAGEFLOAT = [
  // 零内边距、零滚动：窗减去标题栏之后**就是**图片本身。
  // 锁比例缩放算的就是这个盒子，多一层内边距就得多算一层，比例会差出几个像素的留白。
  // 深一档的底色是给"图还没载完"和"比例算不准时的留白"一个交代，不是装饰。
  // touch-action:none：窗内要接滚轮缩放与双指捏合，交给浏览器就等于交给页面滚动。
  // 这里不像全息面板那样是个要滚的容器（overflow:hidden，没有可滚的内容），
  // 所以关掉手势默认行为不会让谁滚不动。
  ".kb-v13-ifloat-body{",
  "  position:relative;flex:1;min-height:0;overflow:hidden;padding:0;",
  "  background:rgba(0,0,0,.35);touch-action:none;",
  // 平移时别顺手把周围选成一片蓝（截图里最显眼的那种脏）
  "  user-select:none;-webkit-user-select:none;",
  "}",
  // #16 图**铺满窗**：尺寸是 CSS 给的（width/height 100%），不是 JS 写死的像素。
  // 窗本身按原图的宽高比锁着（见 imagefloat.js 的 lockRatio），所以 object-fit:contain
  // 正好等于铺满——四边不留白也不裁切。
  //
  // 这条分工是 #16 的骨架：**窗按图的形状拉，图在窗里铺满**，transform 只管手动缩放。
  // 反过来写（图按原图像素摆好、再用 JS 算的比例 transform 到窗上）试过，不对：
  // 那样"100%"是我算出来的近似值，不是浏览器摆出来的事实。
  // 「1:1 原尺寸」那一档会往 img 上写内联像素宽高盖掉这条（见 imgzoom.js 的 render）。
  ".kb-v13-ifloat-body img{",
  "  position:absolute;left:0;top:0;display:block;",
  "  width:100%;height:100%;object-fit:contain;",
  "  max-width:none;max-height:none;margin:0;border-radius:0;box-shadow:none;",
  "  transform-origin:0 0;",
  // 同上：图片的原生拖拽会把 pointer 事件掐断，平移就断在半路
  "  -webkit-user-drag:none;user-select:none;-webkit-user-select:none;",
  "}",
  // 图比窗大时才有可推的余地，那时才给抓手。装得下还给 grab，
  // 是在承诺一个推不动的动作。
  ".kb-v13-ifloat-body.kb-v13-ifloat-pannable,",
  ".kb-v13-ifloat-body.kb-v13-ifloat-pannable img{cursor:grab;}",
  ".kb-v13-ifloat-body.kb-v13-ifloat-pannable:active,",
  ".kb-v13-ifloat-body.kb-v13-ifloat-pannable:active img{cursor:grabbing;}",
  // 两档按钮（1:1 / 适应）。沿用顶栏「回忆 / 复习」那套分段控件，
  // 但整体小一圈：标题栏只有 32px 高，而且常开着很窄的窗（小图的窗就是原图那么宽）。
  // 标签因此用最短的词，完整说法进 title——悬停看得见，读屏也拿得到。
  // flex:0 0 auto：它是控件，窗再窄也不该被压没；让位的是两边的读数
  // （下面 size 与 zoom 都是 0 1 auto，地方不够先缩它们，把 ✕ 保下来）。
  // 标题栏的间距比代码窗紧一档：图片窗的宽度下限是 160（很小的图就顶在那儿），
  // 五个元素按 10px 排下来放不下，末尾的 ✕ 会被挤出窗外——那是关不掉的窗。
  // 只收图片窗的，代码窗（项少、不会挤）保持原样。这条必须排在 CODEFLOAT 之后才生效，
  // IMAGEFLOAT 正好在它后面（见文件末尾的 concat 顺序）。
  ".kb-v13-ifloat-bar{gap:6px;}",
  ".kb-v13-ifloat-modes{",
  "  flex:0 0 auto;display:flex;align-items:center;gap:1px;",
  "  border-radius:11px;border:1px solid rgba(0,180,255,0.1);background:rgba(0,180,255,0.03);",
  "}",
  ".kb-v13-ifloat-mode-btn{",
  "  padding:3px 4px;border:0;border-radius:9px;background:transparent;cursor:pointer;",
  "  font-family:inherit;font-size:10px;letter-spacing:.3px;line-height:1.4;white-space:nowrap;",
  "  color:rgba(0,180,255,0.35);transition:background .25s,color .25s;",
  "}",
  ".kb-v13-ifloat-mode-btn:hover{color:rgba(0,200,255,0.75);}",
  // 选中那一档填一层淡青底 + 亮一档的字，与顶栏那两个按钮同一处差别，不再叠边框
  ".kb-v13-ifloat-mode-btn[aria-pressed='true']{background:rgba(0,200,255,0.12);color:#8fdcff;}",
  ".kb-v13-ifloat-mode-btn:focus-visible{outline:1px solid rgba(0,200,255,0.45);outline-offset:2px;}",

  // 缩放百分比。和左边的原图尺寸是两个数：左边说"这张图是什么"，右边说"现在显示成多大"。
  // 0 1 auto + min-width:0：窗窄时它（和左边的尺寸读数）先缩没，让位给档位按钮和 ✕，
  // 而不是把 ✕ 顶出窗外。宽窗里它有富余，宽度仍然是内容宽度，不会忽宽忽窄。
  ".kb-v13-ifloat-zoom{",
  "  flex:0 1 auto;font-family:Consolas,'Courier New',monospace;font-size:11px;",
  "  color:rgba(0,200,255,0.5);min-width:0;text-align:left;",
  "}",

  // 标题栏左端：这是哪张图。文件名可能很长，让它吃掉中间的空档、尾巴省略
  ".kb-v13-ifloat-name{",
  "  flex:1 1 auto;min-width:0;font-size:11.5px;letter-spacing:.3px;",
  "  color:rgba(0,200,255,0.6);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  "}",
  // 右端：原图像素尺寸。跟左边的文件名一头一尾，和代码窗的「N 行」同一个位置同一个道理。
  // 它是**原图**的尺寸，拖角不改它——用户想知道这张图有多大，不是窗被拖成了多少像素。
  // 0 1 auto：与右边的百分比读数一起当让位的那两个——窗窄到摆不下时它们先缩没，
  // 档位按钮和 ✕ 留着（见上面 modes 那一段）。
  ".kb-v13-ifloat-size{",
  "  flex:0 1 auto;margin-left:auto;min-width:0;overflow:hidden;white-space:nowrap;",
  "  font-family:Consolas,'Courier New',monospace;",
  "  font-size:11px;color:rgba(0,200,255,0.35);",
  "}",

  // 正文里那张还没搬走的图：可以「拿起来」的一点点提示，外加键盘焦点环。
  // 用 box-shadow 描边而不是 border：border 会改变图片盒尺寸，正文排版会跟着抖一下。
  ".kb-v13-holo-body img.kb-v13-ifloat-src{cursor:pointer;transition:box-shadow .2s;}",
  ".kb-v13-holo-body img.kb-v13-ifloat-src:hover{box-shadow:0 2px 12px rgba(0,0,0,.35),0 0 0 1px rgba(0,200,255,.35);}",
  ".kb-v13-ifloat-src:focus-visible{outline:1px solid rgba(0,200,255,0.55);outline-offset:2px;}",
];

// ===== #12 / #13 「遮住 / 揭开」：一份语义、一份皮肤，两处落点 =====
// 落点一：#12 全息面板正文按 ---div--- 切出来的每一段。
// 落点二：#13 大卡卡头的关键词条。
//
// 设计定位：这是自测开关，不是装饰。
//   - 控件与内容分开。开关**永远**是那枚封条，正文/词条本身不是按钮——
//     正文里的代码块（#11）、宿主渲染出来的双链、要选中的文字都还归它们自己。
//   - 两个状态只差「封条在不在」：遮住态是一条青色虚线封条，里面铺斜纹；
//     揭开态把封条收成一枚贴在左边缘的暗青小签，内容在它下面。
//     斜纹不是新语言，是从 #6 概念遮罩、#11 占位条接过来的「这里被盖住了」，
//     所以用户学一次就够，不用在这个控件上再学一遍。
//   - 不开新色相：全用现有青色系。琥珀是反链专用、红是孤岛专用，都不借。
//   - 一处循环动画都没有。库里到处是 infinite，这个控件反着来——精确、静止。
//   - 封条是唯一可点的部件，所以给它键盘焦点环与 hover 反馈，别的什么都不加。
const MASKS = [
  ".kb-v13-mask{position:relative;}",
  // 遮住 = 内容真的看不见。少了这条，「再点遮上」就只把封条画回来、答案还摊在下面，
  // 这个开关等于没有（#6 概念遮罩靠 blur(5px) 达到同一个效果，这里内容更贵、
  // 也没必要让遮住的东西还留在版面上占位）。
  // 注意 display:none 而不是 filter：揭开过的段渲染结果留在原地不再重渲染，
  // 这里只是把它藏起来，再点开还是原来那份 DOM（#11 悬浮入口、双链都还在）。
  ".kb-v13-mask:not(.revealed) .kb-v13-mask-body{display:none;}",
  ".kb-v13-mask-cover{",
  "  display:flex;align-items:center;gap:10px;box-sizing:border-box;",
  "  height:var(--mask-h,36px);padding:0 12px;border-radius:8px;cursor:pointer;",
  "  border:1px dashed rgba(0,200,255,.18);",
  "  background:repeating-linear-gradient(135deg,rgba(0,200,255,.07) 0 6px,rgba(0,0,0,0) 6px 12px);",
  "  color:rgba(0,200,255,.45);font-size:11px;letter-spacing:1px;",
  "  transition:border-color .18s ease,color .18s ease;",
  "}",
  ".kb-v13-mask-cover:hover{border-color:rgba(0,200,255,.42);color:rgba(0,200,255,.78);}",
  ".kb-v13-mask-cover:focus-visible{outline:1px solid rgba(0,200,255,.45);outline-offset:2px;}",
  // 提示语顶到右端：左端说"这是哪一段"，右端说"点了会怎样"，两头各一个事实，
  // 中间留给斜纹（和 #11 悬浮窗标题栏一个排法）。
  ".kb-v13-mask-hint{margin-left:auto;}",
  // 揭开态：封条缩成一枚小签。它不是装饰——还点得回去（再点遮上），
  // 也是"这一段从哪儿开始"的界标。虚线底边是"这枚小签还能点"的唯一暗示：
  // 提示语只在遮住态写一遍就够（手势教过了），揭开态再写一遍是噪音，
  // 而且卡头那一行没有多余宽度再容一句提示。
  ".kb-v13-mask.revealed .kb-v13-mask-cover{",
  "  height:auto;padding:0;border:0;background:none;border-radius:0;",
  "  color:rgba(0,200,255,.4);font-size:10px;letter-spacing:.5px;",
  // 宽度裹住文字：底下那道虚线只划到小签自己的长度，不是横贯整块面板的一条线
  "  width:fit-content;max-width:100%;",
  "  border-bottom:1px dotted rgba(0,200,255,.3);",
  "}",
  ".kb-v13-mask.revealed .kb-v13-mask-cover:hover{color:rgba(0,200,255,.7);border-bottom-color:rgba(0,200,255,.5);}",
  ".kb-v13-mask.revealed .kb-v13-mask-hint{display:none;}",

  // 分段之间一条发丝线：揭不揭开都留着，段与段的边界是结构，不是状态
  ".kb-v13-holo-seg+.kb-v13-holo-seg{margin-top:10px;padding-top:10px;border-top:1px solid rgba(0,200,255,.07);}",
  ".kb-v13-holo-seg .kb-v13-mask-cover{margin-bottom:8px;}",
  ".kb-v13-holo-seg.revealed .kb-v13-mask-cover{margin-bottom:6px;}",

  // 卡头关键词条：占一行 22px，两态同高——卡面高度是写死的，条一旦变高
  // 就会把下面的概念区挤掉一块。所以揭开后小签和词条并排，不是上下摞。
  ".kb-v13-kw-strip{--mask-h:22px;margin:0 14px 8px;}",
  ".kb-v13-kw-strip .kb-v13-mask-cover{height:22px;}",
  ".kb-v13-kw-strip.revealed{display:flex;align-items:center;gap:8px;height:22px;}",
  ".kb-v13-kw-strip.revealed .kb-v13-mask-cover{flex:0 0 auto;height:22px;margin:0;}",
  ".kb-v13-kw-strip.revealed .kb-v13-mask-body{",
  "  flex:1;min-width:0;display:flex;align-items:center;gap:4px;overflow:hidden;",
  "}",

  // 词条：比标签(.kb-v13-card-tag)亮一档——标签是分类，词条是这一遍要回忆的答案。
  // 超出宽度的截断而不是换行：这一行只准占一行。
  ".kb-v13-kw{",
  "  flex:0 0 auto;max-width:112px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  "  padding:1px 8px;border-radius:9px;font-size:11px;line-height:1.5;",
  "  border:1px solid rgba(0,200,255,.22);background:rgba(0,200,255,.06);color:#7fd7ff;",
  "}",
  ".kb-v13-kw-more{flex:0 0 auto;font-size:10px;color:rgba(0,200,255,.4);}",
  // 窄条卡的关键词只走浮层（见 tooltip.js），浮层里允许换行
  ".kb-v13-tooltip-keywords{display:flex;flex-wrap:wrap;align-items:center;gap:4px;margin-top:6px;}",
  ".kb-v13-kw-label{flex:0 0 auto;font-size:10px;letter-spacing:.5px;color:rgba(0,200,255,.4);margin-right:2px;}",
];

// ===== #14 恢复上次那个屏幕 =====
// 顶栏那枚「忘掉上次看到哪儿」。它挨着 ✕，但读起来是两码事——✕ 关掉晶体库、
// 记住的屏幕留着；它连那份记忆一起清掉。所以颜色照旧走青色系（不是红，红在这个
// 界面里是「破坏性操作」的既有语言，而清掉一次视角没那么重），只有 hover 亮一档。
const RESTORE = [
  ".kb-v13-topbar-forget{",
  "  margin-right:10px;padding:6px 12px;border-radius:14px;cursor:pointer;",
  "  border:1px solid rgba(0,180,255,0.1);background:rgba(0,180,255,0.03);",
  "  color:rgba(0,180,255,0.35);font-size:11px;letter-spacing:.5px;",
  "  font-family:inherit;transition:border-color .25s,color .25s,background .25s;",
  "}",
  ".kb-v13-topbar-forget:hover{",
  "  border-color:rgba(0,200,255,0.3);background:rgba(0,200,255,0.06);color:rgba(0,200,255,0.75);",
  "}",
  ".kb-v13-topbar-forget:focus-visible{outline:1px solid rgba(0,200,255,0.45);outline-offset:2px;}",

  // 恢复回来的那张卡，面板里点一句「上次看到的是这张」。颜色由 hologram.js 按
  // 这张卡所属晶体的色相挂上（不引入新色），这里只管排版。
  // :empty 时不占位——平时它一个字都没有，留一条空行会把概念区往下推。
  ".kb-v13-holo-resume{",
  "  font-size:11px;letter-spacing:.5px;margin-top:6px;opacity:.85;",
  "}",
  ".kb-v13-holo-resume:empty{display:none;}",
];

// ===== #9 学习模式：回忆 / 复习 =====
// 顶栏右上角那对按钮。做成一颗胶囊里嵌两个按钮的分段控件，而不是两枚独立按钮：
// 它俩说的是"现在在哪一档"，挨在一起才读得出来是一件事的两个状态。
// 颜色照旧走青色系——复习模式不是危险操作，不该借用红色那套"破坏性"语言。
const MODE = [
  ".kb-v13-mode{",
  "  display:flex;align-items:center;gap:2px;margin-right:10px;padding:3px;",
  "  border-radius:16px;border:1px solid rgba(0,180,255,0.1);background:rgba(0,180,255,0.03);",
  "}",
  ".kb-v13-mode-btn{",
  "  padding:5px 14px;border:0;border-radius:13px;background:transparent;cursor:pointer;",
  "  font-family:inherit;font-size:11px;letter-spacing:.5px;",
  "  color:rgba(0,180,255,0.35);transition:background .25s,color .25s;",
  "}",
  ".kb-v13-mode-btn:hover{color:rgba(0,200,255,0.75);}",
  // 选中那一档填一层淡青底 + 亮一档的字。只有这一处差别就够分辨，
  // 再叠个边框/勾选反而是噪音。
  ".kb-v13-mode-btn[aria-pressed='true']{background:rgba(0,200,255,0.12);color:#8fdcff;}",
  ".kb-v13-mode-btn:focus-visible{outline:1px solid rgba(0,200,255,0.45);outline-offset:2px;}",
];

// ===== #10 全息面板可拖动 =====
// 面板是 overlay（display:flex）居中的子元素，位移走 transform，不碰 left/top——
// 见 holodrag.js 顶上那段。
const PANEL_DRAG = [
  // 整块都能按：光标就得说整块都能拖。正文里的文字因此不再是 text 光标，
  // 这是"整块可拖"这个选择本身的代价，不是漏改。代码块是唯一的例外
  // （holodrag.js 里从 pre/code 上按住仍然算划选），所以那里保持 text 光标，
  // 一眼能看出"这块跟别处不一样"。
  // 触摸这一档要给面板留活路：面板自己是 overflow-y:scroll 的（长概念会撑过 82vh），
  // 整块挂 touch-action:none 的话手机上就再也滚不动正文了。pan-y 是那个折中——
  // 纵向手势照旧交给浏览器滚动，横向手势才落到我们手里，所以触摸端至少横着能拖。
  // 标题那一行单独放开（touch-action:none），触屏上整行随意拖。
  // JS 侧的分流（holodrag.js 的 canStartDrag）与这两条是一件事的两半，改一处要改两处。
  ".kb-v13-hologram{cursor:grab;touch-action:pan-y;}",
  ".kb-v13-hologram:active{cursor:grabbing;}",
  ".kb-v13-holo-title{touch-action:none;}",
  ".kb-v13-holo-body pre,.kb-v13-holo-body pre *{cursor:auto;}",
  // 拖动期间禁掉划选：不然整块面板会顺带被选成一片蓝
  ".kb-v13-holo-dragging,.kb-v13-holo-dragging *{user-select:none!important;-webkit-user-select:none!important;}",
  // 拖动期间卫星不许跟拍：它们自带 transition:all .35s，不压掉就会慢半拍地
  // 追着面板跑，面板到位了卫星还在飘。松手由 refreshSatellites 摘掉这个类。
  ".kb-v13-sat-dragging .kb-v13-satellite{transition:none!important;}",
];

// ===== #19 多层晶体：面包屑 + 侧栏子晶体 =====
const MULTILEVEL = [
  // 面包屑。根层不显示（app 那边不加 .show），所以这里只看钻进之后的样子。
  ".kb-v13-crumbs{display:none;align-items:center;gap:2px;margin-left:14px;",
  "  font-size:12px;letter-spacing:.02em;min-width:0;overflow:hidden;}",
  ".kb-v13-crumbs.show{display:flex;}",
  // 面包屑是顶栏里的一串按钮，样式统一在这里；按钮默认外观全部抹掉。
  ".kb-v13-crumb{appearance:none;border:0;background:none;padding:2px 6px;border-radius:5px;",
  "  font:inherit;color:rgba(190,215,245,.62);cursor:pointer;white-space:nowrap;",
  "  max-width:180px;overflow:hidden;text-overflow:ellipsis;transition:color .16s,background .16s;}",
  ".kb-v13-crumb:hover{color:#e6f2ff;background:rgba(90,150,230,.16);}",
  ".kb-v13-crumb:focus-visible{outline:1px solid rgba(120,190,255,.7);outline-offset:1px;}",
  // 当前这一层不是可点的去处（你就站在这儿），所以它不可点、颜色也压下去
  ".kb-v13-crumb-cur{color:rgba(230,245,255,.95);cursor:default;font-weight:600;}",
  ".kb-v13-crumb-cur:hover{background:none;}",
  ".kb-v13-crumbs .kb-v13-crumb-back{color:rgba(150,200,255,.85);}",
  ".kb-v13-crumb-sep{color:rgba(140,175,215,.35);user-select:none;}",
  // 根那一段用「知识卡片」这个名字，它永远是可点的（回到晶体环）
  ".kb-v13-crumb-root{color:rgba(175,205,240,.75);}",

  // 侧栏里的子晶体：比顶层小一圈，且不跟着背景一起压暗——它们是这一层的内容。
  // 位置由 layout.js 的 facetGrid 算好写在行内，这里只管观感。
  ".kb-v13-crystal-sub .kb-v13-crystal-name{font-size:11px;}",
  ".kb-v13-crystal-sub .kb-v13-crystal-count{font-size:10px;}",
  ".kb-v13-crystal-sub .kb-v13-crystal-icon{font-size:14px;}",
  // ---- #21 两栏主次 + 文件夹入口 ----
  // 左右两颗箭头。同一时间只有一颗是「当前档」，另一颗按下去才有效果。
  ".kb-v13-facet-btn{appearance:none;width:22px;height:22px;margin-left:4px;padding:0;",
  "  border-radius:5px;border:1px solid rgba(0,180,255,.18);background:rgba(0,180,255,.05);",
  "  color:rgba(0,200,255,.55);font-size:9px;line-height:1;cursor:pointer;",
  "  display:flex;align-items:center;justify-content:center;transition:all .16s;}",
  ".kb-v13-facet-btn:hover{background:rgba(0,180,255,.14);color:rgba(140,225,255,.9);}",
  ".kb-v13-facet-btn:focus-visible{outline:1px solid rgba(120,190,255,.7);outline-offset:1px;}",
  ".kb-v13-facet-btn.active{background:rgba(0,180,255,.22);border-color:rgba(0,200,255,.5);",
  "  color:#bfeaff;}",
  ".kb-v13-facet-btn:first-of-type{margin-left:14px;}",

  // 「文件夹」入口。与孤岛那颗同一个形状，但它是中性蓝——孤岛那个是「有事要办」
  // 的红，这个只是「去看看」，两件事不该长得一样。
  ".kb-v13-folder-btn{appearance:none;margin-left:8px;padding:2px 9px;border-radius:11px;",
  "  border:1px solid rgba(0,180,255,.28);background:rgba(0,90,150,.28);",
  "  color:rgba(175,220,255,.9);font:inherit;font-size:11px;line-height:16px;",
  "  cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s;}",
  ".kb-v13-folder-btn:hover{background:rgba(0,120,190,.42);border-color:rgba(0,200,255,.5);}",
  ".kb-v13-folder-btn:focus-visible{outline:1px solid rgba(120,190,255,.8);outline-offset:1px;}",
  ".kb-v13-folder-btn[aria-expanded='true']{background:rgba(0,130,200,.5);",
  "  border-color:rgba(0,200,255,.55);color:#d8f2ff;}",

  // ---- #20 孤岛汇总：顶栏那颗按钮 + 它点开的浮层 ----
  // 按钮。没有孤岛时 app 那边直接 display:none，所以这里按「有」来画。
  ".kb-v13-orphan-btn{appearance:none;margin-left:10px;padding:2px 9px;border-radius:11px;",
  "  border:1px solid rgba(255,120,120,.35);background:rgba(120,30,40,.35);",
  "  color:rgba(255,190,190,.92);font:inherit;font-size:11px;line-height:16px;",
  "  cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s;}",
  ".kb-v13-orphan-btn:hover{background:rgba(150,40,52,.5);border-color:rgba(255,130,130,.55);}",
  ".kb-v13-orphan-btn:focus-visible{outline:1px solid rgba(255,140,140,.8);outline-offset:1px;}",
  ".kb-v13-orphan-btn[aria-expanded='true']{background:rgba(160,45,58,.6);",
  "  border-color:rgba(255,140,140,.6);color:#ffe3e6;}",

  // 浮层。定位挂在顶栏下面右侧——按钮就在右上角那一带。
  // 顶栏高 = 14 上 + 36（最高那个是关闭按钮）+ 14 下 + 1 边框 = 65，浮层贴着它下沿
  ".kb-v13-orphan-panel{position:absolute;top:66px;right:14px;z-index:130;",
  "  width:300px;max-height:min(56vh,420px);overflow-y:auto;",
  "  background:rgba(8,18,36,.97);border:1px solid rgba(255,120,120,.28);",
  "  border-radius:10px;box-shadow:0 12px 40px rgba(0,0,0,.55);",
  "  padding:6px;display:none;font-size:12px;}",
  ".kb-v13-orphan-panel.open{display:block;}",
  ".kb-v13-op-head{padding:6px 8px 8px;color:rgba(255,190,190,.9);",
  "  font-size:11px;letter-spacing:.04em;border-bottom:1px solid rgba(255,255,255,.06);}",

  // #21 搜索框（只长在「文件夹」面板上）。它**不能跟着列表一起重画**，
  // 否则打一个字丢一次焦点——结构上它是面板里固定的那一截。
  ".kb-v13-op-search-row{display:flex;align-items:center;gap:6px;",
  "  padding:4px 6px 6px;border-bottom:1px solid rgba(255,255,255,.06);}",
  // ⚠️ 底色与字色带 !important，理由与上面 `.kb-v13-edit-input` 那条**一模一样**
  //（那里写过一次，这里又踩了一次）：宿主主题会给 input 套自己的表单皮肤，
  // 而主题的样式表常常注入在我们的 <style> 之后——同优先级时后到的赢。
  // 不带 !important 的话，用户选的字色会被主题的字色盖掉，看起来就像「设了没生效」。
  // 底色也一并定死不透明：半透明是拿面板底色当假设，宿主一变就又不可控了。
  //
  // 字色取 `--kb-search-color`（#22 用户可选，默认紫），由 app.js 铺在根节点上。
  ".kb-v13-op-search{appearance:none;flex:1 1 auto;min-width:0;box-sizing:border-box;padding:5px 8px;",
  "  border-radius:6px;border:1px solid rgba(0,180,255,.22);",
  "  background-color:#0a1526 !important;color:var(--kb-search-color,#c9a0ff) !important;",
  "  caret-color:var(--kb-search-color,#c9a0ff);color-scheme:dark;",
  "  font:inherit;font-size:12px;outline:none;transition:border-color .16s;}",
  // #22 取色器：一块小色板。原生控件的外壳各端不一，这里统一成本面板的样子
  ".kb-v13-op-color{appearance:none;flex:0 0 auto;width:26px;height:26px;padding:2px;",
  "  box-sizing:border-box;border:1px solid rgba(0,180,255,.25);border-radius:6px;",
  "  background-color:rgba(0,20,40,.6);cursor:pointer;color-scheme:dark;",
  "  transition:border-color .16s;}",
  ".kb-v13-op-color:hover{border-color:rgba(0,200,255,.5);}",
  ".kb-v13-op-color:focus-visible{outline:1px solid rgba(120,190,255,.7);outline-offset:1px;}",
  ".kb-v13-op-color::-webkit-color-swatch-wrapper{padding:0;}",
  ".kb-v13-op-color::-webkit-color-swatch{border:none;border-radius:3px;}",
  ".kb-v13-op-search::placeholder{color:rgba(150,180,215,.45) !important;}",
  ".kb-v13-op-search:focus{border-color:rgba(0,200,255,.55);background-color:#0d1c30 !important;}",
  // 划选的颜色也定死：主题的 ::selection 在深底上常常是浅底白字，一样看不见
  ".kb-v13-op-search::selection{background:rgba(150,110,220,.45);color:#f4ecff;}",
  // 搜索时结果一律摊开，三角就没意义了——收起来，免得点了个不动的按钮
  "#kb-folders.searching .kb-v13-op-toggle{display:none;}",
  "#kb-folders.searching .kb-v13-op-crystal{padding-left:8px;}",

  // 一组 = 一颗晶体。组头可点开合，默认全收起。
  //
  // 组头是个 div，里面两个按钮：三角（展开/收起）和名字。拆开是为了让
  // 两个面板能有不同的「点名字」语义——文件夹面板点名字是钻进那颗晶体，
  // 孤岛面板点名字是展开那一组。按钮里套可点元素不合规，所以不合成一个。
  ".kb-v13-op-group{margin-top:2px;}",
  ".kb-v13-op-crystal{display:flex;align-items:center;gap:2px;",
  "  padding:0 8px 0 2px;border-radius:6px;transition:background .14s;}",
  ".kb-v13-op-crystal:hover{background:rgba(90,150,230,.14);}",
  // 三角本身是个按钮，给足点击面积（画出来的只有 5px，但热区有 24px）
  ".kb-v13-op-toggle{appearance:none;flex:0 0 auto;width:22px;height:24px;padding:0;",
  "  border:0;background:none;cursor:pointer;display:flex;align-items:center;justify-content:center;}",
  ".kb-v13-op-toggle:focus-visible{outline:1px solid rgba(120,190,255,.7);outline-offset:-2px;border-radius:4px;}",
  // 小三角靠 border 画，转 90° 表示展开——不用图标字体
  ".kb-v13-op-caret{width:0;height:0;border-left:5px solid rgba(180,205,235,.75);",
  "  border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .15s;}",
  ".kb-v13-op-group.open .kb-v13-op-caret{transform:rotate(90deg);}",
  ".kb-v13-op-pick{appearance:none;flex:1 1 auto;min-width:0;padding:6px 4px;border:0;background:none;",
  "  font:inherit;text-align:left;cursor:pointer;color:rgba(205,225,250,.9);",
  "  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ".kb-v13-op-pick:focus-visible{outline:1px solid rgba(120,190,255,.7);outline-offset:-1px;border-radius:4px;}",
  ".kb-v13-op-n{flex:0 0 auto;padding:0 6px;border-radius:8px;background:rgba(120,30,40,.6);",
  "  color:rgba(255,200,200,.95);font-size:10px;line-height:15px;}",
  // 组里的卡。默认收起，展开才占位置。
  //
  // 这条 `padding-left:20px` 就是整棵树的**缩进来源**：3.0 刀 9 起子文件夹也住在
  // 这里面（与直属卡同一列，见 treepanel.js），于是每深一层自动多缩进 20px，
  // 不必按深度去算内边距。`padding:0 0 4px 20px` 里那个 20 从第 #21 版就在，
  // 现在它同时承担了两件事——别顺手改成别的数，那会把整棵树的层级感推平。
  ".kb-v13-op-cards{display:none;padding:0 0 4px 20px;}",
  ".kb-v13-op-group.open .kb-v13-op-cards{display:block;}",
  ".kb-v13-op-card{appearance:none;width:100%;display:block;padding:5px 8px;border:0;",
  "  border-radius:6px;background:none;font:inherit;text-align:left;cursor:pointer;",
  "  color:rgba(215,232,252,.92);transition:background .14s;}",
  ".kb-v13-op-card:hover{background:rgba(90,150,230,.16);}",
  ".kb-v13-op-card:focus-visible{outline:1px solid rgba(120,190,255,.7);outline-offset:-1px;}",
  ".kb-v13-op-t{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ".kb-v13-op-c{display:block;margin-top:1px;font-size:11px;color:rgba(160,185,215,.6);",
  "  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
];

// ===== 世界容器（3.0 刀 1）=====
//
// 舞台与它那批绝对定位子元素之间多一层 .kb-v13-canvas。晶体、卡阵、跨晶体连线
// 都住进去，整片画面的平移缩放往后只写这一层的 transform。
//
// 三条边界，每一条都对应一种「改错了不报错、只是坏掉」：
//
//   1. **绝不能加 overflow:hidden。** 它的裁剪发生在局部坐标系里（transform 之前），
//      一旦平移出去，世界坐标里 (0,0)-(W,H) 之外的内容会被永久裁掉——表现是
//      「平移到头来还是只看得到最初那一屏」。视口裁剪归 stage 那层负责。
//   2. **这一刀刻意不给它 z-index，也不给 transform。** 两者都会让它变成一个
//      **层叠上下文**，里面所有 z-index 立刻变成局部的：晶体那句 `z-index:100!important`
//      再也压不过 canvas 外面的翻页箭头（10）。现在不加，环视图的层序就与改动前
//      逐字相同；等到刀 2 真给它 transform 时，再连着做一次显式的 z-index 预算。
//   3. **pointer-events:none 是有意的**：空白处的点击要**穿透**到 stage，否则
//      app.js 里 `if (e.target !== stage) return` 那条「点空白退层 / 取消选中」
//      会静默失效（target 变成了 canvas）。代价是这一层下面的子元素必须自己写
//      pointer-events:auto——晶体那条写在 BASE 的 .kb-v13-crystal 里，
//      卡片本来就有（.kb-v13-card 与 .kb-v13-wave>*），连线层与选中提示本来就是 none。
//      画布模式下 canvas 会自己收回事件（见刀 2），那时这条由 .kb-v13-canvas-mode 覆盖。
//
// 还有一条给将来的：canvas 一旦有了 transform，它就成了 position:fixed 后代的
// **包含块**。任何 fixed 元素都不许放进这一层。今天 tooltip 挂 body、卫星与浮窗挂
// overlay，恰好都在外面——这个「恰好」要写下来，不然迟早有人往卡里塞个 fixed 徽标。
const CANVAS = [
  ".kb-v13-canvas{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;}",

  // ---- 3.0 刀 2：画布模式 ----
  //
  // 这一档里世界层**同时**拿到 transform 和 z-index，于是它变成一个层叠上下文
  // ——里面所有 z-index 立刻变成局部的。所以这里连着做一次显式的预算：
  //
  //     canvas(1) < 翻页箭头(10) < 选中提示(118)
  //
  // 于是晶体那句 `z-index:100!important` 在画布模式下**再也压不过翻页箭头**。
  // 这是有意的：箭头是 UI，被晶体盖住就等于点不着。环/层内模式下 canvas 没有
  // transform、z-index 仍是 auto，层序与改动前逐字相同（canvas.spec.js 钉着）。
  // ⚠️ 这里**不设 pointer-events:auto**。刀 2 第一版设过，那时平移还绑在画布上；
  // 改成绑舞台之后它就变成了纯粹的坏事：画布铺满视口，它一旦收回事件，
  // 舞台上就再也收不到空白处的按下——**整个视口只有画布盖不到的那条边能拖**。
  // 空白处的点击要一路穿透到舞台（平移、取消选中都靠它）；
  // 晶体与卡片自己写了 pointer-events:auto，不需要父层替它们收。
  ".kb-v13-canvas-mode .kb-v13-canvas{",
  "  z-index:1;transform-origin:0 0;",
  "}",
  // 抓手光标挂在**舞台**上，不是画布上：平移的落点整个视口都是（见 canvas.js 里
  // 那段「为什么不绑 canvas」），光标得跟着那个落点走。
  ".kb-v13-canvas-mode .kb-v13-stage{cursor:grab;}",
  ".kb-v13-canvas-mode .kb-v13-stage.kb-v13-panning{cursor:grabbing;}",
  // 但晶体自己仍是「可以点的」。这条不是多余——上面那条 (0,2,0) 比
  // .kb-v13-crystal 的 (0,1,0) 更具体，不写这一条的话晶体上会显示抓手，
  // 而它其实是能点开的，光标说了假话。
  ".kb-v13-canvas-mode .kb-v13-stage .kb-v13-crystal{cursor:pointer;}",
  // 拖动手感：拖动中别让文字被选中，否则会拖出一片蓝色高亮
  ".kb-v13-canvas-mode .kb-v13-stage.kb-v13-panning *{user-select:none;}",

  // ⚠️ 这一条是画布模式**能看见东西**的前提。gridStage 的 overflow:hidden
  // 裁剪发生在**局部坐标系**里（transform 之前）——不放开的活，世界坐标里
  // (0,0)-(W,H) 之外的内容会被永久裁掉，表现是「平移到头来还是只看得到第一屏」。
  // 只在画布模式下放开：环/层内模式那条路上 applyCardRegion 的两栏缩放
  // 依赖这个裁剪在做事，不能动。
  ".kb-v13-canvas-mode .kb-v13-grid-stage{overflow:visible;}",

  // 顶栏的模式开关。形状抄「文件夹」那颗（中性蓝 = 「去看看」），
  // 但高亮态换一种说法：它表示「现在不在默认那一档」，不是「面板开着」。
  ".kb-v13-stage-btn{appearance:none;margin-left:8px;padding:2px 9px;border-radius:11px;",
  "  border:1px solid rgba(0,180,255,.28);background:rgba(0,90,150,.28);",
  "  color:rgba(175,220,255,.9);font:inherit;font-size:11px;line-height:16px;",
  "  cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s;}",
  ".kb-v13-stage-btn:hover{background:rgba(0,120,190,.42);border-color:rgba(0,200,255,.5);}",
  ".kb-v13-stage-btn:focus-visible{outline:1px solid rgba(120,190,255,.8);outline-offset:1px;}",
  ".kb-v13-stage-btn.kb-v13-stage-on{background:rgba(0,130,200,.5);",
  "  border-color:rgba(0,200,255,.55);color:#d8f2ff;}",

  // 「未保存」：草稿和落盘那份不一样时才亮。一个点，不是一句话——
  // 它回答的是「我刚摆的东西算不算数」，所以要显眼但不能吵。
  ".kb-v13-stage-btn.kb-v13-stage-dirty::after{content:'•';margin-left:4px;",
  "  color:rgba(255,200,120,.95);font-size:13px;line-height:1;}",

  // 3.0 刀 3「恢复默认」。两步式：第一下变成「确认恢复？」，第二下才真做。
  // 危险色（琥珀）只在**armed**那一刻出现——平时它只是一颗普通的次级按钮，
  // 天天红着会让人对这个颜色免疫，真该小心的时候反而看不见了。
  ".kb-v13-reset-btn{appearance:none;margin-left:8px;padding:2px 9px;border-radius:11px;",
  "  border:1px solid rgba(0,180,255,.22);background:rgba(0,80,130,.22);",
  "  color:rgba(170,215,255,.82);font:inherit;font-size:11px;line-height:16px;",
  "  cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s,color .16s;}",
  ".kb-v13-reset-btn:hover{background:rgba(0,110,175,.38);border-color:rgba(0,200,255,.45);}",
  ".kb-v13-reset-btn:focus-visible{outline:1px solid rgba(120,190,255,.8);outline-offset:1px;}",
  ".kb-v13-reset-btn.kb-v13-armed{background:rgba(150,95,20,.5);",
  "  border-color:rgba(255,190,90,.65);color:#ffe3b0;font-weight:600;}",

  // 拖动中的晶体。抬起来一点、加一层辉光——不然和「选中」长得一样，
  // 而这两件事完全不同（一个是临时动作，一个是状态）。
  ".kb-v13-canvas .kb-v13-crystal.kb-v13-dragging{",
  "  z-index:120!important;filter:drop-shadow(0 8px 20px rgba(0,0,0,.55));",
  "  transition:none;cursor:grabbing;}",

  // ---- 3.0 刀 4：方框模块 ----
  //
  // z-index 预算（这一层是画布里最底下的）：
  //   modules 层(0) < cardsArea(1) < 晶体(1) < 连线(115/116)
  // 靠 **DOM 顺序 + 显式 z-index 两条一起**保证：方框层是 canvas 的第一个子节点，
  // 而每个方框自己的 z-index = 嵌套深度 + 1（子框画在父框之上，天然成立）。
  //
  // ⚠️ `.kb-v13-module` 自己是 **pointer-events:none**：框体不能抢事件，
  // 否则框里的晶体就点不着了。只有标题栏和右下角那小块能收事件——
  // 这和 cardgrid 既有那套（cardsArea 是 none、卡片是 auto）是同一个套路。
  // 别用 elementFromPoint 做命中判定：这一条会让它永远返回底下的东西。
  ".kb-v13-modules{position:absolute;top:0;left:0;right:0;bottom:0;pointer-events:none;z-index:0;}",
  ".kb-v13-module{",
  "  position:absolute;pointer-events:none;box-sizing:border-box;",
  "  border:1px dashed rgba(120,170,230,.45);border-radius:14px;",
  "  background:rgba(70,120,190,.06);",
  "}",
  ".kb-v13-module-bar{",
  "  position:absolute;top:0;left:0;right:0;height:26px;",
  "  display:flex;align-items:center;gap:6px;padding:0 8px;box-sizing:border-box;",
  "  pointer-events:auto;cursor:grab;border-radius:13px 13px 0 0;",
  "  background:rgba(60,110,180,.22);border-bottom:1px solid rgba(120,170,230,.22);",
  "}",
  ".kb-v13-module-name{",
  "  flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  "  font-size:11.5px;color:rgba(200,225,255,.92);cursor:text;",
  "}",
  ".kb-v13-module-name:hover{color:#e8f4ff;text-decoration:underline dotted;}",
  ".kb-v13-module-del{",
  "  appearance:none;flex:none;width:16px;height:16px;padding:0;line-height:1;",
  "  border-radius:5px;border:none;background:transparent;",
  "  color:rgba(200,225,255,.5);font-size:13px;cursor:pointer;",
  "}",
  ".kb-v13-module-del:hover{background:rgba(200,60,60,.3);color:#ffd6d6;}",
  ".kb-v13-module-grip{",
  "  position:absolute;right:0;bottom:0;width:18px;height:18px;pointer-events:auto;",
  "  cursor:nwse-resize;border-radius:0 0 13px 0;",
  "  background:linear-gradient(135deg,transparent 50%,rgba(120,170,230,.45) 50%);",
  "}",
  ".kb-v13-module.kb-v13-dragging{",
  "  border-color:rgba(140,200,255,.8);background:rgba(70,120,190,.14);",
  "  box-shadow:0 8px 24px rgba(0,0,0,.45);",
  "}",
  // 就地改名的输入框。**必须写 !important 底色**——宿主主题的样式表注入在我们
  // 之后，同优先级时后到的赢，不写就会变成「主题的输入框」长在这个自绘 UI 里。
  // 这个坑 styles.js 里 `.kb-v13-edit-input` 那条早就写过一次了。
  ".kb-v13-rename-input{",
  "  flex:1;min-width:0;padding:0 4px;height:18px;box-sizing:border-box;",
  "  border-radius:4px;border:1px solid rgba(140,200,255,.7);",
  "  background-color:rgba(8,20,40,.95)!important;color:#e8f4ff!important;",
  "  font:inherit;font-size:11.5px;outline:none;",
  "}",
  // 「+ 方框」按钮。与「恢复默认」同一档，但它是**加法**——
  // 用中性蓝，不用恢复默认那支会变琥珀的危险色。
  ".kb-v13-addmod-btn{appearance:none;margin-left:8px;padding:2px 9px;border-radius:11px;",
  "  border:1px solid rgba(0,180,255,.3);background:rgba(0,95,155,.3);",
  "  color:rgba(185,225,255,.92);font:inherit;font-size:11px;line-height:16px;",
  "  cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s;}",
  ".kb-v13-addmod-btn:hover{background:rgba(0,125,195,.44);border-color:rgba(0,200,255,.55);}",
  ".kb-v13-addmod-btn:focus-visible{outline:1px solid rgba(120,190,255,.8);outline-offset:1px;}",
  // 「隐藏双链」。中性灰蓝，和「+ 方框」那种"动作"按钮分开——它是**减东西**的，
  // 但又不危险（随时能切回来），所以不用琥珀那支警示色。
  ".kb-v13-hidelinks-btn{appearance:none;margin-left:8px;padding:2px 9px;border-radius:11px;",
  "  border:1px solid rgba(150,175,205,.3);background:rgba(60,85,120,.28);",
  "  color:rgba(190,210,235,.9);font:inherit;font-size:11px;line-height:16px;",
  "  cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s;}",
  ".kb-v13-hidelinks-btn:hover{background:rgba(80,110,150,.42);border-color:rgba(170,200,235,.5);}",
  ".kb-v13-hidelinks-btn:focus-visible{outline:1px solid rgba(120,190,255,.8);outline-offset:1px;}",
  ".kb-v13-hidelinks-btn:active{background:rgba(90,120,160,.5);}",
  // 藏着的时候要看得出来。按钮上的字已经变成「显示连线」，但"现在是什么状态"
  // 和"按下去会怎样"是两件事——只看字要在脑子里倒一次，加个底色就不用。
  ".kb-v13-hidelinks-btn.kb-v13-hidelinks-on{background:rgba(45,70,105,.62);",
  "  border-color:rgba(150,185,225,.55);color:rgba(205,222,245,.95);}",
  // 「选框 / 删除实线」。选框开着时按钮点亮 + 鼠标变方框——
  // **光标就是这套交互的全部反馈**：拖下去到底是框选还是推画面，
  // 光标说了算，不用去回想刚才点没点过那颗按钮。
  ".kb-v13-marquee-btn,.kb-v13-dellines-btn{appearance:none;margin-left:8px;padding:2px 9px;",
  "  border-radius:11px;border:1px solid rgba(255,175,165,.32);background:rgba(95,60,60,.3);",
  "  color:rgba(245,205,198,.92);font:inherit;font-size:11px;line-height:16px;",
  "  cursor:pointer;white-space:nowrap;transition:background .16s,border-color .16s;}",
  ".kb-v13-marquee-btn:hover,.kb-v13-dellines-btn:hover{",
  "  background:rgba(130,75,72,.45);border-color:rgba(255,180,170,.55);}",
  ".kb-v13-marquee-btn.kb-v13-marquee-on{background:rgba(165,70,60,.62);",
  "  border-color:rgba(255,170,155,.75);color:rgba(255,235,230,.98);}",
  ".kb-v13-dellines-btn{background:rgba(150,55,48,.55);color:rgba(255,232,228,.98);}",
  ".kb-v13-marquee-arm .kb-v13-stage{cursor:cell;}",

  // ---- 3.0 刀 5：故事线 ----
  //
  // 节点是**小形态**（标题 + 概念），不是卡阵里那种完整卡。一屏要摊开几十上百张，
  // 完整卡那套（概念区、关键词条、标签、遮罩）会把浏览器按死，而且在这里也读不了
  // ——那么小的字放不下第二行信息。**这是故事线最容易翻车的地方**，
  // 所以形态从一开始就是小的，不做「先做大再改小」。
  ".kb-v13-slinks{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:0;}",
  // 文件名链那一档不再画线了（3.0 刀 9-D，用户 09-19 判的），规则留着是为了
  // 旧存档里那些 `.kb-v13-slink-chain` 的节点还能被认出来，不是还有人在用。
  ".kb-v13-slink-chain{stroke:rgba(120,190,255,.20);stroke-width:1.2;stroke-linecap:round;}",
  // 双链：亮、粗、虚线，还带一层微光——用户自己写的关系才是主角。
  ".kb-v13-slink-direct{stroke:rgba(120,240,255,.72);stroke-width:1.8;stroke-dasharray:6,5;",
  "  stroke-linecap:round;filter:drop-shadow(0 0 4px rgba(80,200,255,.45));}",
  // 双链两头的箭头（3.0 刀 9-D）。**它是"谁链谁"唯一的载体**——两根线合成一根
  // 之后，只有箭头还分得清方向。颜色必须跟 `.kb-v13-slink-direct` 一致，写死
  // 而不是 `context-stroke`：那个特性各家 Chromium 的支持参差，画不出来时
  // 是**静默**的（箭头透明），没人会报错。
  ".kb-v13-sarrow{fill:rgba(120,240,255,.72);}",
  // ⚠️ `pointer-events:auto` **必须显式写**。节点住在世界层里，而世界层是
  // `pointer-events:none` 的（空白处的点击要穿透到舞台）——不写这一条，
  // 节点继承 `none`，点它、拖它全部落空，而且**不报错**，只是「点了没反应」。
  //
  // 这条规律这一轮已经踩到第三次：晶体（刀 1）、方框的标题栏与抓手（刀 4）、
  // 现在是故事线节点。**凡是住在世界层里、又要点得着的东西，都得自己写这一句。**
  ".kb-v13-snode{",
  "  position:absolute;box-sizing:border-box;z-index:1;pointer-events:auto;",
  "  padding:10px 12px;border-radius:10px;cursor:pointer;",
  "  background:rgba(10,22,44,.92);border:1px solid rgba(0,180,255,.22);",
  "  transition:border-color .16s,background .16s,box-shadow .16s;",
  "}",
  ".kb-v13-snode:hover{",
  "  border-color:rgba(0,200,255,.55);background:rgba(16,34,64,.96);",
  "  box-shadow:0 4px 16px rgba(0,0,0,.4);",
  "}",
  ".kb-v13-snode-title{",
  "  font-size:12.5px;font-weight:600;color:rgba(215,235,255,.94);",
  "  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  "}",
  ".kb-v13-snode-concept{",
  "  margin-top:5px;font-size:11px;line-height:1.45;color:rgba(150,190,235,.7);",
  "  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;",
  "}",
  // 幽灵节点：链到本晶体之外的**那一头**。虚线 + 暗一点，一眼能看出它不是这里的卡。
  // 不做成实心是因为它会让人以为「这张卡也在这个晶体里」——那正是最容易误解的地方。
  ".kb-v13-snode-ghost{",
  "  background:rgba(10,18,34,.6);border-style:dashed;border-color:rgba(140,175,215,.4);",
  "}",
  ".kb-v13-snode-ghost .kb-v13-snode-title{color:rgba(180,205,235,.72);font-weight:500;}",
  // 故事线节点的拖动态（与其它拖动共用 .kb-v13-dragging 的语义）

  // 四边中点的**连接点**。平时 display:none，只有连接模式（.kb-v13-linking）才显形。
  // 一屏几十张卡、每张挂四个小圆点，常驻的话那画面没法看。
  // margin:-6px 是把 12px 的小圆点正好压在卡片边缘那一点上（半宽半高）。
  ".kb-v13-port{position:absolute;width:12px;height:12px;margin:-6px;border-radius:50%;",
  "  background:#0a1626;border:1.5px solid rgba(120,240,255,.85);pointer-events:auto;",
  "  display:none;cursor:crosshair;z-index:5;transition:transform .12s,background .12s;}",
  ".kb-v13-linking .kb-v13-port{display:block;}",
  ".kb-v13-port:hover{background:rgba(120,240,255,.9);transform:scale(1.35);}",
  ".kb-v13-port[data-side='top']{left:50%;top:0;}",
  ".kb-v13-port[data-side='bottom']{left:50%;top:100%;}",
  ".kb-v13-port[data-side='left']{left:0;top:50%;}",
  ".kb-v13-port[data-side='right']{left:100%;top:50%;}",
  // 连接模式里整张卡也是十字光标：那一下点它是用来连线的，不是用来进去的
  ".kb-v13-linking .kb-v13-snode{cursor:crosshair;}",

  // 手工连的线：暖色（金），和文件名链、双链都分得开。
  // **用户自己画的**，所以它最亮——这一屏上它优先级最高。
  //
  // 走的是**流程图式折线**（见 storyline.js 的 routePoints）：只走横平竖直，
  // 拐弯处带圆角。原来那个贝塞尔弧好看，但它说的是"这两头有关系"；折线说的是
  // "从这儿到那儿怎么走"，而手工线本来就是一条条自己去连的，更像后者。
  ".kb-v13-slink-manual{stroke:rgba(255,200,110,.88);stroke-width:2;stroke-linecap:round;",
  "  stroke-linejoin:round;fill:none;filter:drop-shadow(0 0 4px rgba(255,190,90,.45));}",
  // 框选中的线：更亮、更粗。**这不是装饰**——它回答的是"按 D 会删掉哪几根"，
  // 而那正是这套交互里唯一可能出事的地方。
  ".kb-v13-slink-picked{stroke:rgba(255,120,110,.98);stroke-width:3;",
  "  filter:drop-shadow(0 0 8px rgba(255,110,100,.8));}",
  // 框选的矩形。虚线的红，和"要删了"这件事对得上。
  // **不能收事件**：它压在线上，pointer-events 一开就把 hitManual 挡在后头了。
  ".kb-v13-marquee{fill:rgba(255,110,100,.10);stroke:rgba(255,140,130,.85);",
  "  stroke-width:1.2;stroke-dasharray:5,4;pointer-events:none;}",
  // 拐点抓手**单独一层、画在卡片之上**（z-index 2 > 节点的 1）。
  // 线本身埋在卡片底下是对的（横穿卡面很难看），但抓手跟着埋进去就永远点不着——
  // 金线经常整段压在别的卡上，那正是最需要抓拐点的地方。
  ".kb-v13-shandles{position:absolute;left:0;top:0;overflow:visible;pointer-events:none;z-index:2;}",
  // **pointer-events:auto 必须显式写**——它住在 SVG 里，而 SVG 是
  // pointer-events:none；不写这一条，双击它、拖它全部落空且不报错。
  ".kb-v13-sbend{fill:#0a1626;stroke:rgba(255,215,130,.95);stroke-width:2;",
  "  pointer-events:auto;cursor:grab;}",
  ".kb-v13-sbend:hover{fill:rgba(255,215,130,.9);}",
  ".kb-v13-shandles.kb-v13-benddrag .kb-v13-sbend{cursor:grabbing;}",
  // 编辑模式那行说明条。**这套交互没有可见的入口**（不像连接模式有一圈
  // 连接点自己说明自己），不写一行字的话用户根本不知道有这回事——
  // 第一步"右键点金线"是猜不出来的。
  ".kb-v13-linehint{",
  "  position:absolute;left:50%;bottom:88px;transform:translateX(-50%);z-index:118;",
  "  display:none;padding:6px 16px;border-radius:14px;pointer-events:none;",
  "  background:rgba(6,14,30,.88);border:1px solid rgba(255,150,140,.22);",
  "  color:rgba(255,175,165,.8);font-size:11.5px;letter-spacing:.5px;white-space:nowrap;",
  "}",
  ".kb-v13-linehint-hit{color:rgba(255,205,195,.95);border-color:rgba(255,140,130,.5);}",
  // 编辑模式里光标换成十字：拖出去就是框选，不换的话手感还是"拖画布"。
  ".kb-v13-lineedit .kb-v13-stage{cursor:crosshair;}",
  ".kb-v13-lineedit.kb-v13-sheld .kb-v13-stage{cursor:cell;}",
  // 拖动中那根橡皮筋。pointer-events:none 是**必须的**——不然它会挡在指针底下，
  // 松手时命中的就是它而不是那张卡。
  ".kb-v13-slink-rubber{stroke:rgba(120,240,255,.9);stroke-width:2;stroke-dasharray:5,4;",
  "  pointer-events:none;}",
  ".kb-v13-snode.kb-v13-dragging{",
  "  z-index:120!important;transition:none;cursor:grabbing;",
  "  border-color:rgba(140,200,255,.75);box-shadow:0 8px 24px rgba(0,0,0,.5);",
  "}",
];

// ===== 3.0 刀 6：文献阅读器 =====
//
// 层序：它是**另一块屏**，盖在整个晶体库上面。z-index 取 10020——
//
//     全屏库(9990) < 全息遮罩(9999) < 阅读器(10020) < 悬浮窗(10050) < tooltip(99999)
//
// 阅读器压在遮罩之上是必须的：从阅读器里点开一张卡的面板时，面板不该盖住阅读器。
// 而**必须低于悬浮窗**：阅读器里的 markdown 正文可以带代码块，点开会走
// floatwin 那条路，那一扇窗得浮在阅读器上面——否则它开在一个用户看不见的地方，
// 表现是「点了没反应」，而且 Esc 收的还是阅读器（closeTopFloat 排在后面）。
const READER = [
  // ---- 3.0 刀 9-A4：这一屏**跟随宿主的主题** ----
  //
  // 在这之前，整个晶体库（包括阅读器）是一套**自绘的深色**：navy/cyan 的 rgba 写死。
  // 深色主题下没问题；浅色主题下就是一块深蓝嵌在白笔记里，而且字色也是写死的浅蓝。
  //
  // 现在这一屏改走 Obsidian 的主题变量，**每一个都带原值当回退**：
  //     var(--text-normal, rgba(190,220,250,.8))
  // 于是两件事同时成立：
  //   · **网页原型（没有这些变量）逐像素不变**——回退值就是原来那个颜色；
  //   · Obsidian 里跟随宿主主题，深色浅色都对。
  //
  // 对照表（用的时候照它挑，别临时发明）：
  //   底色       --background-primary / --background-secondary / --background-modifier-form-field
  //   描边       --background-modifier-border
  //   正文       --text-normal / --text-muted / --text-faint（由重到轻）
  //   强调色     --text-accent（原来的青）
  //   按钮       --interactive-normal / --interactive-hover / --interactive-accent
  //   语义色     --text-error / --text-success
  //
  // ⚠️ 背景那一条是**两段回退**：它原样是一个从上往下变暗的 radial-gradient。
  // 拿主题变量把整条换掉的话，原型就从渐变变成纯色了。所以两个色标各自换——
  // 原型拿到的仍是原来那两个颜色，Obsidian 里是由主题推出来的同款渐变。
  ".kb-v13-reader{",
  "  display:none;position:fixed;inset:0;z-index:10020;",
  "  background:radial-gradient(ellipse at 50% 20%,",
  "    var(--background-primary, #0e1a29),var(--background-secondary, #05080f));",
  "  font-family:system-ui,sans-serif;color:var(--text-normal, rgba(200,220,240,.86));",
  "}",
  ".kb-v13-reader.open{display:flex;flex-direction:column;}",

  "/* 顶栏 */",
  ".kb-v13-reader-bar{",
  "  display:flex;align-items:center;gap:10px;flex-wrap:wrap;",
  "  padding:12px 20px;border-bottom:1px solid var(--background-modifier-border, rgba(255,255,255,.08));",
  "}",
  ".kb-v13-reader-title{font-size:15px;font-weight:700;letter-spacing:.5px;color:var(--text-accent, rgba(0,200,255,.8));",
  "  max-width:38vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ".kb-v13-reader-count{font-size:12px;color:var(--text-muted, rgba(160,190,220,.5));}",
  ".kb-v13-reader-spacer{flex:1;}",
  ".kb-v13-reader-bar button{",
  "  cursor:pointer;border-radius:8px;padding:6px 12px;font-size:12px;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.2));",
  "  background:var(--interactive-normal, rgba(10,22,40,.7));",
  "  color:var(--text-normal, rgba(190,220,250,.8));",
  "  transition:background .2s,border-color .2s;",
  "}",
  ".kb-v13-reader-bar button:hover:not(:disabled){background:var(--interactive-hover, rgba(0,90,150,.35));border-color:var(--text-accent, rgba(0,200,255,.45));}",
  // 停用态要**看得出来**：翻到头了这件事，用户唯一的线索就是这两颗按钮灰下去。
  ".kb-v13-reader-bar button:disabled{opacity:.3;cursor:default;}",
  // 「桌面」那颗按下去了没有。之前只有 `aria-pressed`，**视觉上没有任何提示**——
  // 按下去和没按下去长得一模一样，用户没法判断自己现在在哪一档。
  ".kb-v13-reader-nav-on{",
  "  background:var(--interactive-accent, rgba(0,90,150,.55))!important;",
  "  color:var(--text-on-accent, rgba(230,245,255,.95))!important;",
  "  border-color:var(--interactive-accent, rgba(0,200,255,.55))!important;",
  "}",
  // 3.0 刀 9-C：阅读器被挂起（人正在故事线上）时顶栏那颗「文献」的样子。
  // 它这会儿说的是「回到刚才那份」，得跟平时那颗长得不一样——不然用户会以为
  // 点下去是**新开**一份，而他要的东西（桌面摆法、开着的文献、页码）其实还在里头。
  // ⚠️ 用 `!important` + 不透明色，理由和 `.kb-v13-reader-nav-on` 一样：
  //   宿主主题给 `button` 套的皮肤常常排在我们后面，同优先级时后到的赢。
  ".kb-v13-reader-btn-back{",
  "  background:var(--interactive-accent, rgba(0,90,150,.55))!important;",
  "  color:var(--text-on-accent, rgba(230,245,255,.95))!important;",
  "  border-color:var(--interactive-accent, rgba(0,200,255,.55))!important;",
  "}",
  ".kb-v13-reader-zoom{padding:6px 10px!important;font-size:13px!important;}",
  ".kb-v13-reader-zoomval{font-size:12px;color:var(--text-muted, rgba(160,190,220,.55));min-width:42px;text-align:center;}",

  "/* 主体：页区 + 右栏。position:relative 是给文档选择器当定位基准用的 */",
  ".kb-v13-reader-main{position:relative;flex:1;display:flex;min-height:0;}",

  "/* 页区。overflow:hidden 是对的：一屏就是全部，没有滚动这回事 */",
  ".kb-v13-reader-sheets{flex:1;position:relative;overflow:hidden;}",
  ".kb-v13-reader-grid{",
  "  position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);",
  "  display:grid;box-sizing:border-box;",
  "}",
  ".kb-v13-reader-sheet{display:flex;flex-direction:column;}",
  ".kb-v13-reader-cap{",
  "  height:22px;line-height:22px;font-size:11px;letter-spacing:.5px;",
  "  color:var(--text-faint, rgba(150,185,215,.45));flex:0 0 auto;",
  "}",
  // ⚠️ `position:relative` **不能删**（3.0 刀 7 加的）。上面那两个绝对定位的覆盖层
  // （文字层、以及将来的批注层）拿它当定位基准。少了它，它们会一路逃到
  // `.kb-v13-reader-grid`——那是**整片页网格**的容器，于是所有页共用同一个覆盖层，
  // 选出来的字全是别页的。**不报错，只是选错**，属于最难查的那种坏法。
  // ⚠️ 页底的 `background` **必须跟着主题走**，别写死白。
  // 这一条同时修掉一个真的读不了：markdown 那一支是交给**宿主的渲染器**渲染的
  // （`adapter.renderMarkdown`），字色由宿主主题决定——深色主题下它是浅色的，
  // 而这里从前写死了白底，于是**浅字压在白底上，什么都看不见**。
  // PDF 与图片不受影响：那两种是画布/图片自身盖住整块底的。
  ".kb-v13-reader-page{",
  "  position:relative;flex:1 1 auto;overflow:hidden;border-radius:4px;",
  "  background:var(--background-primary, rgba(255,255,255,.94));",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.14));",
  "  display:flex;align-items:center;justify-content:center;",
  "}",
  // PDF 与图片都按格子的宽度铺满。**画布本身是块级元素**，不给它 max-width
  // 的话它会按自己的像素尺寸撑破格子——而格子尺寸是 computeGrid 算的，
  // 两边一旦不一致，表现是「放大之后页与页叠在一起」。
  ".kb-v13-reader-canvas{display:block;max-width:100%;max-height:100%;}",
  ".kb-v13-reader-img{display:block;max-width:100%;max-height:100%;object-fit:contain;}",
  ".kb-v13-reader-page-err{font-size:12px;color:var(--text-error, #f87171);padding:8px;text-align:center;}",
  // markdown 那一支由宿主渲染器出 HTML，这层只管把它的排版框住
  ".kb-v13-reader-page>*{max-width:100%;}",
  ".kb-v13-reader-page p{margin:0 0 .5em;font-size:12px;line-height:1.6;}",
  ".kb-v13-reader-page img{max-width:100%;height:auto;}",

  "/* 3.0 刀 7：透明文字层。canvas 里只有像素、选不中；这一层里是**真文字**，",
  "   只是看不见。盖上去之后拖选与 Ctrl+C 就是浏览器原生的行为了。 */",
  ".kb-v13-reader-textlayer{",
  "  position:absolute;overflow:hidden;line-height:1;z-index:1;",
  // 显式写 text：将来谁给阅读器（或它的祖先）加上一条 user-select:none，
  // 这一层会跟着失效——而失效的样子是「突然选不中了」，跟这一层看不出关系。
  "  user-select:text;-webkit-user-select:text;",
  "}",
  ".kb-v13-reader-tl{",
  // 文字是**透明的**：它只负责被选中，不负责好看。看见的字全是底下那张画布的。
  "  position:absolute;white-space:pre;color:transparent;",
  "  transform-origin:0 0;cursor:text;",
  "}",
  // 透明层上的默认选区几乎看不见（字本身就是透明的），所以自己定个底色，
  // 否则用户拖了半天不确定到底选上没有。
  ".kb-v13-reader-textlayer ::selection{background:rgba(0,150,255,.35);}",

  "/* 3.0 刀 9-A 桌面：一页一扇窗。 */",
  // 桌面是 `.kb-v13-reader-main` 这一行 flex 里的**第三个子项**（页区 / 右栏 / 桌面），
  // 不是绝对定位盖上去的一层。这样它天然只占页区那一块——右边那栏还在，
  // 底下的窗口夹取也就能按桌面自己的尺寸算（见 desk.js 的 spec.bounds）。
  ".kb-v13-reader-desk{display:none;flex:1;position:relative;overflow:hidden;}",
  ".kb-v13-reader-desk.on{display:block;}",
  // 桌面开着时把网格收起来。两套版式共用同一块地方，同时显示只会互相压。
  ".kb-v13-reader-sheets-off{display:none;}",
  ".kb-v13-desk-win{",
  "  position:absolute;display:flex;flex-direction:column;",
  "  background:var(--background-primary, rgba(6,12,22,.92));",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.22));border-radius:8px;",
  "  box-shadow:0 12px 32px var(--background-modifier-box-shadow, rgba(0,0,0,.45));overflow:hidden;",
  "}",
  ".kb-v13-desk-bar{",
  "  flex:0 0 auto;height:30px;display:flex;align-items:center;gap:8px;",
  "  padding:0 8px 0 10px;background:var(--background-secondary, rgba(10,22,40,.85));",
  "  border-bottom:1px solid var(--background-modifier-border, rgba(255,255,255,.06));",
  "  cursor:move;touch-action:none;user-select:none;",
  "}",
  ".kb-v13-desk-title{",
  "  flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  "  font-size:12px;color:var(--text-normal, rgba(190,220,250,.85));",
  "}",
  ".kb-v13-desk-meta{flex:0 0 auto;display:flex;align-items:center;gap:4px;font-size:11px;color:var(--text-muted, rgba(150,185,215,.55));}",
  ".kb-v13-desk-pagein{",
  "  width:44px;box-sizing:border-box;padding:2px 5px;border-radius:5px;font-size:11px;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.2));",
  "  background:var(--background-modifier-form-field, rgba(4,10,20,.75));",
  "  color:var(--text-normal, rgba(215,232,250,.9));",
  "  font-family:inherit;outline:none;text-align:center;",
  "}",
  ".kb-v13-desk-close{",
  "  flex:0 0 auto;cursor:pointer;border:0;background:none;padding:2px 4px;",
  "  color:var(--text-muted, rgba(150,185,215,.6));font-size:13px;line-height:1;",
  "}",
  ".kb-v13-desk-close:hover{color:var(--text-error, #f87171);}",
  // 内容盒：和网格里的页盒是同一套底（画布 + 文字层都挂进来），
  // 所以留白、居中、裁剪的规矩跟 `.kb-v13-reader-page` 保持一致。
  ".kb-v13-desk-page{",
  "  position:relative;flex:1 1 auto;overflow:hidden;",
  // 同 `.kb-v13-reader-page`：**不能写死白**，markdown 窗里的字色由宿主主题决定。
  "  background:var(--background-primary, rgba(255,255,255,.94));",
  "}",
  // ---- 两套排版，不是一个样式的两种写法（3.0 刀 9 第二版）----
  //
  // `-fixed`：PDF / 图片。一页就是一屏，画布跟着窗铺满，缩放靠 transform。
  ".kb-v13-desk-fixed{display:block;}",
  // `-flow`：卡片 / markdown。**要能滚**。从前这里跟 PDF 共用
  // `display:flex; align-items:center; overflow:hidden`，一张长一点的卡
  // 下半截直接被裁掉，而且没有任何提示——用户 09-17 报的「缺少垂直滚动条」。
  // `align-items:flex-start` 那一套也就跟着不需要了：块级流本来就从顶上排。
  ".kb-v13-desk-flow{display:block;overflow-y:auto;padding:10px 12px;}",
  ".kb-v13-desk-flow>*{max-width:100%;}",
  // `-embed`：结构窗（3.0 刀 9-D）。里面是一块**自绘的可平移世界**。
  // ⚠️ **不能有 padding**：相机算的是这个盒子的真实尺寸，多一圈 padding，
  // 世界原点就偏一圈——整片画面会跟着歪，而且歪得很小，看着像"没对齐"、
  // 不像 bug，查起来要绕远路。（同 app.js 里 canvas 那条「绝不能 overflow:hidden」，
  // 都是"布局参与了坐标计算"这一类。）
  ".kb-v13-desk-embed{display:block;overflow:hidden;padding:0;}",
  // 行号栏（3.0 刀 9 第二版）：markdown 文献窗里，每个块左边报出它起始那一行的
  // **文件行号**——对上顶栏那个行号区间。块与源文本行不是一一对应的（三行的段落
  // 渲染成一个 <p>），所以号码是「这一块从第几行开始」，见 reader.js 的
  // mountMarkdownRange。
  ".kb-v13-mdl{display:flex;gap:8px;align-items:flex-start;margin-bottom:4px;}",
  ".kb-v13-mdl-n{",
  "  flex:0 0 auto;width:2.2em;text-align:right;user-select:none;-webkit-user-select:none;",
  "  font:10px/2.1 ui-monospace,Consolas,monospace;color:var(--text-faint, rgba(150,185,215,.45));",
  // 等宽数字：不然 1 和 11 的宽度不一样，整列会参差不齐
  "  font-variant-numeric:tabular-nums;",
  "}",
  ".kb-v13-mdl-t{flex:1 1 auto;min-width:0;}",
  // 块里最后那个元素的底边距压掉，否则每个块底下都会多出一截空
  ".kb-v13-mdl-t>*:last-child{margin-bottom:0;}",
  // 页窗里那一层被缩放/平移的 stage（见 pagezoom.js）。画布与文字层都住在它里面，
  // 所以放大缩小时两层一起动，**划选照样可用**。
  ".kb-v13-desk-stage{",
  "  position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;",
  "}",
  // 页窗里的画布**铺满 stage**（不是 `max-width:100%` 那一条：那一条会留白）。
  // 窗是按这一页的形状锁着比例的（desk.js 的 clampRatioBox），所以铺满＝不变形。
  ".kb-v13-desk-stage .kb-v13-reader-canvas{width:100%;height:100%;max-width:none;max-height:none;}",
  ".kb-v13-desk-stage .kb-v13-reader-img{width:100%;height:100%;max-width:none;max-height:none;object-fit:contain;}",
  // 文字层的每个 span 是按**画那一次**的比例摆的绝对像素，窗一改尺寸就和画布分家。
  // `restretch()` 会给整层乘一个 scale（transform-origin 必须在左上，不然是绕着
  // 中心缩，越缩越偏）。
  ".kb-v13-desk-stage .kb-v13-reader-textlayer{transform-origin:0 0;}",
  // 推到边上之后才给「可以推」的光标提示（pagezoom.js 里 toggle）。
  ".kb-v13-desk-page.kb-v13-desk-pannable{cursor:grab;}",
  ".kb-v13-desk-page.kb-v13-desk-pannable:active{cursor:grabbing;}",

  // 卡片窗里就地改正文（3.0 刀 9 第二版）。进编辑态时盒子换成这一套排版：
  // 竖列、编辑框吃掉剩下的高度。
  ".kb-v13-desk-editing{display:flex;flex-direction:column;gap:6px;padding:8px;}",
  // 编辑区外面那圈壳（3.0 刀 9 第三版）。里面装的可能是宿主的**原生编辑器**
  // （Obsidian 的实时预览），也可能是核心自己的 textarea——两种都要把剩余高度
  // 吃满，所以这一层 `flex:1`，里面那层再 `height:100%`。
  ".kb-v13-editarea{flex:1 1 auto;min-height:0;display:flex;flex-direction:column;}",
  // 宿主编辑器的容器。它内部自带一整套样式（工作区那一套），我们只负责
  // **让它填满这块地方**，别的都别碰——它是宿主的组件，我们的样式一盖就打架。
  ".kb-v13-native-editor{flex:1 1 auto;min-height:0;overflow:hidden;border-radius:6px;}",
  // 原生编辑器没挂上时，**原因写在退回的那个输入框上面**（3.0 刀 9 第三版）。
  // 为什么要写到界面上：用户 09-18 报「还是输入框」时，我们这边唯一的线索在
  // 开发者控制台，而他不知道该去哪儿看——一句要人开开发者工具才能读到的话，
  // 等于没说。这一行是给**用它的人**看的，不是给排查的人看的。
  ".kb-v13-editor-note{",
  "  flex:0 0 auto;margin-bottom:4px;padding:3px 7px;border-radius:5px;font-size:10px;line-height:1.5;",
  "  color:var(--text-muted, rgba(160,185,215,.65));",
  "  background:var(--background-modifier-error, rgba(120,40,40,.18));",
  "}",
  ".kb-v13-native-editor .cm-editor{height:100%;}",
  ".kb-v13-native-editor .cm-scroller{overflow:auto;}",
  ".kb-v13-desk-editbody{",
  "  flex:1 1 auto;min-height:0;width:100%;box-sizing:border-box;resize:none;",
  "  padding:8px 9px;border-radius:6px;font-size:12px;line-height:1.7;font-family:inherit;outline:none;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.22));",
  // ⚠️ `!important` + 不透明底 + `color-scheme`：宿主主题会给 input/textarea 套
  // 表单皮肤，深色主题里这几个框会变成一大块白底（`editform.js` 那一处同样的坑）。
  "  background:var(--background-modifier-form-field, rgba(4,10,20,.9)) !important;",
  "  color:var(--text-normal, rgba(215,232,250,.92)) !important;",
  "  color-scheme:dark;",
  "}",
  ".kb-v13-desk-editbody::selection{background:rgba(0,150,255,.35);}",
  ".kb-v13-desk-editrow{flex:0 0 auto;display:flex;gap:6px;justify-content:flex-end;align-items:center;}",
  // 「回到第 __ 行」（3.0 刀 9 第三版）。绑文件的编辑器里是**整个文件**，
  // 顶栏那个区间只决定「打开时看哪一段」，用户临时想再看一眼第 200 行就靠这颗。
  // 它靠左站，与右边的「完成」分开——一个是导航、一个是收尾。
  ".kb-v13-desk-jump{display:flex;align-items:center;gap:4px;margin-right:auto;font-size:11px;color:var(--text-muted, rgba(150,185,215,.55));}",
  ".kb-v13-desk-jumplab{flex:0 0 auto;}",
  ".kb-v13-desk-editsave,.kb-v13-desk-editcancel{",
  "  cursor:pointer;padding:4px 12px;border-radius:6px;font-size:11px;font-family:inherit;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.3));",
  "  background:var(--interactive-normal, rgba(10,22,40,.7));",
  "  color:var(--text-normal, rgba(215,232,250,.9));",
  "}",
  ".kb-v13-desk-editsave{background:var(--interactive-accent, rgba(0,90,150,.45));}",
  // 标题栏那颗 ✎
  ".kb-v13-desk-edit{",
  "  flex:0 0 auto;cursor:pointer;border:0;background:none;padding:2px 4px;",
  "  color:var(--text-muted, rgba(150,185,215,.6));font-size:12px;line-height:1;",
  "}",
  ".kb-v13-desk-edit:hover{color:var(--text-accent, rgba(0,200,255,.9));}",
  // 卡片窗底下那一条状态 / 撤销。空的时候（`:empty`）不占位置——不是靠 display:none，
  // 那样 `:empty` 判断就没意义了。
  ".kb-v13-desk-status:empty{display:none;}",
  ".kb-v13-desk-status{",
  "  flex:0 0 auto;padding:5px 8px;font-size:11px;line-height:1.6;",
  "  color:var(--text-success, rgba(120,220,160,.85));",
  "  border-top:1px solid var(--background-modifier-border, rgba(255,255,255,.06));",
  "}",
  ".kb-v13-desk-status.kb-v13-desk-status-bad{color:var(--text-error, #f87171);}",
  ".kb-v13-desk-statusact{",
  "  margin-left:6px;cursor:pointer;padding:1px 7px;border-radius:5px;font-size:11px;font-family:inherit;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.3));",
  "  background:var(--interactive-normal, rgba(0,90,150,.3));",
  "  color:var(--text-normal, rgba(215,240,255,.9));",
  "}",
  // 右下角的抓手。18px 与 floatwin 的抓角同尺寸——再小就点不着了。
  //
  // ⚠️ `z-index` **必须有，而且要比文字层高**。抓手就长在页盒的右下角上，
  // 而刀 7 的文字层是 `z-index:1` 盖满页盒的——不给抓手一个更大的值，
  // 那个点上的 `elementFromPoint` 命中是文字层，于是**拖标题栏能动、拉角纹丝不动**
  // （两者走的是同一套代码，所以看着像「拉角坏了」）。
  // 故事线的拐点抓手为同一件事单独分过一层，见 `.kb-v13-shandles` 那段。
  ".kb-v13-desk-grip{",
  "  position:absolute;right:0;bottom:0;width:18px;height:18px;z-index:3;",
  "  cursor:nwse-resize;touch-action:none;",
  "  background:linear-gradient(135deg,transparent 50%,var(--text-accent, rgba(0,200,255,.35)) 50%);",
  "}",

  "/* 3.0 刀 9-B 卡片盒 */",
  // 浮窗宿主。**落在阅读器自己的层叠上下文里**——挂到默认的全息遮罩上的话，
  // 整扇窗会被阅读器盖住（见 reader.js 里 `#kb-reader-floats` 那段）。
  // 自己 `pointer-events:none`：它 `inset:0` 铺满阅读器，不收事件的话
  // 底下什么都点不着；窗自己再打开。
  ".kb-v13-reader-floats{position:absolute;inset:0;z-index:5;pointer-events:none;}",
  // 藏 `openFloat` 要搬的那个节点——引擎要求 unit 已经连在文档上。
  ".kb-v13-reader-hold{display:none;}",
  // 卡片盒那扇窗。**跟着主题走**（同 9-A4）：它是「卡片」的表面，
  // 该和宿主里的笔记长得像，而不是像晶体库那套自绘的深色。
  ".kb-v13-cardbox{",
  "  position:fixed;z-index:10050;display:flex;flex-direction:column;pointer-events:auto;",
  "  box-sizing:border-box;border-radius:10px;overflow:hidden;",
  "  background:var(--background-primary, rgba(6,12,22,.97));",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.2));",
  "  box-shadow:0 12px 32px var(--background-modifier-box-shadow, rgba(0,0,0,.5));",
  "  font-family:system-ui,sans-serif;color:var(--text-normal, rgba(215,232,250,.9));",
  "}",
  ".kb-v13-cardbox-bar{",
  "  flex:0 0 auto;display:flex;align-items:center;gap:10px;height:30px;padding:0 6px 0 12px;",
  "  background:var(--background-secondary, rgba(10,22,40,.85));",
  "  border-bottom:1px solid var(--background-modifier-border, rgba(0,200,255,.14));",
  "  cursor:grab;touch-action:none;user-select:none;-webkit-user-select:none;",
  "}",
  ".kb-v13-cardbox-bar:active{cursor:grabbing;}",
  ".kb-v13-cardbox-bartitle{flex:1;font-size:12px;font-weight:700;letter-spacing:.5px;color:var(--text-accent, rgba(0,200,255,.8));}",
  ".kb-v13-cardbox-close{",
  "  flex:0 0 auto;cursor:pointer;border:0;background:none;padding:2px 6px;",
  "  color:var(--text-muted, rgba(150,185,215,.6));font-size:13px;line-height:1;",
  "}",
  ".kb-v13-cardbox-close:hover{color:var(--text-error, #f87171);}",
  ".kb-v13-cardbox-body{flex:1;min-height:0;display:flex;overflow:hidden;}",
  ".kb-v13-cardbox-grip{",
  "  position:absolute;right:0;bottom:0;width:18px;height:18px;",
  "  cursor:nwse-resize;touch-action:none;",
  "  background:linear-gradient(135deg,transparent 50%,var(--text-accent, rgba(0,200,255,.35)) 50%);",
  "}",
  // 面板自己——它就是被 openFloat 搬进窗里的那个节点（原先停在 hold 里）。
  ".kb-v13-cardbox-panel{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px;padding:10px 12px;}",
  ".kb-v13-cardbox-hd{flex:0 0 auto;font-size:11px;letter-spacing:.5px;color:var(--text-muted, rgba(150,185,215,.55));}",
  ".kb-v13-cardbox-search{",
  "  flex:0 0 auto;width:100%;box-sizing:border-box;padding:6px 9px;border-radius:6px;font-size:12px;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.18));",
  "  background:var(--background-modifier-form-field, rgba(4,10,20,.75));",
  "  color:var(--text-normal, rgba(215,232,250,.9));font-family:inherit;outline:none;",
  "}",
  // 3.0 刀 9 第二版：里面装的换成了**首页那棵文件夹树**，所以不再是 flex 列
  // （树要块级流），滚动条还得在。
  ".kb-v13-cardbox-list{flex:1;min-height:0;overflow-y:auto;display:block;}",
  // 树里每一张卡右边那颗「留链」。它与卡片按钮**同一行**：两个都是 inline-block，
  // 卡片让出按钮的宽度（`calc(100% - 46px)`）。⛔ 别把这颗按钮塞进卡片按钮里面
  // ——按钮套按钮是非法结构，浏览器会把 DOM 拆开。
  ".kb-v13-cardbox-list .kb-v13-op-card{",
  "  display:inline-block;vertical-align:top;width:auto;max-width:calc(100% - 46px);",
  "}",
  ".kb-v13-cardbox-link{",
  "  display:inline-block;vertical-align:top;cursor:pointer;margin-left:4px;padding:5px 6px;",
  "  border:1px solid transparent;border-radius:6px;background:none;font:inherit;font-size:11px;",
  "  color:var(--text-muted, rgba(150,185,215,.6));",
  "}",
  ".kb-v13-cardbox-link:hover{",
  "  color:var(--text-accent, rgba(0,200,255,.9));",
  "  background:var(--background-modifier-hover, rgba(0,90,150,.25));",
  "  border-color:var(--text-accent, rgba(0,200,255,.3));",
  "}",
  ".kb-v13-cardbox-empty{font-size:12px;line-height:1.8;color:var(--text-faint, rgba(160,190,220,.5));padding:10px 2px;}",
  ".kb-v13-cardbox-msg{flex:0 0 auto;font-size:11px;line-height:1.7;color:var(--text-success, rgba(120,220,160,.85));}",
  ".kb-v13-cardbox-msg.kb-v13-cardbox-bad{color:var(--text-error, #f87171);}",
  ".kb-v13-cardbox-act{",
  "  margin-left:6px;cursor:pointer;padding:1px 7px;border-radius:5px;font-size:11px;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.3));",
  "  background:var(--interactive-normal, rgba(0,90,150,.3));",
  "  color:var(--text-normal, rgba(215,240,255,.9));font-family:inherit;",
  "}",

  "/* 空态 / 错误 / 正在打开 */",
  ".kb-v13-reader-note{",
  "  display:none;position:absolute;inset:0;align-items:center;justify-content:center;",
  "  padding:0 40px;text-align:center;font-size:13px;line-height:1.9;color:var(--text-muted, rgba(160,190,220,.55));",
  "}",
  ".kb-v13-reader-note-on{display:flex;}",

  "/* 右栏：边看边记 */",
  ".kb-v13-reader-side{",
  "  width:320px;flex:0 0 320px;display:flex;flex-direction:column;gap:10px;",
  "  padding:16px 18px;border-left:1px solid var(--background-modifier-border, rgba(255,255,255,.08));",
  "  background:var(--background-secondary, rgba(6,12,22,.6));overflow-y:auto;",
  "}",
  // 没选文献时整栏收起来：那时候「将建在：卡片根目录」是一句猜的话，
  // 而建卡按钮按下去只会报错——不如不摆。
  ".kb-v13-reader-side-off{display:none;}",
  ".kb-v13-reader-side-hd{font-size:13px;font-weight:700;letter-spacing:1px;color:var(--text-accent, rgba(0,200,255,.7));}",
  ".kb-v13-reader-field{display:flex;flex-direction:column;gap:4px;font-size:11px;color:var(--text-muted, rgba(150,185,215,.55));}",
  ".kb-v13-reader-field-body{flex:1;min-height:120px;}",
  ".kb-v13-reader-field input,.kb-v13-reader-field textarea,.kb-v13-reader-search{",
  "  width:100%;box-sizing:border-box;padding:7px 10px;border-radius:7px;font-size:13px;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.18));",
  "  background:var(--background-modifier-form-field, rgba(4,10,20,.75));",
  "  color:var(--text-normal, rgba(215,232,250,.9));",
  "  font-family:inherit;outline:none;resize:vertical;",
  "}",
  ".kb-v13-reader-field input:focus,.kb-v13-reader-field textarea:focus,.kb-v13-reader-search:focus{",
  "  border-color:var(--text-accent, rgba(0,200,255,.5));",
  "}",
  ".kb-v13-reader-field-body textarea{flex:1;min-height:110px;}",
  // 「将建在」那一行（3.0 刀 9 第二版）。从前这里是一句死文案 `.kb-v13-reader-hint`
  // （「将建在：文献/xxx/」），现在换成一个能点的按钮 + 一棵复用首页那套样式的树。
  ".kb-v13-reader-target{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--text-muted, rgba(150,185,215,.55));}",
  // 「在编辑器里写」那一档（3.0 刀 9 第三版）。两档互斥：填表单那一档有正文输入框
  // 和「存进晶体库」，宿主编辑器那一档换成编辑器本身加「写下一张」。
  // ⚠️ 切档只靠右栏上这一个类，所以两边的显隐都必须写在这儿——漏一条的表现是
  // 「两个都在」或者「两个都没有」，而用户只会看到一栏乱掉的界面。
  ".kb-v13-reader-nativebar{display:flex;gap:6px;align-items:center;}",
  ".kb-v13-reader-nativeopen{",
  "    cursor:pointer;padding:6px 10px;border-radius:7px;font-size:11px;font-family:inherit;",
  "    border:1px dashed var(--background-modifier-border, rgba(0,200,255,.28));",
  "    background:none;color:var(--text-muted, rgba(160,195,230,.8));",
  "  }",
  ".kb-v13-reader-nativeopen:hover{color:var(--text-normal, rgba(215,232,250,.9));border-color:var(--text-accent, rgba(0,200,255,.5));}",
  ".kb-v13-reader-nativeback{display:none;}",
  // 编辑器那一档：正文编辑器吃满右栏剩下的高度
  ".kb-v13-reader-nativehost{display:none;flex:1 1 auto;min-height:160px;}",
  ".kb-v13-reader-nativehost{display:none;flex:1 1 auto;min-height:160px;}",
  ".kb-v13-reader-native-on .kb-v13-reader-field-body{display:none;}",
  ".kb-v13-reader-native-on .kb-v13-reader-save{display:none;}",
  ".kb-v13-reader-native-on .kb-v13-reader-nativeopen{display:none;}",
  ".kb-v13-reader-native-on .kb-v13-reader-nativeback{display:inline-block;}",
  ".kb-v13-reader-native-on .kb-v13-reader-nativehost{display:flex;flex-direction:column;}",
  ".kb-v13-reader-target-lab{flex:0 0 auto;}",
  ".kb-v13-reader-target-pick{",
  "  flex:1 1 auto;min-width:0;cursor:pointer;text-align:left;padding:4px 8px;border-radius:6px;",
  "  font-size:11px;font-family:inherit;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.18));",
  "  background:var(--background-modifier-form-field, rgba(4,10,20,.75));",
  "  color:var(--text-normal, rgba(215,232,250,.9));",
  "}",
  ".kb-v13-reader-target-pick:hover{border-color:var(--text-accent, rgba(0,200,255,.5));}",
  // 挑文件夹的那一屏。压在右栏内容上（右栏本来就能滚），点开才出现。
  ".kb-v13-reader-folderpick{",
  "  display:none;flex-direction:column;gap:6px;padding:8px;border-radius:8px;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.22));",
  "  background:var(--background-secondary, rgba(6,12,22,.75));",
  "}",
  ".kb-v13-reader-folderpick.open{display:flex;}",
  ".kb-v13-reader-folderpick-hd{font-size:11px;letter-spacing:.5px;color:var(--text-accent, rgba(0,200,255,.7));}",
  ".kb-v13-reader-folderpick .kb-v13-op-body{max-height:280px;overflow-y:auto;}",
  // 搜索时把三角藏起来（结果一律摊开，点开三角那一步就多余了），并把组头往左
  // 挪回来补齐三角让出的那一截。`#kb-folders` 那一份写的是面板上的类，
  // 这两条管的是**装在别的容器里**的那两份（卡片盒、挑文件夹）。
  ".kb-v13-op-body.searching .kb-v13-op-toggle{display:none;}",
  ".kb-v13-op-body.searching .kb-v13-op-crystal{padding-left:8px;}",
  ".kb-v13-reader-folderpick-all{",
  "  display:block;width:100%;text-align:left;cursor:pointer;padding:5px 8px;border:0;border-radius:6px;",
  "  background:none;font:inherit;font-size:11px;color:var(--text-muted, rgba(150,185,215,.7));",
  "}",
  ".kb-v13-reader-folderpick-all:hover{background:var(--background-modifier-hover, rgba(90,150,230,.16));}",
  // 「新建晶体」那个方框（3.0 刀 9 第三版）。它在「存进晶体库」下面——
  // 用户 09-18 点名要的位置：读到一半想开一颗新晶体装接下来的卡。
  // 收起时只有一颗按钮，点开才长出输入框（免得平时占着右栏那点地方）。
  ".kb-v13-newcrystal{margin-top:2px;border-radius:8px;border:1px dashed var(--background-modifier-border, rgba(0,200,255,.24));}",
  ".kb-v13-newcrystal.open{border-style:solid;padding:8px;}",
  ".kb-v13-newcrystal-open{",
  "  display:block;width:100%;cursor:pointer;padding:7px 10px;border:0;border-radius:7px;",
  "  background:none;font:inherit;font-size:12px;text-align:left;",
  "  color:var(--text-muted, rgba(160,195,230,.75));",
  "}",
  ".kb-v13-newcrystal-open:hover{background:var(--background-modifier-hover, rgba(0,90,150,.18));color:var(--text-normal, rgba(215,232,250,.9));}",
  ".kb-v13-newcrystal.open .kb-v13-newcrystal-open{display:none;}",
  ".kb-v13-newcrystal-form{display:none;gap:6px;}",
  ".kb-v13-newcrystal.open .kb-v13-newcrystal-form{display:flex;flex-wrap:wrap;}",
  ".kb-v13-newcrystal-form input{",
  "  flex:1 1 100%;box-sizing:border-box;padding:6px 9px;border-radius:6px;font-size:12px;font-family:inherit;outline:none;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.18));",
  "  background:var(--background-modifier-form-field, rgba(4,10,20,.75));",
  "  color:var(--text-normal, rgba(215,232,250,.9));",
  "}",
  ".kb-v13-newcrystal-go,.kb-v13-newcrystal-cancel{",
  "  cursor:pointer;padding:4px 12px;border-radius:6px;font-size:11px;font-family:inherit;",
  "  border:1px solid var(--background-modifier-border, rgba(0,200,255,.3));",
  "  background:var(--interactive-normal, rgba(10,22,40,.7));",
  "  color:var(--text-normal, rgba(215,232,250,.9));",
  "}",
  ".kb-v13-newcrystal-go{background:var(--interactive-accent, rgba(0,90,150,.45));}",
  ".kb-v13-newcrystal-msg{font-size:11px;line-height:1.6;color:var(--text-success, rgba(120,220,160,.85));}",
  ".kb-v13-newcrystal-msg.kb-v13-newcrystal-bad{color:var(--text-error, #f87171);}",
  ".kb-v13-reader-save{",
  "  cursor:pointer;padding:9px 12px;border-radius:8px;font-size:13px;font-weight:600;",
  "  border:1px solid var(--interactive-accent, rgba(0,200,255,.3));",
  "  background:var(--interactive-accent, rgba(0,90,150,.35));",
  "  color:var(--text-on-accent, rgba(215,240,255,.92));",
  "}",
  ".kb-v13-reader-save:hover{background:var(--interactive-accent-hover, rgba(0,120,190,.45));}",
  ".kb-v13-reader-msg{font-size:11px;line-height:1.7;color:var(--text-success, rgba(120,220,160,.85));min-height:1.7em;}",
  ".kb-v13-reader-msg-bad{color:var(--text-error, #f87171);}",

  "/* 文档选择器。铺在页区上面——它是「换一份」的动作，换完就走 */",
  ".kb-v13-reader-picker{",
  "  display:none;position:absolute;inset:0;z-index:2;flex-direction:column;gap:12px;",
  "  padding:24px 32px;background:var(--background-primary, rgba(4,9,17,.96));",
  "}",
  ".kb-v13-reader-picker.open{display:flex;}",
  ".kb-v13-reader-search{max-width:420px;font-size:14px!important;padding:9px 12px!important;}",
  ".kb-v13-reader-doclist{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:2px;max-width:720px;}",
  ".kb-v13-reader-group{",
  "  font-size:11px;letter-spacing:1px;color:var(--text-accent, rgba(0,200,255,.5));",
  "  padding:12px 4px 4px;border-bottom:1px solid var(--background-modifier-border, rgba(255,255,255,.05));",
  "}",
  ".kb-v13-reader-doc{",
  "  display:flex;align-items:center;gap:10px;cursor:pointer;text-align:left;",
  "  padding:9px 10px;border-radius:7px;border:1px solid transparent;background:none;",
  "  color:var(--text-normal, rgba(210,228,248,.85));font-size:13px;font-family:inherit;",
  "}",
  ".kb-v13-reader-doc:hover{background:var(--background-modifier-hover, rgba(0,90,150,.25));border-color:var(--text-accent, rgba(0,200,255,.3));}",
  ".kb-v13-reader-docname{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}",
  ".kb-v13-reader-kind{",
  "  flex:0 0 auto;font-size:10px;font-weight:700;letter-spacing:.5px;",
  "  padding:2px 6px;border-radius:4px;border:1px solid currentColor;",
  "}",
  // 三种文献的类型标签。这几个颜色是**语义色**（红/黄/蓝各指一类），
  // 不是主题色，所以不跟主题走——浅色主题下它们照样看得清（都是中饱和度）。
  ".kb-v13-reader-kind-pdf{color:#e05252;}",
  ".kb-v13-reader-kind-image{color:#c08a1e;}",
  ".kb-v13-reader-kind-markdown{color:#3b82f6;}",
  ".kb-v13-reader-empty{font-size:13px;line-height:1.9;color:var(--text-muted, rgba(160,190,220,.5));padding:16px 4px;}",
];

// ===== 减弱动态效果 =====
// 库里原本全是无限循环动画（卡片波浪、粒子、轨道、扫描线），系统开了「减弱动态效果」
// 也照跑不误。这里尊重该设置：停掉环境性/无限动画，保留一次性反馈。
// 顺带让布局稳定，自动化测试才能点到卡片。
const REDUCED_MOTION = [
  "@media (prefers-reduced-motion: reduce){",
  "  .kb-v13-wave,.kb-v13-dot,.kb-v13-ripple,.kb-v13-orbit,.kb-v13-card-body,",
  "  .kb-v13-hologram::before,.kb-v13-hologram::after,.kb-v13-tooltip::after,",
  "  .kb-v13-sat-line,.kb-v13-cl-line,.kb-v13-bp,",
  // #11 悬浮窗：本来就只有开合那一下，这里连它一起停掉，开窗即最终位置
  "  .kb-v13-cfloat,.kb-v13-ifloat{animation:none!important;}",
  "  .kb-v13-crystal,.kb-v13-card,.kb-v13-satellite{transition:none!important;}",
  "  .kb-v13-card-body::after{transition:none!important;}",
  "  .kb-v13-cfloat-close,.kb-v13-ifloat-close,.kb-v13-cfloat-slot-btn,.kb-v13-ifloat-slot-btn,",
  "  .kb-v13-holo-body pre.kb-v13-cfloat-src,.kb-v13-holo-body .kb-v13-mathfence.kb-v13-cfloat-src,",
  "  .kb-v13-holo-body img.kb-v13-ifloat-src{transition:none!important;}",
  // #12/#13 的封条同理：本来只有 hover 那一点点颜色过渡，这里一并停掉
  "  .kb-v13-mask-cover{transition:none!important;}",
  // #9 顶栏模式按钮：同样只有 hover 那一点过渡
  "  .kb-v13-mode-btn,.kb-v13-ifloat-mode-btn{transition:none!important;}",
  "}",
];

export const CSS = BASE.concat(
  RESTORE,
  RENDER_HOST,
  CONCEPT_MASK,
  CRYSTAL_LINKS,
  CODEFLOAT,
  IMAGEFLOAT,
  MASKS,
  MODE,
  PANEL_DRAG,
  MULTILEVEL,
  CANVAS,
  READER,
  REDUCED_MOTION
).join("");
