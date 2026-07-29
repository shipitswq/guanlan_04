/**
 * 板块数据库 — 行业层级 + 小时资金流时序
 * 使用 better-sqlite3，自动建表
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')

const DB_PATH = path.resolve(__dirname, 'data', 'sector.db')

let db = null

/** 获取数据库连接（单例） */
function getDb() {
  if (db) return db
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  initTables()
  return db
}

/** 初始化表结构 */
function initTables() {
  const conn = db

  conn.exec(`
    CREATE TABLE IF NOT EXISTS industry_levels (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      level INTEGER NOT NULL CHECK(level IN (1,2,3)),
      parent_code TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE TABLE IF NOT EXISTS sector_hourly_flow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL,
      sector_code TEXT NOT NULL,
      sector_name TEXT NOT NULL,
      main_inflow REAL NOT NULL DEFAULT 0,
      change_pct REAL NOT NULL DEFAULT 0,
      turnover REAL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_hourly_ts ON sector_hourly_flow(timestamp);
    CREATE INDEX IF NOT EXISTS idx_hourly_code ON sector_hourly_flow(sector_code);
    CREATE INDEX IF NOT EXISTS idx_hourly_ts_code ON sector_hourly_flow(timestamp, sector_code);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_hourly_unique ON sector_hourly_flow(timestamp, sector_code);
  `)

  // 迁移：给已有表加 market_cap 列（幂等）
  try { conn.exec(`ALTER TABLE sector_hourly_flow ADD COLUMN market_cap REAL DEFAULT 0`); } catch(e) {}
  try { conn.exec(`ALTER TABLE sector_hourly_flow ADD COLUMN total_market_cap REAL DEFAULT 0`); } catch(e) {}

  conn.exec(`
    CREATE TABLE IF NOT EXISTS stock_daily_flow (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL DEFAULT '',
      date TEXT NOT NULL,
      main_inflow REAL DEFAULT 0,
      large_inflow REAL DEFAULT 0,
      source TEXT DEFAULT 'eastmoney',
      created_at TEXT DEFAULT (datetime('now','localtime'))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_daily ON stock_daily_flow(stock_code, date);
  `)

  // 创建/替换小时内净流入视图
  conn.exec(`
    DROP VIEW IF EXISTS sector_hourly_netflow;
    CREATE VIEW sector_hourly_netflow AS
    WITH flow_with_lag AS (
      SELECT
        timestamp, sector_code, sector_name,
        main_inflow,
        LAG(main_inflow) OVER (PARTITION BY sector_code ORDER BY timestamp) AS prev_inflow,
        change_pct,
        LAG(change_pct) OVER (PARTITION BY sector_code ORDER BY timestamp) AS prev_change_pct
      FROM sector_hourly_flow
    )
    SELECT
      timestamp, sector_code, sector_name,
      main_inflow AS accumulated_inflow,
      ROUND(main_inflow - COALESCE(prev_inflow, 0), 4) AS hourly_net_inflow,
      change_pct AS change_pct_total,
      ROUND(change_pct - COALESCE(prev_change_pct, 0), 4) AS hourly_change_pct
    FROM flow_with_lag
    ORDER BY sector_code, timestamp;
  `)
}

// ============ 行业层级 ============

/** 批量写入/更新行业层级 */
function upsertIndustryLevels(records) {
  const conn = getDb()
  const stmt = conn.prepare(`
    INSERT INTO industry_levels (code, name, level, parent_code, sort_order)
    VALUES (@code, @name, @level, @parent_code, @sort_order)
    ON CONFLICT(code) DO UPDATE SET
      name = excluded.name,
      level = excluded.level,
      parent_code = excluded.parent_code,
      sort_order = excluded.sort_order
  `)
  const tx = conn.transaction((items) => {
    for (const item of items) stmt.run(item)
  })
  tx(records)
  return records.length
}

/** 获取全部行业层级 */
function getIndustryLevels() {
  return getDb().prepare('SELECT * FROM industry_levels ORDER BY level, sort_order, code').all()
}

/** 获取指定层级的行业 */
function getSectorsByLevel(level) {
  return getDb().prepare('SELECT * FROM industry_levels WHERE level = ? ORDER BY sort_order, code').all(level)
}

