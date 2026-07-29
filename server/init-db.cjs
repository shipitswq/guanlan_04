/**
 * 观澜数据库初始化脚本
 * 创建表结构、插入标的池、清理旧数据
 */

const DB = require('better-sqlite3')
const path = require('path')

const DB_PATH = path.resolve(__dirname, 'data', 'guanlan.db')

function initDB() {
  const db = new DB(DB_PATH)
  db.pragma('journal_mode = WAL')

  // 建表
  db.exec(`
    CREATE TABLE IF NOT EXISTS stocks (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sector_id TEXT,
      sector_name TEXT,
      updated_at TEXT
    );

    CREATE TABLE IF NOT EXISTS institutional_holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      report_date TEXT NOT NULL,
      holder_type TEXT NOT NULL,
      holder_name TEXT,
      shares INTEGER DEFAULT 0,
      ratio REAL DEFAULT 0,
      market_value REAL DEFAULT 0,
      change_shares INTEGER,
      change_ratio REAL,
      source TEXT DEFAULT 'tdx',
      created_at TEXT DEFAULT (datetime('now','localtime')),
      FOREIGN KEY (stock_code) REFERENCES stocks(code)
    );

    CREATE INDEX IF NOT EXISTS idx_holder_stock ON institutional_holdings(stock_code, report_date);
    CREATE INDEX IF NOT EXISTS idx_holder_type ON institutional_holdings(holder_type, report_date);
  `)

  // 插入股票池
  const pool = [
    ['002371','北方华创','semi','半导体'], ['688981','中芯国际','semi','半导体'],
    ['603501','豪威集团','semi','半导体'], ['300750','宁德时代','new_energy','电力设备'],
    ['601012','隆基绿能','new_energy','电力设备'], ['600276','恒瑞医药','pharma','医药医疗'],
    ['603259','药明康德','pharma','医药医疗'], ['600519','贵州茅台','food','食品饮料'],
    ['000858','五粮液','food','食品饮料'], ['600036','招商银行','bank','银行'],
    ['600760','中航沈飞','military','国防军工'], ['002230','科大讯飞','software','计算机'],
    ['601899','紫金矿业','metal','有色金属'], ['002475','立讯精密','electronics','消费电子'],
  ]

  const now = new Date().toISOString()
  const upsert = db.prepare('INSERT OR REPLACE INTO stocks VALUES (?,?,?,?,?)')
  const tx = db.transaction(() => {
    for (const s of pool) upsert.run(s[0], s[1], s[2], s[3], now)
  })
  tx()

  const count = db.prepare('SELECT COUNT(*) as c FROM stocks').get()
  console.log(`[init-db] ${count.c} 只标的已就绪`)
  console.log(`[init-db] 数据库路径: ${DB_PATH}`)

  db.close()
  return true
}

// 执行
initDB()
