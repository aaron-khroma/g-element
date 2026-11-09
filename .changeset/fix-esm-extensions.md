---
'@styleeyes/gelement': patch
---

Fix the published ES modules: relative imports now include the `.js` extension, so `import '@styleeyes/gelement'` works in Node and in bundlers that follow Node's rules (0.0.0's `dist/index.js` imported `./core` and failed to load).
