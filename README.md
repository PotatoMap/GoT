# GoT — 围棋工作台（v2.0）

专业围棋对弈 · AI 分析 · 复盘训练，纯前端 + 可选本机 KataGo 桥接。界面参考 Sabaki（棋谱树、布局）、Lizzie / KaTrain（胜率曲线、候选着标注、形势热力图）。

## 功能亮点

- **内置 MCTS 引擎**：零依赖、开箱即玩；含 19 路开局库与跨手搜索树复用
- **可选接入 KataGo**（GTP，本机 HTTP 桥接，自动探测）：分析、对弈、复盘、点目自动优先使用
- 9 / 13 / 19 路对弈，中国 / 日本 / 韩国规则，让子，双人模式
- 计时：主时间、读秒（byo-yomi）、费舍尔
- SGF 4 完整支持：导入导出、分支棋谱树、注释与标记
- **分析**：候选着、胜率、目差、ownership 形势热力图、PV 主变化点击推演、逐手质量
- **AI 复盘**：吻合度、平均损失、失误导航、重点训练、自动播放、再练一手
- **AI 点目**：中日韩规则，AI 逐点判定全盘归属并标注公气/未定
- **死活题**：1909 道公有领域古典死活题，段位筛选，答错四级提示
- **学习工作区**：12 课教程、个性化题目推荐、训练估计段位、名局棋谱目录
- 中英双语、paper / 暗色主题、响应式、PWA 离线
- **隐私**：仅允许本机回环桥接（localhost / 127.0.0.1 / ::1），无遥测、无外链资源

## 一、运行方式（三选一）

| 方式 | 操作 | 说明 |
|---|---|---|
| 单文件版（推荐新手） | 双击 `GoT.html` | 全部资源内联，无需 Node，用内置 AI 对弈 |
| 本地服务 | 双击 `StartGoT.bat`（= `node server.js --open`） | 自动开浏览器；装好 KataGo 后自动连接 |
| 手动 | `node server.js` 后访问 `http://127.0.0.1:4173` | 也可 `--port 4174` 换端口 |

打开即是 19 路空棋盘，默认**你执黑**，对手为 AI（KataGo 在线自动用 KataGo，否则内置 MCTS）。想自选棋盘大小 / 规则 / 让子 / 执白，点「新对局」。

> 棋局内容不写入浏览器缓存，localStorage 只保存设置与学习进度。留存棋谱请用「保存」下载 SGF 文件。

## 二、接入 KataGo（可选，推荐）

不装 KataGo 也能玩（内置 AI）；装了以后分析、对弈、复盘、点目全部自动切换到 KataGo。

### 1. 下载引擎

从官方 Releases <https://github.com/lightvector/KataGo/releases> 下载与系统匹配的 **v1.18.1 opencl** 版：

- Windows：`katago-v1.18.1-opencl-windows-x64.zip`（解压得 `katago.exe` 与若干 `.dll`）
- Linux：`katago-v1.18.1-opencl-linux-x64.zip`（解压得可执行 `katago`）
- macOS：下载 `eigen` 版即可（慢但通用）

> OpenCL 版兼容性最好（支持所有显卡）；NVIDIA 显卡可选用 CUDA / TensorRT 版，速度更快，放置方式相同。

### 2. 下载网络权重（模型，必下）

1. 打开 <https://katagotraining.org/networks/>
2. 选择 **kata1-b18c384nbt** 系列（本工作台配置按此校准），或任选更新的 kata1 强网
3. 下载得到 `xxx.bin.gz`

### 3. 放置到 `engines/katago/`

```text
engines/katago/
├─ katago.exe                        ← Windows 引擎（Linux 为 katago）
├─ libcrypto-3-x64.dll 等全部 .dll   ← Windows 解压所得，与 exe 同目录
├─ kata1-b18c384nbt.bin.gz           ← 网络权重（文件名任意，*.bin.gz 即可）
├─ default_gtp.cfg                   ← GTP 配置，本目录已提供 ✔
└─ ...（其余为 KataGo 官方配置示例，可选）
```

`server.js` 自动探测规则：引擎必须是 `engines/katago/katago.exe`（Linux 为 `katago`）；模型取该目录下体积最大的 `*.bin.gz` / `*.txt.gz`；配置取 `default_gtp.cfg`。

### 4. 启动并验证

1. 双击 `StartGoT.bat`（或 `node server.js`）
2. 顶栏引擎徽章显示 `KataGo x.x.x` 即连接成功（首次启动 GPU 调优最长约 90 秒，页面会自动连上）
3. 也可在「引擎」对话框手动填桥接地址后点「连接」

未安装 KataGo 或下载失败时，GoT 照常启动并使用内置 AI，**不会**卡死。

## 三、目录结构

```text
├─ GoT.html            单文件版（内联全部资源，双击即用）
├─ index.html          主界面（Node 服务方式使用）
├─ styles.css          设计体系（paper + 暗色）
├─ sw.js               Service Worker（网络优先 + 离线兜底）
├─ server.js           Node 一体化：静态服务 + GTP 桥（/health /gtp /analyze）
├─ analysis-engine.js  KataGo JSON 分析引擎接入（server.js 使用）
├─ analysis.cfg        KataGo 分析配置
├─ ai_bridge.py        Python 版桥接（可选）
├─ StartGoT.bat        Windows 一键启动
├─ js/                 规则引擎 / 内置 MCTS / GTP 客户端 / 棋盘渲染 / 控制器 / 学习与成长
├─ problems/           古典死活题库（problems.js 运行时；classic/ + problems.json 为数据源）
├─ records/            名局资料（famous-games.js 运行时；famous/ 为 SGF 源）
├─ engines/katago/     KataGo 配置与说明（引擎与模型请按上文自行放置）
├─ LICENSE
└─ VERSION
```

## 四、数据与来源

- **死活题 1909 道**：全部取自版权已失效的公有领域古典棋谱（玄玄棋经、官子谱、碁经众妙），来源为 u-go.net / Flygo 的公开整理。
- **名局**：119 局历史与 AI 时代名局（另含学习课程 13 局），来源为 CWI / A. E. Brouwer 公有领域棋谱档案，每条记录均保留来源链接；仅收录对局信息与实战主线。

## 五、隐私与联网边界

- 页面运行期**零外网请求**：GTP 客户端发请求前只放行 localhost / 127.0.0.1 / ::1；Service Worker 对跨源 GET 直接返回 403
- 唯一的联网路径是你**主动**下载 KataGo 引擎与模型（上文第二节的官方地址）
- 无遥测、无广告、无在线资源、无更新检查

## 六、许可证

- **GoT 自身代码**：ISC（见 `LICENSE`），可自由使用、修改与再分发。
- **KataGo**：MIT。`engines/katago/` 内的 `*.cfg` 配置与说明取自 KataGo 官方发布包，按其 MIT 要求随附声明，详见 `engines/katago/NOTICE.md`。
- **KataGo 神经网络权重**：由用户自行下载，适用其网络许可，声明见 <https://katagotraining.org/network_license/>。
- 本项目通过 GTP 协议以独立进程与 KataGo 通信，不包含、不修改其源代码或二进制。
