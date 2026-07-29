/**
 * 观澜数据存储层
 * 基于 JSON 文件的轻量数据库，负责读写 institutional_holdings 等结构化数据。
 * 数据通过通达信MCP获取后，由本模块写入JSON文件。
 * 未来迁移至 SQLite 时只需改本模块的实现。
 */

const fs = require('fs')
const path = require('path')

const { execSync } = require('child_process')

const DATA_DIR = path.resolve(__dirname, 'data')
const HOLDINGS_FILE = path.resolve(DATA_DIR, 'holdings-db.json')
const STOCK_LIST_FILE = path.resolve(DATA_DIR, 'stock-list.json')
const NORTH_FLOW_FILE = path.resolve(DATA_DIR, 'north-flow-db.json')
const MARGIN_FILE = path.resolve(DATA_DIR, 'margin-db.json')

// ============ 全市场股票列表 ============

/**
 * 获取全市场股票基础信息列表
 * @returns {Array<{code: string, name: string}>}
 */
function getStockList() {
  try {
    if (!fs.existsSync(STOCK_LIST_FILE)) return []
    const data = JSON.parse(fs.readFileSync(STOCK_LIST_FILE, 'utf-8'))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

/**
 * 获取某只股票的基础信息
 * @param {string} code - 6位股票代码
 * @returns {{code: string, name: string} | null}
 */
function getStockInfo(code) {
  const stocks = getStockList()
  return stocks.find(s => s.code === code) || null
}

/**
 * 搜索股票（按代码或名称模糊匹配）
 * @param {string} query - 搜索关键词
 * @param {number} limit - 最大返回数量
 * @returns {Array<{code: string, name: string}>}
 */
function searchStocks(query, limit = 20) {
  if (!query || query.trim() === '') return []
  const q = query.trim()
  const stocks = getStockList()
  const results = []
  for (const s of stocks) {
    if (results.length >= limit) break
    // 按代码前缀匹配（优先）
    if (s.code.startsWith(q)) {
      results.push({ ...s, matchType: 'code' })
    }
  }
  for (const s of stocks) {
    if (results.length >= limit) break
    if (results.find(r => r.code === s.code)) continue
    // 按名称包含匹配
    if (s.name.includes(q)) {
      results.push({ ...s, matchType: 'name' })
    }
  }
  return results
}

/**
 * 初始化全市场股票列表
 * 如果 stock-list.json 不存在或为空，自动通过 Python (akshare) 生成
 * 在服务器启动时调用
 */
function initStockList() {
  try {
    if (fs.existsSync(STOCK_LIST_FILE)) {
      const data = JSON.parse(fs.readFileSync(STOCK_LIST_FILE, 'utf-8'))
      if (Array.isArray(data) && data.length > 1000) {
        console.log(`[观澜数据] 全市场股票列表已就绪: ${data.length} 只`)
        return { ok: true, count: data.length, source: 'cache' }
      }
    }
    console.log('[观澜数据] 正在初始化全市场股票列表...')
    // 通过 Python akshare 获取全市场股票列表
    const scriptPath = path.resolve(__dirname, 'data', 'fetch-stocks.py')
    // 确保脚本存在
    if (!fs.existsSync(scriptPath)) {
      // 直接内联 Python 代码
      const pythonCode = `
import os
os.environ['no_proxy'] = '*'
os.environ['NO_PROXY'] = '*'
import akshare as ak
import json
df = ak.stock_info_a_code_name()
stocks = []
for _, row in df.iterrows():
    stocks.append({'code': row['code'], 'name': row['name']})
with open('${STOCK_LIST_FILE.replace(/\\/g, '/')}', 'w', encoding='utf-8') as f:
    json.dump(stocks, f, ensure_ascii=False)
print(len(stocks))
`
      const result = execSync(`python3 -c "${pythonCode.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
        timeout: 60000,
        encoding: 'utf-8',
      }).trim()
      const count = parseInt(result) || 0
      console.log(`[观澜数据] 全市场股票列表初始化完成: ${count} 只`)
      return { ok: true, count, source: 'generated' }
    }
  } catch (err) {
    console.error('[观澜数据] 初始化股票列表失败:', err.message)
    // 尝试通过 Python 脚本文件方式获取
    const pythonPath = 'C:/Users/wen-q/.workbuddy/binaries/python/versions/3.13.12/python.exe'
    try {
      const result = execSync(`"${pythonPath}" -c "import os;os.environ['no_proxy']='*';os.environ['NO_PROXY']='*';import akshare as ak; import json; df=ak.stock_info_a_code_name(); print(json.dumps([{'code':r['code'],'name':r['name']} for _,r in df.iterrows()], ensure_ascii=False))"`, {
        timeout: 60000,
        encoding: 'utf-8',
      }).trim()
      const stocks = JSON.parse(result)
      fs.writeFileSync(STOCK_LIST_FILE, JSON.stringify(stocks, null, 2), 'utf-8')
      console.log(`[观澜数据] 全市场股票列表初始化完成: ${stocks.length} 只`)
      return { ok: true, count: stocks.length, source: 'generated' }
    } catch (err2) {
      console.error('[观澜数据] Python生成股票列表也失败:', err2.message)
      return { ok: false, error: err.message, count: 0 }
    }
  }
}

// ============ 机构持仓数据库 ============

/** 读取全部持仓数据 */
function readAll() {
  try {
    if (!fs.existsSync(HOLDINGS_FILE)) return []
    return JSON.parse(fs.readFileSync(HOLDINGS_FILE, 'utf-8'))
  } catch {
    return []
  }
}

/** 写入全部持仓数据 */
function writeAll(records) {
  fs.writeFileSync(HOLDINGS_FILE, JSON.stringify(records, null, 2), 'utf-8')
}

/**
 * 查询某只股票指定类型的机构持仓
 * @param {string} code - 股票代码
 * @param {string} holderType - 机构类型(可选): fund/zhj/big_fund/social_security/insurance/qfii/broker/north
 * @param {string} reportDate - 报告期(可选)，默认返回最新
 */
function query(code, holderType, reportDate) {
  let records = readAll()
  if (code) records = records.filter(r => r.stock_code === code)
  if (holderType) records = records.filter(r => r.holder_type === holderType)
  if (reportDate) records = records.filter(r => r.report_date === reportDate)
  return records
}

/** 获取某只股票最新的持仓摘要（用于详情页） */
function getStockSummary(code) {
  const records = query(code)
  if (!records.length) return null

  // 按 report_date 分组，取最新
  const byDate = {}
  for (const r of records) {
    if (!byDate[r.report_date]) byDate[r.report_date] = []
    byDate[r.report_date].push(r)
  }
  const latestDate = Object.keys(byDate).sort().pop()
  if (!latestDate) return null

  const latest = byDate[latestDate]
  const summary = { reportDate: latestDate }

  for (const r of latest) {
    switch (r.holder_type) {
      case 'north':
        summary.hkConnectHolding = `香港中央结算有限公司持有${fmtShares(r.shares)}股(占流通股${r.ratio.toFixed(2)}%)`
        break
      case 'fund':
        summary.fundHolding = `基金重仓持有${fmtShares(r.shares)}股`
        if (r.market_value) summary.fundHolding += `(${r.market_value.toFixed(2)}亿元)`
        break
      case 'zhj':
        summary.zhjHolding = `证金汇金及资管合计持有${fmtShares(r.shares)}股(${r.ratio.toFixed(2)}%)`
        break
      case 'big_fund':
        summary.bigFundHolding = `国家集成电路产业投资基金持股${r.ratio.toFixed(2)}%`
        break
      case 'social_security':
        summary.socialSecurityHolding = `社保重仓持有${fmtShares(r.shares)}股(${r.market_value.toFixed(2)}亿元)`
        break
      case 'insurance':
        summary.insuranceHolding = `保险重仓持有${fmtShares(r.shares)}股(${r.market_value.toFixed(2)}亿元)`
        break
      case 'qfii':
        summary.qfiiHolding = `QFII重仓持有${fmtShares(r.shares)}股(${r.market_value.toFixed(2)}亿元)`
        break
      case 'broker':
        summary.brokerHolding = `券商重仓持有${fmtShares(r.shares)}股(${r.market_value.toFixed(2)}亿元)`
        break
    }
  }

  return summary
}

function fmtShares(n) {
  if (n >= 100000000) return (n / 100000000).toFixed(2) + '亿'
  if (n >= 10000) return (n / 10000).toFixed(2) + '万'
  return n.toString()
}

/**
 * 内置机构标签数据（来自通达信MCP tdx_screener 查询结果）
 * 当数据库文件不包含某只股票时，从此处获取机构标签
 * 数据格式: { [code]: { north?: true, zhj?: true, big_fund?: true } }
 */
const BUILTIN_TAGS = buildTagMap()

function buildTagMap() {
  const north = `605499,603369,601799,000568,002027,002508,688036,601288,600233,601398,601728,603288,601939,688169,603605,600809,600886,600900,002352,600690,600009,601088,601766,600104,600570,300760,600926,001979,600436,300498,000858,600585,601628,601009,603596,000157,002304,002271,601838,002594,000651,600015,601127,000001,600025,601919,601998,600919,000625,600741,600096,601390,600547,000538,600048,601169,600028,600016,601319,600019,002311,600989,000423,603606,601818,601012,601567,601601,601668,000963,002230,600438,688111,601211,600309,600346,002648,300015,000999,002714,000807,002241,601985,600150,600029,601600,002142,003816,601899,601077,603338,600958,601669,000425,600905,600023,600276,300012,600030,601225,688188,300866,600803,600795,600489,601688,600312,000166,600219,300059,600845,600111,002050,603259,300124,600406,600362,002270,601868,601100,600893,600426,601689,601901,002466,603993,300014,600089,002472,002460,600988,002001,601168,300750,002415,000400,600522,600176,000063,300274,603501,000100,300316,002028,688012,600160,002475,600999,600885,002422,688041,688981,300487,601138,601231,000725,600584,002371,300433,002138,000338,688256,688008,300408,600183,002353,603986,002384,002463,002938,300308,300502`
  const zhj = `002338,600895,600826,002153,300333,600663,000568,002104,002244,002066,600637,600886,600600,000895,600736,600690,600519,300468,300396,002365,600887,601888,600660,601633,002242,600729,600674,600031,000333,000006,601010,000997,600009,600436,600757,600657,000858,600585,600750,600694,002030,600422,002073,002154,002304,600894,600628,000651,002462,000726,600064,000061,000625,600741,600261,600787,600851,600547,000538,600120,601801,601021,601158,000031,600284,600017,600874,601012,603000,601601,000963,600037,600309,002277,000898,002724,000541,600325,000030,000402,002241,000768,000089,600812,002142,600717,000900,000661,000563,600056,600170,002054,600252,002053,600376,002267,600196,002225,000652,600276,601000,601225,600061,600633,600557,601336,600177,601688,600780,000631,601788,600026,601808,000685,600808,603328,002294,600406,600362,000883,601666,000686,002029,600021,601901,002466,601139,600435,000598,600510,002500,002250,000728,600642,300033,002236,600578,000973,000600,000776,000062,601995,000063,601066,002475,600999,000417,000823,300321,000338,600522,002396,300408`
  const bigFund = `300655,002151,300024,688107,002409,920186,300474,688187,300346,301269,688146,688591,300456,688213,688512,688825,688012,688981,688262,688126,688361,001287,688172,688702,688182,002185,688035,600460,600584,688728,002371,600206,688396,688545,688508,603893,688521,688347,300604,300567,002156,002916,300672,688072,688549,301308,688720,688797,688525,688783`

  const map = {}
  for (const c of north.split(',')) { if (!map[c]) map[c] = {}; map[c].north = true }
  for (const c of zhj.split(',')) { if (!map[c]) map[c] = {}; map[c].zhj = true }
  for (const c of bigFund.split(',')) { if (!map[c]) map[c] = {}; map[c].big_fund = true }
  return map
}

/** 获取某只股票的内置机构标签（不受DB文件限制） */
function getBuiltinTags(code) {
  const tags = BUILTIN_TAGS[code]
  if (!tags) return null
  const result = {}
  if (tags.north) result.hkConnectHolding = '北向资金重仓'
  if (tags.zhj) result.zhjHolding = '证金汇金持股'
  if (tags.big_fund) result.bigFundHolding = '国家集成电路产业投资基金持股'
  return Object.keys(result).length > 0 ? result : null
}

// ============ 北向资金数据库 ============

/** 读取北向资金历史数据 */
function readNorthFlow() {
  try {
    if (!fs.existsSync(NORTH_FLOW_FILE)) return []
    return JSON.parse(fs.readFileSync(NORTH_FLOW_FILE, 'utf-8'))
  } catch {
    return []
  }
}

/** 写入北向资金历史数据 */
function writeNorthFlow(records) {
  fs.writeFileSync(NORTH_FLOW_FILE, JSON.stringify(records, null, 2), 'utf-8')
}

/**
 * 追加一条北向资金日数据（自动按日期去重更新）
 * @param {{date:string, netFlow:number}} record
 */
function upsertNorthFlow(record) {
  const all = readNorthFlow()
  const idx = all.findIndex(r => r.date === record.date)
  if (idx >= 0) {
    all[idx] = record
  } else {
    all.push(record)
    all.sort((a, b) => a.date.localeCompare(b.date))
  }
  writeNorthFlow(all)
  return all.length
}

// ============ 两融余额数据库 ============

/** 读取两融余额历史数据 */
function readMargin() {
  try {
    if (!fs.existsSync(MARGIN_FILE)) return []
    return JSON.parse(fs.readFileSync(MARGIN_FILE, 'utf-8'))
  } catch {
    return []
  }
}

/** 写入两融余额历史数据（全量替换） */
function writeMargin(records) {
  records.sort((a, b) => a.date.localeCompare(b.date))
  fs.writeFileSync(MARGIN_FILE, JSON.stringify(records, null, 2), 'utf-8')
}

module.exports = { readAll, writeAll, query, getStockSummary, getBuiltinTags, getStockList, getStockInfo, searchStocks, initStockList, readNorthFlow, writeNorthFlow, upsertNorthFlow, readMargin, writeMargin }
