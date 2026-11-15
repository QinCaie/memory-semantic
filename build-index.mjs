// 给 meow-memory 的条目建本地语义索引（bge-small-zh，512 维，量化）
// 用法：node build-index.mjs        （增量：只算新增/更新过的条目）
import { pipeline, env } from '@huggingface/transformers'
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'

env.remoteHost = 'https://hf-mirror.com'
env.cacheDir = 'D:/Ayu/plugins/memory-semantic/models'

const MEM_DB = 'C:/Users/Administrator/Documents/deepseek-harness/default-workspace/.dsh-meow/memory.db'
const VEC_DB = 'D:/Ayu/plugins/memory-semantic/vec.db'
const LEVELS = ['fact', 'lesson', 'rules', 'topic', 'project']
const MAX_CHARS = 400

const mem = new DatabaseSync(MEM_DB, { readOnly: true })
const vec = new DatabaseSync(VEC_DB)
vec.exec(`CREATE TABLE IF NOT EXISTS vec (
  id TEXT PRIMARY KEY,
  level TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  dim INTEGER NOT NULL,
  vec BLOB NOT NULL
)`)

const known = new Map()
for (const r of vec.prepare('select id, updated_at from vec').all()) known.set(r.id, r.updated_at)

const todo = []
for (const level of LEVELS) {
  let rows = []
  try {
    rows = mem.prepare(`select id, content, keywords, updated_at from ${level} where status = 'active'`).all()
  } catch {
    continue
  }
  for (const r of rows) {
    if (known.get(r.id) === r.updated_at) continue
    const kw = String(r.keywords ?? '')
      .replace(/[[\]"',]/g, ' ')
      .trim()
    const text = (kw ? kw + '。' : '') + String(r.content ?? '').slice(0, MAX_CHARS)
    todo.push({ id: r.id, level, updated_at: r.updated_at, text })
  }
}

if (todo.length === 0) {
  console.log('没有新条目要算，索引已是最新（' + known.size + ' 条）')
  process.exit(0)
}

console.log('要算 ' + todo.length + ' 条…')
const embed = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', { dtype: 'q8' })
const ins = vec.prepare('insert or replace into vec (id, level, updated_at, dim, vec) values (?, ?, ?, ?, ?)')
const BATCH = 16
const t0 = Date.now()
for (let i = 0; i < todo.length; i += BATCH) {
  const batch = todo.slice(i, i + BATCH)
  const out = await embed(
    batch.map((x) => x.text),
    { pooling: 'mean', normalize: true },
  )
  const list = out.tolist()
  batch.forEach((row, j) => {
    const arr = Float32Array.from(list[j])
    ins.run(row.id, row.level, row.updated_at, arr.length, new Uint8Array(arr.buffer))
  })
  process.stdout.write(`\r${Math.min(i + BATCH, todo.length)}/${todo.length}`)
}
console.log('\n完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(1) + 's，库内共 ' + vec.prepare('select count(*) c from vec').get().c + ' 条')
