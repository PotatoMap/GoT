# GoT v1.0.1 · Ubuntu AppImage

这是 GoT 的单文件桌面版。AppImage 内置 GUI 渲染运行时、Node 本地服务、KataGo v1.18.1 OpenCL x64 和 b18 模型；双击即可打开独立窗口，不会启动系统浏览器，也不需要首次联网下载引擎。

```bash
chmod +x GoT-v1.0.1-ubuntu-x86_64.AppImage
./GoT-v1.0.1-ubuntu-x86_64.AppImage
```

应用只在 `127.0.0.1` 上启动本地服务。外部主机请求会被应用拒绝，内置 Chromium 的更新、同步、遥测和外部代理连接也已关闭。窗口会先打开，KataGo 首次运行在后台进行 OpenCL 调优（可能需要 10–90 秒）；调优数据在退出时随临时运行目录清理。

若系统没有 FUSE，可使用：

```bash
APPIMAGE_EXTRACT_AND_RUN=1 ./GoT-v1.0.1-ubuntu-x86_64.AppImage
```
