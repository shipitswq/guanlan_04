/**
 * 全市场数据缓存读取模块
 * 数据来源：对话中通过通达信MCP获取，写入 server/data/ 目录
 * 缓存由本对话（或自动化任务）更新
 */

const fs = require('fs')
const path = require('path')

const DATA_DIR = path.resolve(__dirname, 'data')

/** 读取市场涨跌统计缓存 */
function readMarketBreadth() {
  try {
    const file = path.join(DATA_DIR, 'market-breadth.json')
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/** 读取板块列表缓存（通达信行业板块实时数据） */
function readSectors() {
  try {
    const file = path.join(DATA_DIR, 'sectors.json')
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

/** 读取机构持仓缓存（大基金/证金汇金/基金重仓等） */
function readInstitutionalHoldings() {
  try {
    const file = path.join(DATA_DIR, 'institutional-holdings.json')
    if (!fs.existsSync(file)) return null
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch {
    return null
  }
}

module.exports = {
  readMarketBreadth,
  readSectors,
  readInstitutionalHoldings,
}