/** 获取层级树（含子节点） */
function getIndustryTree() {
  const all = getIndustryLevels()
  const map = {}
  const roots = []
  for (const s of all) {
    s.children = []
    map[s.code] = s
  }
  for (const s of all) {
    if (s.parent_code && map[s.parent_code]) {
      map[s.parent_code].children.push(s)
    } else if (s.level === 1) {
      roots.push(s)
    }
  }
  return roots
}

// ============ 小时资金流 ============

/** 插入一条小时快照（upsert 按 timestamp+sector_code 去重） */
function upsertHourlyFlow(records) {
  const conn = getDb()
  const stmt = conn.prepare(`
    INSERT INTO sector_hourly_flow (timestamp, sector_code, sector_name, main_inflow, change_pct, turnover, market_cap, total_market_cap)
    VALUES (@timestamp, @sector_code, @sector_name, @main_inflow, @change_pct, @turnover, @market_cap, @total_market_cap)
    ON CONFLICT(timestamp, sector_code) DO UPDATE SET
      main_inflow = excluded.main_inflow,
      change_pct = excluded.change_pct,
      turnover = excluded.turnover,
      market_cap = excluded.market_cap,
      total_market_cap = excluded.total_market_cap
  `)
  const tx = conn.transaction((items) => {
    for (const item of items) stmt.run(item)
  })
  tx(records)
  return records.length
}

/** 获取板块小时净流入数据（已计算相邻差值） */
function getHourlyNetflow(opts = {}) {
  const { sectorCode, since, level, limit } = opts
  const conn = getDb()
  let sql = `SELECT * FROM sector_hourly_netflow WHERE 1=1`
  const params = []

  if (sectorCode) {
    sql += ` AND sector_code = ?`
    params.push(sectorCode)
  }
  if (since) {
    sql += ` AND timestamp >= ?`
    params.push(since)
  }
  if (level) {
    // 按层级过滤：关联 industry_levels
    sql = `
      SELECT n.* FROM sector_hourly_netflow n
      JOIN industry_levels l ON n.sector_code = l.code
      WHERE l.level = ? AND 1=1
    `
    params.push(level)
    if (sectorCode) { sql += ` AND n.sector_code = ?`; params.push(sectorCode) }
    if (since) { sql += ` AND n.timestamp >= ?`; params.push(since) }
  }
  sql += ` ORDER BY n.timestamp, n.sector_code`
  if (limit) sql += ` LIMIT ?`

  return conn.prepare(sql).all(...params)
}

/** 获取最近 N 小时的板块资金快照（用于热力图） */
function getHourlySnapshot(opts = {}) {
  const { hours = 8, level, sectorCode, limit } = opts
  const conn = getDb()

  // 获取最近 hours 个整点时间
  const timestamps = conn.prepare(`
    SELECT DISTINCT timestamp FROM sector_hourly_flow
    ORDER BY timestamp DESC LIMIT ?
  `).all(hours).map(r => r.timestamp).reverse()

  if (timestamps.length === 0) return { timestamps: [], sectors: [], data: [] }

  let sql = `SELECT ts, sector_code, sector_name, hourly_net_inflow FROM sector_hourly_netflow WHERE 1=1`
  const params = []

  // 用子查询限定时间范围
  sql = `
    SELECT n.* FROM sector_hourly_netflow n
    WHERE n.timestamp IN (${timestamps.map(() => '?').join(',')})
  `
  params.push(...timestamps)

  if (level) {
    sql = `
      SELECT n.* FROM sector_hourly_netflow n
      JOIN industry_levels l ON n.sector_code = l.code
      WHERE l.level = ? AND n.timestamp IN (${timestamps.map(() => '?').join(',')})
    `
    params.unshift(level)
  }
  if (sectorCode) {
    sql += ` AND n.sector_code = ?`
    params.push(sectorCode)
  }
  sql += ` ORDER BY n.sector_code, n.timestamp`

  const rows = conn.prepare(sql).all(...params)

  // 整理为矩阵格式
  const sectorSet = new Set()
  const sectorNames = {}
  const sectorMarketCaps = {}  // sector_code → 流通市值（亿）
  for (const r of rows) {
    sectorSet.add(r.sector_code)
    sectorNames[r.sector_code] = r.sector_name
  }

  // 从原始表取每个板块最新的流通市值
  const capRows = conn.prepare(`
    SELECT sector_code, market_cap FROM sector_hourly_flow
    WHERE (sector_code, timestamp) IN (
      SELECT sector_code, MAX(timestamp) FROM sector_hourly_flow
      WHERE market_cap > 0 GROUP BY sector_code
    )
  `).all()
  for (const r of capRows) {
    sectorMarketCaps[r.sector_code] = r.market_cap
  }

  const data = timestamps.map((ts, idx) => {
    const row = { timestamp: ts }
    // 跨天边界：第一个时间点如果与前一个不同日，其 hourly_net_inflow 是 f62 每日归零的假象，置零
    const isCrossDay = idx > 0 && ts.slice(0, 10) !== timestamps[idx - 1].slice(0, 10)
    for (const r of rows.filter(x => x.timestamp === ts)) {
      row[r.sector_code] = isCrossDay ? 0 : r.hourly_net_inflow
    }
    return row
  })

  return {
    timestamps,
    sectors: [...sectorSet].map(code => ({ code, name: sectorNames[code] })),
    data,
    sectorMarketCaps,  // sector_code → 流通市值（亿），前端用来计算流入/市值比
  }
}

