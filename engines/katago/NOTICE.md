# 第三方组件与许可声明（Third-Party Notices）

本目录中的 GoT 代码为原创作品；`engines/katago/` 下的部分文件来自 [KataGo](https://github.com/lightvector/KataGo) 官方发布包，按其许可证要求在此声明。GoT 通过 GTP 协议以独立进程方式与 KataGo 通信，不包含、不修改其源代码或二进制。

## 1. KataGo 引擎与配置文件

`engines/katago/` 中的 `*.cfg`（含 `default_gtp.cfg`）与 `README.txt` 来自 KataGo 官方发布包（https://github.com/lightvector/KataGo/releases）。

KataGo 许可证（MIT）：

```
Copyright 2025 David J Wu ("lightvector") and/or other authors of the content in
the KataGo repository.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies
of the Software, and to permit persons to whom the Software is furnished to do
so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

完整许可文本见 https://github.com/lightvector/KataGo/blob/master/LICENSE
（其中列出的 `cpp/external/` 第三方库仅在自行编译 KataGo 时适用，与本目录的配置文件无关。）

## 2. KataGo 神经网络权重（*.bin.gz，本目录不附带、需自行下载）

从 https://katagotraining.org/networks/ 下载的 kata1 系列网络（如 `kata1-b18c384nbt`）适用
**KataGo Neural Network License**——同为 MIT 式许可（Copyright 2026 David J Wu），
条件同为在所有副本或实质性部分中保留上述版权与许可声明。

全文见 https://katagotraining.org/network_license/
（例外：最古老的 g170 系列网络为 CC0 公共领域；zhizi 系列网络由 ZhiziGo 以 MIT 式许可发布。）

## 3. cacert.pem

Mozilla CA 根证书束（数据来源 Mozilla，经 KataGo 发布包内的 `cpp/external/mozilla-cacerts`
分发），仅供 KataGo 自身联网功能使用；GoT 运行期不发起任何外网请求。

## 4. GoT 自身代码

除上述文件外，本目录其余全部内容（`js/`、`server.js`、`GoT.html`、`index.html`、
`styles.css`、`sw.js`、`tools/`、`tests/` 等）为 GoT 项目原创，按仓库根目录 `LICENSE`
（ISC）与 `package.json` 的声明分发。
