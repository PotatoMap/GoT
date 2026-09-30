# Browser KataGo assets

The browser worker bundle is built from [Web KaTrain](https://github.com/sir-teo/web-katrain),
an MIT-licensed TensorFlow.js KataGo implementation. The bundled `katago-small.bin.gz`
is the small `g170-b6c96` test network published by [lightvector/KataGo](https://github.com/lightvector/KataGo).

The model is intentionally small enough for static hosting and mobile browsers. It is
useful for interactive play and review, but it is substantially weaker than KataGo's
full b18/b20 networks. The three TensorFlow.js WASM files live in the sibling `tfjs/`
directory and are distributed under their upstream package license.

GoT also includes the official `kata1-b10c128-s1141046784-d204142634.txt.gz`
network for stronger browser play. It is 14.5 MB compressed and is loaded only
when selected. Its network weights are covered by the KataGo Neural Network
License; see `MODEL-LICENSE.txt` and the source link below.

Network source: https://katagotraining.org/networks/ (KataGo `kata1-b10c128`)
SHA-256: 3d8a24697ba25fe4da39af4c2b6bd405907b0ad8295322f5a550fa2d8fe4a2f4

Local patch: the upstream worker resolves its TensorFlow.js WASM files from the
absolute root path `/tfjs/`. GoT resolves them relative to the worker
(`new URL('../tfjs/', self.location.href)`) so the static site also works when hosted
under a subpath such as a GitHub Pages project site (`/GoT/`).
