# GoT — 围棋工作台（v1.0）

专业围棋对弈 + AI 分析 + 复盘训练的**纯前端**工作台，参考 Sabaki（三栏布局、棋谱树）、Lizzie（胜率曲线、候选着标注、形势热力图）与 KaTrain（复盘训练）。

- 内置 **MCTS 引擎**：零依赖、开箱可玩（约 3600 playouts/s @ 9x9）
- 可选接入 **KataGo**（GTP）：本机 HTTP 桥接，自动探测，最强 AI
- 9 / 13 / 19 路对弈、SGF 4 完整支持、ownership 形势、中日韩规则点目
- AI 复盘：吻合度、平均损失、评级分布、失误导航、逐手质量、自动播放
- 隐私边界：只允许 localhost / 127.0.0.1 / ::1 本机桥接，无遥测、无外链资源

版本恒定为 **1.0**，缓存击穿与版本号解耦（Service Worker 全站网络优先 + 服务端 no-cache 头），改动文件刷新即生效。

---

## 一、运行方式（三选一）

| 方式 | 操作 | 说明 |
|---|---|---|
| 单文件版（推荐新手） | 双击 `GoT.html` | 全部资源内联，无需 Node，用内置 AI 对弈 |
| 本地服务 | 双击 `StartGoT.bat`（= `node server.js --open`） | 自动开浏览器；装好 KataGo 后自动连接 |
| 手动 | `node server.js` 后访问 `http://127.0.0.1:4173` | 也可 `--port 4174` 换端口 |

打开即是 19 路空棋盘，默认**你执黑**，对手为 AI（KataGo 在线自动用 KataGo，否则内置 MCTS）。想自选棋盘大小 / 规则 / 让子 / 执白，点顶栏「新对局」。

> 棋局内容不写入浏览器缓存，localStorage 只保存设置。留存棋谱请用顶栏「保存」下载 SGF 文件。

---

## 二、接入 KataGo（可选，推荐）

不装 KataGo 也能玩（内置 AI），装了以后分析、对弈、复盘全部自动切换到 KataGo。

### 1. 下载引擎（二选一，与本机系统匹配）

**Windows：**

1. 打开 <https://github.com/lightvector/KataGo/releases>
2. 找到 **v1.18.1**（或其他版本），下载 `katago-v1.18.1-opencl-windows-x64.zip`
3. 解压，得到 `katago.exe` 与若干 `.dll`

> OpenCL 版兼容性最好（支持所有显卡）；有 NVIDIA 显卡可下载 `eigen` 之外的 CUDA/TensorRT 版本，速度更快，放置方式完全相同。

**Linux：**

- 固定下载地址（与 `release-ubuntu/start.sh` 一致，已固化校验值）：
  `https://github.com/lightvector/KataGo/releases/download/v1.18.1/katago-v1.18.1-opencl-linux-x64.zip`
- SHA-256：`81ecea81526adb412a392ec728dbdf9627e754df7cf1a7a3dbb8ef220182184a`
- 官方包是 AppImage 结构，解压即得可执行的 `katago`；运行期需 `APPIMAGE_EXTRACT_AND_RUN=1` 环境变量（GoT 的 server.js 已自动设置）。

**macOS：** 下载对应的 `eigen` 版即可（慢但通用）。

### 2. 下载网络权重（模型，必下）

1. 打开 <https://katagotraining.org/networks/>
2. 选择 **kata1-b18c384nbt** 系列（本工作台自带配置按此校准），或任选更新的 kata1 强网
3. 下载得到 `xxx.bin.gz` 文件

### 3. 放置（关键！）

把引擎与模型放进本目录的 **`engines/katago/`**：

```text
engines/katago/
├─ katago.exe                        ← Windows 引擎（Linux 为 katago）
├─ libcrypto-3-x64.dll 等全部 .dll   ← Windows 解压所得，与 exe 同目录
├─ kata1-b18c384nbt.bin.gz           ← 网络权重（文件名任意，*.bin.gz 即可）
├─ default_gtp.cfg                   ← GTP 配置，本目录已提供 ✔
└─ ...（其余为 KataGo 官方配置示例，可选）
```

