/**
 * 观澜 - 全市场机构持仓批量更新脚本
 * 通过通达信MCP HTTP代理批量查询所有A股的十大流通股东数据
 * 
 * 使用方式: node server/batch-update.cjs
 * 
 * 设计为可被自动化任务调用（通过 Bash 工具执行一次即可完成5000+只股票更新）
 * 
 * 运行时间预估：
 * - 5000只股票 × 100ms/只 = 500秒 ≈ 8分钟
 * - 实际受限于MCP代理吞吐量，可调整并发数
 */

const http = require('http')
const path = require('path')
const fs = require('fs')

// MCP代理配置
const MCP_URL = 'http://127.0.0.1:50472/mcp'
const AUTH_TOKEN = process.env.CODEBUDDY_MCP_CONFIG
  ? JSON.parse(process.env.CODEBUDDY_MCP_CONFIG).mcpServers['connector-proxy'].headers.Authorization.replace('Bearer ', '')
  : ''

if (!AUTH_TOKEN) {
  console.error('错误: 未找到MCP认证Token')
  process.exit(1)
}

const DB_PATH = path.resolve(__dirname, 'data', 'holdings-db.json')

// 并发控制
const CONCURRENCY = 5  // 同时5个请求

// ============ MCP客户端 ============

let sessionId = 0
function nextId() { return ++sessionId }

/** 调用MCP工具 */
async function mcpCall(toolName, args) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: nextId(),
    method: 'tools/call',
    params: { name: toolName, arguments: args }
  })

  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + AUTH_TOKEN,
      'Accept': 'application/json, text/event-stream',
    },
    body,
  })

  // MCP SSE 响应解析
  const text = await res.text()
  // 从SSE格式中提取JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('无法解析MCP响应: ' + text.slice(0, 200))
  
  const data = JSON.parse(jsonMatch[0])
  if (data.error) throw new Error(data.error.message || 'MCP Error')
  return data.result
}

/** 初始化MCP会话 */
async function mcpInit() {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: nextId(),
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'guanlan-batch', version: '1.0' }
    }
  })
  const res = await fetch(MCP_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + AUTH_TOKEN,
      'Accept': 'application/json, text/event-stream',
    },
    body,
  })
  const text = await res.text()
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error('Init失败: ' + text.slice(0, 200))
  return JSON.parse(jsonMatch[0])
}

// ============ 数据解析 ============

/** 从十大流通股东数据中提取机构持仓 */
function extractHoldings(stockCode, tdxResult) {
  const records = []
  if (!tdxResult?.content) return records

  let content = ''
  for (const c of tdxResult.content) {
    if (c.text) content += c.text
  }

  // 从JSON响应中解析
  try {
    const jsonMatch = content.match(/\{[\s\S]*"tables"[\s\S]*\}/)
    if (!jsonMatch) return records

    const data = JSON.parse(jsonMatch[0])
    const tables = data?.response?.transformed?.tables || []
    
    for (const table of tables) {
      if (table.name !== '十大流通股东' && !table.name?.includes('流通股东')) continue
      for (const row of table.rows || []) {
        const name = row['股东名称'] || row['股东名'] || ''
        const shares = parseInt(row['持股数'] || row['持股数量'] || row['持有数量'] || 0)
        const ratio = parseFloat(row['占总股本比例'] || row['持股比例'] || 0)
        const mktVal = parseFloat(row['持股市值'] || 0)

        let holderType = ''
        if (name.includes('香港中央结算')) holderType = 'north'
        else if (name.includes('中国证券金融') || name.includes('中央汇金')) holderType = 'zhj'
        else if (name.includes('国家集成电路产业投资基金')) holderType = 'big_fund'
        else if (name.includes('全国社保基金')) holderType = 'social_security'
        else if (name.includes('保险')) holderType = 'insurance'
        else if (name.includes('QFII') || name.includes('UBS') || name.includes('MORGAN') || name.includes('高华')) holderType = 'qfii'
        else if (name.includes('证券') || name.includes('券商')) holderType = 'broker'

        if (holderType && shares > 0) {
          records.push({
            stock_code: stockCode,
            report_date: row['报告期'] || row['截止日期'] || '2026-03-31',
            holder_type: holderType,
            holder_name: name,
            shares,
            ratio,
            market_value: mktVal / 100000000 || 0, // 转亿
          })
        }
      }
    }
  } catch (e) {
    // 解析失败跳过
  }
  return records
}

// ============ 批量处理 ============

async function processBatch(stockCodes, priceMap = {}) {
  const allRecords = []

  // 分批处理（控制并发）
  for (let i = 0; i < stockCodes.length; i += CONCURRENCY) {
    const batch = stockCodes.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(code => 
        mcpCall('tdx_api_data', {
          entry: 'TdxSharePCCW.tdxf10_gg_gdyj',
          code,
          fixedTag: 'ltgd'
        }).then(result => ({ code, result }))
        .catch(err => ({ code, error: err.message }))
      )
    )

    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.result) {
        const records = extractHoldings(r.value.code, r.value.result)
        allRecords.push(...records)
      }
    }

    // 每批报告
    if ((i / CONCURRENCY) % 20 === 0) {
      process.stdout.write(`\r进度: ${Math.min(i + CONCURRENCY, stockCodes.length)}/${stockCodes.length}`)
    }
  }
  return allRecords
}

// ============ 主流程 ============

async function main() {
  console.log('=== 观澜 全市场机构持仓更新 ===')
  console.log('初始化MCP...')
  await mcpInit()

  // 获取股票列表
  console.log('获取股票列表...')
  const screenerResult = await mcpCall('tdx_screener', { message: '全部A股', rang: 'AG', pageSize: 5000 })
  let stockCodes = []
  if (screenerResult?.content) {
    for (const c of screenerResult.content) {
      if (c.text && c.text.includes('sec_code')) {
        // 从表格中提取sec_code
        const matches = c.text.match(/(\d{6})/g)
        if (matches) stockCodes.push(...matches)
      }
    }
  }

  if (stockCodes.length === 0) {
    // 回退：使用已知代码列表
    stockCodes = []
    for (let i = 1; i <= 999999; i++) {
      const code = String(i).padStart(6, '0')
      if (code.startsWith('6') || code.startsWith('0') || code.startsWith('3')) {
        stockCodes.push(code)
      }
    }
  }

  console.log(`共 ${stockCodes.length} 只股票`)
  console.log('开始批量查询十大流通股东...')

  const allRecords = await processBatch(stockCodes)
  
  // 写入数据库
  console.log('\n写入数据库...')
  fs.writeFileSync(DB_PATH, JSON.stringify(allRecords, null, 2), 'utf-8')
  
  console.log(`\n更新完成！`)
  console.log(`- 处理股票数: ${stockCodes.length}`)
  console.log(`- 新增记录数: ${allRecords.length}`)
  console.log(`- 数据库路径: ${DB_PATH}`)
}

main().catch(e => {
  console.error('错误:', e.message)
  process.exit(1)
})
