/* version.config.json 是版本单一来源；js/version.js 由 tools/sync-version.cjs 生成，
 * sw.js（缓存名/离线预缓存）与 app.js（关于页/控制台）从这里读取当前构建版本。
 * 版本号：1.1 为死活题与工作区升级；1.2 为专用分析协议、损目复盘与主题/进度细化；
 * 1.3 为棋力（真实强度阶梯 + 低档随机选点）与对局计时；1.4 为深度复盘与重点训练；
 * 1.5 为独立学习工作区、个人资料、教程、个性化题目与学习棋谱目录；
 * 2.2 为浏览器 KataGo b6、移动端确认落子、逐手学习辅助与复盘再练衔接。
 * 2.3 为 Editing & Publishing：棋题编创、章节讲义与独立离线发布。
 * 2.4 为全平台信息架构：四主分区（首页/对弈/学习/棋谱）、合并棋盘工具栏、
 *     可折叠侧面板、棋谱历史记录与 GoT Tutor 预留。
 * 2.5.3 为老师等待阶段、超时与供应商错误提示细化。
 * 2.6.0 为沉浸式 2.5D 棋盘、榧木深色材质、真实落子表现及 2D 棋子柔和高光。
 * 2.6.1 为老师课堂记录清理、隐私说明、模型连接状态区分与温和请求限流。
 * 2.6.2 为启动时固定使用 2D 棋盘，并延后初始化 2.5D 与大型本地引擎资源。
 * 2.6.3 为齿轮设置图标与恢复棋局后直接续弈。
 * 2.6.4 为更新提示与手动刷新、发布文件一致性修复。
 * 2.6.5 为 PWA 安装提示与离线安装资源完善。
 * 2.6.7 为说明页面精简、指南结构调整与隐私条款说明整理。
 * 2.6.8 为棋子自然落点、随机木盘音色、柔和室内灯光与高清棋盘导出。
 * 2.6.9 同步 2.5D 棋盘材质与棋子模型，并增加视角、棋盘格范围与立体预览设置。
 * 2.6.10 统一点目与形势方块；AI 估算完成后显示点目标记，并修正 2.5D 透视覆盖层的坐标映射。
 * 2.5.2 为 AI 老师课堂隔离与死活题判题边界修复。
 * 2.5.1 为棋盘课堂：气与提子课程、基础死活题教学、教师工具与学习记忆。
 * 缓存击穿不再依赖版本号——SW 全站网络优先 + server.js 的 no-cache 响应头已保证
 * 改完文件刷新即生效；index.html 的 ?v=a2.7.8 只是非 SW 场景的兜底。 */
/* a2.7.8 hardens SGF bounds, lesson snapshots, teacher-key storage and offline 3D packaging. */
/* Channel and release mapping are generated from version.config.json. */
/* BEGIN GENERATED VERSION CONFIG */
self.GOT_VERSION = 'v1.0.0';
self.GOT_VERSION_CHANNEL = 'release';
self.GOT_ALPHA_VERSION = 'a2.7.8';
self.GOT_RELEASE_VERSION = 'v1.0.0';
self.GOT_RELEASE_BASE_VERSION = 'a2.7.8';
self.GOT_RELEASE_COMMIT = null;
/* END GENERATED VERSION CONFIG */
