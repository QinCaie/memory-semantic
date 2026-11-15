// 语义召回兜底：给一句话，按意思从索引里捞最像的几条
// 用法：node recall.mjs "你要查的话" [条数]
import { pipeline, env } from '@huggingface/transformers'
import { DatabaseSync } from 'node:sqlite'

env.remoteHost = 'https://hf-mirror.com'
env.cacheDir = 'D:/Ayu/plugins/memory-semantic/models'

const MEM_DB = 'C:/Users/Administrator/Documents/deepseek-harness/default-workspace/.dsh-meow/memory.db'
const VEC_DB = 'D:/Ayu/plugins/memory-semantic/vec.db'

const q = process.argv[2] ?? ''
const k = Number(process.argv[3] ?? 5)
if (!q.trim()) {
  console.error('用法：node recall.mjs "要说的话" [条数]')
  process.exit(1)
}

const embed = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', { dtype: 'q8' })
const out = await embed([q], { pooling: 'mean', normalize: true })
const qv = Float32Array.from(out.tolist()[0])

const vec = new DatabaseSync(VEC_DB, { readOnly: true })
const mem = new DatabaseSync(MEM_DB, { readOnly: true })
const rows = vec.prepare('select id, level, vec from vec').all()

const scored = []
for (const r of rows) {
  const v = new Float32Array(r.vec.buffer, r.vec.byteOffset, r.vec.byteLength / 4)
  let dot = 0
  for (let i = 0; i < v.length; i++) dot += v[i] * qv[i]
  scored.push({ id: r.id, level: r.level, score: dot })
}
scored.sort((a, b) => b.score - a.score)

for (const s of scored.slice(0, k)) {
  let row = null
  try {
    row = mem.prepare(`select content, project from ${s.level} where id = ?`).get(s.id)
  } catch {
    row = null
  }
  const txt = String(row?.content ?? '（原文已不存在）').replace(/\s+/g, ' ').slice(0, 90)
  console.log(`${s.score.toFixed(3)}  [${s.level}/${row?.project ?? '?'}] ${s.id.slice(0, 12)}  ${txt}`)
}
