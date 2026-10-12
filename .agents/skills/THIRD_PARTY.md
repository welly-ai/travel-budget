# 第三方 skills

本檔記錄 `.agents/skills/` 內第三方 skill 的來源與授權；內容皆未修改。

## mattpocock/skills

- 來源 repo：git@github.com:mattpocock/skills.git
- commit：49dd158d1076134a641b33efb035946536778336
- 授權：MIT（全文如下）

| skill | 來源路徑 |
|---|---|
| grill-with-docs | skills/engineering/grill-with-docs |
| tdd | skills/engineering/tdd |
| diagnosing-bugs | skills/engineering/diagnosing-bugs |
| prototype | skills/engineering/prototype |
| teach | skills/productivity/teach |
| wait-what | skills/productivity/wait-what |
| handoff | skills/productivity/handoff |

`grilling`（skills/productivity/grilling）與 `domain-modeling`（skills/engineering/domain-modeling）是 `grill-with-docs` 的硬依賴，一併安裝。`tdd` 軟性參考的 `codebase-design` 未安裝。

### License（mattpocock/skills）

MIT License

Copyright (c) 2026 Matt Pocock

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## ayghri/i-have-adhd

- 來源 repo：git@github.com:ayghri/i-have-adhd.git
- commit：1ecea1993b7fce257ffbd686c070948b5e07eda6
- 授權：MIT（全文如下）
- 複製的 skill：`i-have-adhd`（來源路徑 skills/i-have-adhd，含 agents/）
- 未安裝該 repo 的 SessionStart always-on hook；回報原則改由 AGENTS.md 提供。
- frontmatter 含 `disable-model-invocation: true` 與 `metadata.tags`，照原樣保留。

### License（ayghri/i-have-adhd）

MIT License

Copyright (c) 2026 Ayoub Ghriss

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
