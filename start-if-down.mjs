// 本地语义召回服务的自启入口：19871 没在听就拉起来（node start-if-down.mjs）
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const PORT = 19871
const here = dirname(fileURLToPath(import.meta.url))

const alive = await new Promise((resolve) => {
  const s = net.connect({ port: PORT, host: '127.0.0.1' })
  s.setTimeout(800)
  s.on('connect', () => {
    s.destroy()
    resolve(true)
  })
  s.on('error', () => resolve(false))
  s.on('timeout', () => {
    s.destroy()
    resolve(false)
  })
})

if (alive) {
  console.log('already up on ' + PORT)
  process.exit(0)
}

const child = spawn(process.execPath, [join(here, 'serve.mjs')], {
  cwd: here,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
})
child.unref()
console.log('spawned pid ' + child.pid)