放置规则（server.js 自动探测）：

- 引擎可执行文件必须是 `engines/katago/katago.exe`（Windows）或 `engines/katago/katago`（Linux）
- 模型取该目录下**体积最大**的 `*.bin.gz` / `*.txt.gz`
- 配置取 `default_gtp.cfg`（目录里已附带，无需改动）

### 4. 校验完整性（建议）

```powershell
# PowerShell
Get-FileHash katago-v1.18.1-opencl-windows-x64.zip -Algorithm SHA256
```

```bash
# Linux / macOS
sha256sum katago-v1.18.1-opencl-linux-x64.zip
```

与官方 Release 页面公布的 SHA-256 比对一致后再解压。

### 5. 启动并验证

1. 双击 `StartGoT.bat`（或 `node server.js`）
2. 顶栏引擎徽章显示 `KataGo x.x.x` 即连接成功（首次启动 GPU 调优最长约 90 秒，耐心等待，页面会自动连上）
3. 也可在「引擎」对话框里手动填桥接地址后点「连接」

未安装 KataGo 或下载失败时，GoT 照常启动并使用内置 AI，**不会**卡死。

---

## 三、目录结构

```text
├─ GoT.html            单文件版（内联全部资源，双击即用）
├─ index.html          主界面（Node 服务方式使用）
├─ styles.css          设计体系（暗色+金）
├─ sw.js               Service Worker（网络优先 + 离线兜底）
├─ server.js           Node 一体化：静态服务 + GTP 桥（/health /gtp /analyze）
├─ ai_bridge.py        Python 版桥接（可选，功能同 server.js 的 GTP 部分）
├─ StartGoT.bat        Windows 一键启动
├─ js/                 goengine(规则) / ai-worker(MCTS) / gtp(客户端) / board(渲染) / app(控制器) / version
├─ engines/katago/     KataGo 配置与说明（二进制与模型请按上文自行放置）
├─ tests/              一致性检查 + goengine/ai/app/server/gtp 单元测试 + 手动 E2E
├─ tools/              构建脚本（build.js 生成单文件版）与 AppImage 打包
└─ VERSION             版本号（恒定 1.0）
```

## 四、开发

```bash
npm install            # 安装 jsdom 等测试依赖
npm test               # 一致性 + goengine 66 + ai 32 + app(jsdom) 51 + server 24 + gtp 4
node tools/build.js    # 重新生成单文件版 GoT.html
```

改动 `index.html` / `js/` / `styles.css` 后只需重新 `node tools/build.js`；代码更新通过 Service Worker 网络优先 + 服务端 no-cache 头自动生效，与版本号无关。若 Service Worker 行为异常，可用 URL 加 `?nosw` 注销，或在「关于 → 清除缓存并重载」一键清空。

涉及真实浏览器链路（SW / 引擎走子）时，建议再用 Edge/Chrome 做一次手动验证（`tests/test_e2e_edge.js`，需 `npm i --no-save playwright-core`）。

## 五、隐私与联网边界

- 页面运行期**零外网请求**：GTP 客户端发请求前只放行 localhost / 127.0.0.1 / ::1；Service Worker 对跨源 GET 直接返回 403
- 唯一的联网路径是你**主动**下载 KataGo 引擎与模型（本文第二节的官方地址）
- 无遥测、无广告、无在线资源、无更新检查

## 六、许可证

- **GoT 自身代码**：ISC（见根目录 `LICENSE`），可自由使用、修改与再分发。
- **KataGo**：MIT（不是 GPL）。本仓库 `engines/katago/` 里的 `*.cfg` 配置与 `README.txt` 取自 KataGo 官方发布包，按 MIT 要求随附其版权与许可声明，详见 **`engines/katago/NOTICE.md`**。
- **KataGo 神经网络权重**（kata1 系列）：同为 MIT 式的 KataGo Neural Network License，由用户自行下载，声明全文见 <https://katagotraining.org/network_license/>。
- 本项目通过 GTP 协议以独立进程与 KataGo 通信，不包含、不修改其源代码或二进制。

---

版本 1.0
