import { pipeline, env } from '@huggingface/transformers'

env.remoteHost = 'https://hf-mirror.com'
env.cacheDir = 'D:/Ayu/plugins/memory-semantic/models'
env.allowRemoteModels = true

const t0 = Date.now()
const embed = await pipeline('feature-extraction', 'Xenova/bge-small-zh-v1.5', { dtype: 'q8' })
console.log('模型加载', ((Date.now() - t0) / 1000).toFixed(1) + 's')

const out = await embed(['泡脚桶那次二十问', '老大昨晚问我还记不记得'], { pooling: 'mean', normalize: true })
console.log('维度', out.dims)
const a = out.tolist()[0]
const b = out.tolist()[1]
let dot = 0
for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
console.log('两句余弦', dot.toFixed(3))