// ============ 日级资金流入聚合 ============

/**
 * 获取板块日级资金流入汇总
 * 从小时数据聚合，返回每个板块各时间段的累计净流入
 * @param {object} opts
 * @param {number} opts.days - 统计天数 (1/3/5)
 * @param {number} [opts.level] - 行业层级过滤
 * @returns {Array<{sector_code:string, sector_name:string, inflow:number, hours_count:number}>}
 */
function getDailyInflowSummary(opts = {}) {
  const { days = 1, level } = opts
  const conn = getDb()
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 19)

  let sql = `
    SELECT n.sector_code, n.sector_name, SUM(n.hourly_net_inflow) AS inflow, COUNT(*) AS hours_count
    FROM sector_hourly_netflow n
  `
  const params = []

  if (level) {
    sql += ` JOIN industry_levels l ON n.sector_code = l.code AND l.level = ?`
    params.push(level)
  }

  sql += ` WHERE n.timestamp >= ? GROUP BY n.sector_code ORDER BY inflow DESC`
  params.push(since)

  const rows = conn.prepare(sql).all(...params)

  // 累计总净流入 / 活跃小时数
  return rows.map(r => ({
    sector_code: r.sector_code,
    sector_name: r.sector_name,
    inflow: +r.inflow.toFixed(2),
    hours_count: r.hours_count,
  }))
}

/** 获取多日对比（今日/3日/5日） */
function getMultiDayInflowSummary(opts = {}) {
  const { level } = opts
  const days = [1, 3, 5]
  const conn = getDb()

  // 先拿所有板块列表（从最近的数据中获取）
  const allSectors = conn.prepare(`
    SELECT DISTINCT n.sector_code, n.sector_name
    FROM sector_hourly_netflow n
    ${level ? 'JOIN industry_levels l ON n.sector_code = l.code AND l.level = ?' : ''}
    ORDER BY n.sector_code
  `).all(...(level ? [level] : []))

  // 对每个板块，算 1日 3日 5日 累计
  const result = allSectors.map(s => {
    const row = { sector_code: s.sector_code, sector_name: s.sector_name }
    for (const d of days) {
      const since = new Date(Date.now() - d * 24 * 60 * 60 * 1000).toISOString().slice(0, 19)
      const r = conn.prepare(`
        SELECT SUM(hourly_net_inflow) AS inflow, COUNT(*) AS hours
        FROM sector_hourly_netflow
        WHERE sector_code = ? AND timestamp >= ?
      `).get(s.sector_code, since)
      row[`inflow_${d}d`] = r?.inflow ? +r.inflow.toFixed(2) : 0
      row[`hours_${d}d`] = r?.hours || 0
    }
    return row
  })

  return result
}

// ============ 数据收集（实时拉取 + 存储） ============

