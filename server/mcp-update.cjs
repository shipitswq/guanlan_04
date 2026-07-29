#!/usr/bin/env node
/**
 * 观澜 - 全市场机构持仓更新脚本（使用 MCP 客户端）
 * 可在 Express 后端通过 child_process 调用
 * 
 * 使用: node server/mcp-update.cjs
 * 返回: JSON { ok: true/false, message: "...", total: N }
 */

const path = require('path')
const { MCPClient } = require('./mcp-client.cjs')

const DB_PATH = path.resolve(__dirname, 'data', 'holdings-db.json')

// ============ 机构类型配置 ============
const QUERIES = [
  { query: '北向资金重仓', type: 'north', name: '北向资金重仓' },
  { query: '证金汇金持股', type: 'zhj', name: '证金汇金持股' },
  { query: '大基金持股', type: 'big_fund', name: '国家集成电路产业投资基金持股' },
  { query: '社保重仓', type: 'social_security', name: '社保重仓' },
  { query: '保险重仓', type: 'insurance', name: '保险重仓' },
  { query: 'QFII重仓', type: 'qfii', name: 'QFII重仓' },
  { query: '券商重仓', type: 'broker', name: '券商重仓' },
]

async function main() {
  console.log('初始化 MCP 客户端...')
  
  const cfg = JSON.parse(process.env.CODEBUDDY_MCP_CONFIG)
  const proxy = cfg.mcpServers['connector-proxy']
  const token = proxy.headers.Authorization.replace('Bearer ', '')
  const sessionId = proxy.headers['X-WorkBuddy-Session-Id']

  const client = new MCPClient(proxy.url, token, sessionId)
  
  try {
    await client.initialize()
    console.log('MCP 初始化成功')
  } catch (e) {
    console.log('MCP 初始化失败（可能已初始化）:', e.message.slice(0, 100))
    client.initialized = true // 强制继续
  }

  // 读取现有数据
  let existingRecords = []
  try {
    existingRecords = JSON.parse(require('fs').readFileSync(DB_PATH, 'utf-8'))
  } catch (e) { /* 文件不存在 */ }

  // 保留有详细数据的旧记录（含shares/ratio）
  const detailedRecords = existingRecords.filter(r => r.shares > 0 || r.market_value > 0)

  const newRecords = []
  const today = new Date().toISOString().slice(0, 10)

  for (const q of QUERIES) {
    try {
      console.log(`查询: ${q.query}...`)
      const result = await client.callTool('tdx_screener', {
        message: q.query,
        rang: 'AG',
        pageSize: 5000,
      })

      // 从 result content 中解析股票代码
      let stocks = []
      if (result?.content) {
        for (const c of result.content) {
          if (c.text) {
            // 从 JSON 中提取 sec_code
            const jsonMatch = c.text.match(/"data":\s*\[[\s\S]*?\]/)
            if (jsonMatch) {
              try {
                const data = JSON.parse('{"data":' + jsonMatch[0] + '}')
                for (const item of data.data) {
                  if (item.sec_code) {
                    stocks.push({ code: item.sec_code, name: item.sec_name || '' })
                  }
                }
              } catch(e) { /* 跳过解析失败 */ }
            }
            // 备用：从表格文本中提取 sec_code
            if (stocks.length === 0) {
              const matches = c.text.match(/(\d{6})/g)
              if (matches) {
                stocks = [...new Set(matches)].map(c => ({ code: c, name: '' }))
              }
            }
          }
        }
      }

      console.log(`  -> 找到 ${stocks.length} 只 ${q.type}`)

      // 生成记录
      for (const s of stocks) {
        newRecords.push({
          stock_code: s.code,
          report_date: today,
          holder_type: q.type,
          holder_name: q.name,
          shares: 0,
          ratio: 0,
          market_value: 0,
        })
      }
    } catch (e) {
      console.log(`  -> 查询失败: ${e.message.slice(0, 100)}`)
    }
  }

  // 合并：保留详细记录，覆盖标签记录
  const finalRecords = [...detailedRecords]
  for (const newRec of newRecords) {
    const exists = finalRecords.find(
      r => r.stock_code === newRec.stock_code && r.holder_type === newRec.holder_type
    )
    if (!exists) {
      finalRecords.push(newRec)
    }
  }

  // 写入
  require('fs').writeFileSync(DB_PATH, JSON.stringify(finalRecords, null, 2), 'utf-8')

  // 按类型统计
  const stats = {}
  for (const r of finalRecords) {
    stats[r.holder_type] = (stats[r.holder_type] || 0) + 1
  }

  const result = {
    ok: true,
    message: Object.entries(stats).map(([k, v]) => `${k}:${v}`).join(', '),
    total: finalRecords.length,
    newRecords: newRecords.length,
    detailed: detailedRecords.length,
  }

  console.log(JSON.stringify(result))
  return result
}

// 直接运行时执行
main().catch(e => {
  console.error(JSON.stringify({ ok: false, message: e.message }))
  process.exit(1)
})
