# memory-semantic

一个本地向量检索服务：把记忆写进 `vec.db`（SQLite + 向量），需要时按语义相似度捞回来。

> **状态：已停用。** 代码留着，服务不起。原因见下。

## 它做什么

| 文件 | 作用 |
| --- | --- |
| `build-index.mjs` | 把记忆条目编码成向量，写进库 |
| `serve.mjs` | 常驻服务，提供检索接口 |
| `recall.mjs` | 命令行查询：给一段话，返回最像的几条 |
| `probe.mjs` | 探活 |
| `start-if-down.mjs` | 起服务前先看端口占没占 |
| `vec.db` | 向量库本体（约 2.6 MB） |

## 为什么停用

2026-11-16 盘记忆那条线时发现：它和 fish（结构化记忆 + 检索）职责重叠，而 fish 才是主库。两个都在维护同一批内容，结果是「两边都有、两边都不全」。所以停掉这个，只留 fish。

停用不是删：目录移到 `_uninstalled`，要恢复移回来、把服务重新接上就行。

## 依赖

- Node ≥ 22（用 `node:sqlite`）
- 本地编码模型（ONNX）

## 原仓库

https://github.com/QinCaie/memory-semantic