/**
 * 从东财拉取当前板块全量数据并存入 hourly_flow
 * @param {object} em - eastmoney.cjs 模块
 * @returns {{ok: boolean, count: number, ts: string}}
 */
function captureHourlySnapshot(em) {
  const now = new Date()
  // 对齐到整点: 2026-07-28T14:00:00
  const ts = now.toISOString().slice(0, 14) + '00:00'

  return new Promise((resolve, reject) => {
    em.getSectors()
      .then(rawSectors => {
        if (!rawSectors || rawSectors.length === 0) {
          return resolve({ ok: false, count: 0, ts, error: 'empty' })
        }

        const records = rawSectors.map(s => ({
          timestamp: ts,
          sector_code: s.code,
          sector_name: s.name,
          main_inflow: s.mainInflow || 0,
          change_pct: s.changePct || 0,
          turnover: s.turnover || 0,
          market_cap: s.circulationMarketCap || 0,
          total_market_cap: s.totalMarketCap || 0,
        }))

        const count = upsertHourlyFlow(records)
        console.log(`[板块采集] ${ts} 写入 ${count} 个板块`)
        resolve({ ok: true, count, ts })
      })
      .catch(err => {
        console.error('[板块采集] 失败:', err.message)
        resolve({ ok: false, count: 0, ts, error: err.message })
      })
  })
}

// ============ 个股日级资金流积累 ============

/**
 * 写入一条个股日级资金流（upsert）
 */
function upsertStockDailyFlow(records) {
  const conn = getDb()
  const stmt = conn.prepare(`
    INSERT INTO stock_daily_flow (stock_code, stock_name, date, main_inflow, large_inflow, source)
    VALUES (@stock_code, @stock_name, @date, @main_inflow, @large_inflow, @source)
    ON CONFLICT(stock_code, date) DO UPDATE SET
      main_inflow = excluded.main_inflow,
      large_inflow = excluded.large_inflow,
      source = excluded.source
  `)
  const tx = conn.transaction((items) => {
    for (const item of items) stmt.run(item)
  })
  tx(records)
  return records.length
}

/**
 * 获取个股日级资金流历史
 * @param {string} stockCode
 * @param {number} [limit=60]
 * @returns {Array<{date:string, main_inflow:number, large_inflow:number}>}
 */
function getStockDailyFlow(stockCode, limit = 60) {
  return getDb().prepare(`
    SELECT date, main_inflow, large_inflow
    FROM stock_daily_flow
    WHERE stock_code = ?
    ORDER BY date ASC
    LIMIT ?
  `).all(stockCode, limit)
}

/**
 * 从东财拉取 STOCK_POOL 中所有个股的日级资金流并存入数据库
 * @param {object} em - eastmoney.cjs 模块
 * @param {Array<{code:string, name:string}>} stockPool - 要采集的股票列表
 * @returns {Promise<{ok:boolean, count:number, failed:string[]}>}
 */
async function captureStockDailyFlows(em, stockPool) {
  const results = []
  const failed = []

  for (const s of stockPool) {
    try {
      const flow = await em.getStockCapitalFlow(s.code)
      if (flow && flow.length > 0) {
        const latest = flow[flow.length - 1]
        upsertStockDailyFlow([{
          stock_code: s.code,
          stock_name: s.name,
          date: latest.date,
          main_inflow: +(latest.main / 100000000).toFixed(4),
          large_inflow: +((latest.large + latest.superLarge) / 100000000).toFixed(4),
          source: 'eastmoney',
        }])
        results.push(s.code)
      }
    } catch (err) {
      failed.push(s.code)
    }
  }

  console.log(`[个股资金流] 采集 ${results.length} 只, 失败 ${failed.length} 只`)
  return { ok: true, count: results.length, failed }
}

module.exports = {
  getDb,
  upsertIndustryLevels,
  getIndustryLevels,
  getSectorsByLevel,
  getIndustryTree,
  upsertHourlyFlow,
  getHourlyNetflow,
  getHourlySnapshot,
  getDailyInflowSummary,
  getMultiDayInflowSummary,
  captureHourlySnapshot,
  upsertStockDailyFlow,
  getStockDailyFlow,
  captureStockDailyFlows,
}
