#!/usr/bin/env node
/**
 * 生成全市场A股股票列表
 * 策略：枚举所有可能的A股代码段，通过腾讯API批量查询，只保留有效股票
 * 生成文件：server/data/stock-list.json
 */
const path = require('path')
const fs = require('fs')
const http = require('http')

const OUTPUT = path.resolve(__dirname, 'stock-list.json')

// A股代码段
const RANGES = [
  // 上海主板: 600000-605999
  { start: 600000, end: 605999, prefix: 'sh' },
  // 上海科创板: 688000-688999
  { start: 688000, end: 688999, prefix: 'sh' },
  // 深圳主板: 000001-001999
  { start: 1, end: 1999, prefix: 'sz', pad: 6 },
  // 深圳中小板: 002000-002999
  { start: 2000, end: 2999, prefix: 'sz', pad: 6 },
  // 深圳创业板: 300000-301999
  { start: 300000, end: 301999, prefix: 'sz' },
  // 北京所: 920000-920999, 830000-832999
  { start: 920000, end: 920999, prefix: 'bj' },
  { start: 830000, end: 832999, prefix: 'bj' },
  // 北京所 870000-874999
  { start: 870000, end: 874999, prefix: 'bj' },
]

function padCode(n, len = 6) {
  return String(n).padStart(len, '0')
}

function generateAllCodes() {
  const codes = []
  for (const r of RANGES) {
    for (let i = r.start; i <= r.end; i++) {
      const code = padCode(i, r.pad || 6)
      codes.push({ code, tc: r.prefix + code })
    }
  }
  return codes
}

function fetchTencent(codes) {
  const url = `http://qt.gtimg.cn/q=${codes.join(',')}`
  return new Promise((resolve, reject) => {
    const req = http.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://gu.qq.com/' }
    }, (res) => {
      let d = Buffer.alloc(0)
      res.on('data', (c) => d = Buffer.concat([d, c]))
      res.on('end', () => {
        try {
          const decoder = new TextDecoder('gbk')
          const text = decoder.decode(d)
          resolve(text)
        } catch { resolve(d.toString('utf-8')) }
      })
    })
    req.on('error', reject)
    req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')) })
  })
}

function parseResult(text) {
  const stocks = []
  const lines = text.trim().split('\n')
  for (const line of lines) {
    const match = line.match(/v_(\w+)="(.*)"/)
    if (!match) continue
    const fields = match[2].split('~')
    const code = fields[2]
    const name = fields[1]
    if (code && name && !name.startsWith('?') && name !== '') {
      stocks.push({ code, name })
    }
  }
  return stocks
}

async function main() {
  console.log('正在生成A股代码...')
  const allCodes = generateAllCodes()
  console.log(`共 ${allCodes.length} 个可能的代码，开始批量查询...`)

  const BATCH = 500
  const allStocks = []
  
  for (let i = 0; i < allCodes.length; i += BATCH) {
    const batch = allCodes.slice(i, i + BATCH)
    const tcs = batch.map(b => b.tc)
    try {
      const text = await fetchTencent(tcs)
      const stocks = parseResult(text)
      allStocks.push(...stocks)
      process.stdout.write(`\r进度: ${i + batch.length}/${allCodes.length} 找到: ${allStocks.length} 只`)
    } catch (err) {
      process.stdout.write(`\r批次 ${i} 失败: ${err.message}，跳过`)
    }
    // 短暂延迟避免请求过快
    await new Promise(r => setTimeout(r, 100))
  }

  console.log('\n写入文件...')
  fs.writeFileSync(OUTPUT, JSON.stringify(allStocks, null, 2), 'utf-8')
  console.log(`完成！共 ${allStocks.length} 只股票，已写入 stock-list.json`)
}

main().catch(err => {
  console.error('错误:', err.message)
  process.exit(1)
})
