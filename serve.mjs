// 本地语义召回服务（bge-small-zh，512 维）：给一句话，按意思返回最像的条目 id
// 起：node serve.mjs   （默认 127.0.0.1:19871）
// POST /recall  {"text":"…","k":5,"minScore":0.42}  → {"hits":[{id,level,score}]}
// GET  /health → {"ok":true,"n":条目数}
import { pipeline, env } from '@huggingface/transformers'
import { DatabaseSync } from 'node:sqlite'
import { execFile } from 'node:child_process'
import http from 'node:http'

env.remoteHost = 'https://hf-mirror.com'
env.cacheDir = 'D:/Ayu/plugins/memory-semantic/models'

const VEC_DB = 'D:/Ayu/plugins/memory-semantic/vec.db'
const PORT = Number(process.env.MEM_SEM_PORT ?? 19871)
const HERE = 'D:/Ayu/plugins/memory-semantic'

// 索引装载：只读打开 vec.db，塞进内存（读一次就关，别占锁）
function loadIndex() {
  const v = new DatabaseSync(VEC_DB, { readOnly: true })
  const rows = v.prepare('select id, level, vec, updated_at from vec').all()
  const mark = v.prepare('select count(*) n, max(updated_at) m from vec').get()
  v.close()
  return {
    index: rows.map((r) => ({
      id: r.id,
      level: r.level,
      v: new Float32Array(r.vec.buffer, r.vec.byteOffset, r.vec.byteLength / 4),
    })),
    mark: `${mark.n}/${mark.m}`,
  }
}

let { index, mark } = loadIndex()

// 增量同步：记忆库一有新写入就补进索引，不用手动跑 build-index
function syncIndex() {
  execFile(process.execPath, [`${HERE}/build-index.mjs`], { cwd: HERE, windowsHide: true, timeout: 120000 }, (err) => {
    if (err) return console.error('[mem-sem] 增量失败', String(err.message ?? err).slice(0, 120))
    const next = loadIndex()
    if (next.mark !== mark) {
      index = next.index
      mark = next.mark
      console.log(`[mem-sem] 已同步 · ${index.length} 条`)
    }
  })
}
setInterval(syncIndex, Number(process.env.MEM_SEM_SYNC_MS ?? 5 * 60 * 1000))

const embed = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', { dtype: 'q8' })
console.log(`[mem-sem] ready · ${index.length} 条 · :${PORT}`)

const server = http.createServer(async (req, res) => {
  const send = (code, obj) => {
    const body = JSON.stringify(obj)
    res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' })
    res.end(body)
  }
  if (req.method === 'GET' && req.url.startsWith('/health')) return send(200, { ok: true, n: index.length })
  if (req.method !== 'POST' || !req.url.startsWith('/recall')) return send(404, { error: 'not found' })

  let raw = ''
  for await (const chunk of req) raw += chunk
  let payload = {}
  try {
    payload = JSON.parse(raw || '{}')
  } catch {
    return send(400, { error: 'bad json' })
  }
  const text = String(payload.text ?? '').trim()
  const k = Math.max(1, Math.min(20, Number(payload.k ?? 5)))
  const minScore = Number(payload.minScore ?? 0.42)
  if (!text) return send(200, { hits: [] })

  try {
    const out = await embed([text], { pooling: 'mean', normalize: true })
    const qv = Float32Array.from(out.tolist()[0])
    const hits = []
    for (const r of index) {
      let dot = 0
      for (let i = 0; i < r.v.length; i++) dot += r.v[i] * qv[i]
      if (dot >= minScore) hits.push({ id: r.id, level: r.level, score: Number(dot.toFixed(4)) })
    }
    hits.sort((a, b) => b.score - a.score)
    return send(200, { hits: hits.slice(0, k) })
  } catch (e) {
    return send(500, { error: String(e?.message ?? e) })
  }
})

server.listen(PORT, '127.0.0.1')
