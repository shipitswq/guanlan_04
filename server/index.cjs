/**
 * 观澜量化分析平台 - 后端 API 服务
 * 使用腾讯财经 API 获取真实 A 股数据
 */

const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')
const tct = require('./tencent.cjs')
const em = require('./eastmoney.cjs')
const scoring = require('./scoring.cjs')
const cache = require('./cache.cjs')
const sectorDb = require('./sector-db.cjs')
const db = require('./db.cjs')
const riskEvents = require('./risk-events.cjs')

const app = express()
const PORT = process.env.PORT || 3003

app.use(cors())

// 生产模式：托管前端构建产物
const DIST_DIR = path.resolve(__dirname, '..', 'dist')
if (fs.existsSync(DIST_DIR)) {
  app.use(express.static(DIST_DIR))
  console.log(`[观澜] 前端静态文件: ${DIST_DIR}`)
}

// ============ 股票池配置 ============

const STOCK_POOL = [
  { code: '002371', name: '北方华创', sectorId: 'semi', sectorName: '半导体' },
  { code: '688981', name: '中芯国际', sectorId: 'semi', sectorName: '半导体' },
  { code: '603501', name: '韦尔股份', sectorId: 'semi', sectorName: '半导体' },
  { code: '300750', name: '宁德时代', sectorId: 'new_energy', sectorName: '电力设备' },
  { code: '601012', name: '隆基绿能', sectorId: 'new_energy', sectorName: '电力设备' },
  { code: '600276', name: '恒瑞医药', sectorId: 'pharma', sectorName: '医药医疗' },
  { code: '603259', name: '药明康德', sectorId: 'pharma', sectorName: '医药医疗' },
  { code: '600519', name: '贵州茅台', sectorId: 'food', sectorName: '食品饮料' },
  { code: '000858', name: '五粮液', sectorId: 'food', sectorName: '食品饮料' },
  { code: '600036', name: '招商银行', sectorId: 'bank', sectorName: '银行' },
  { code: '600760', name: '中航沈飞', sectorId: 'military', sectorName: '国防军工' },
  { code: '002230', name: '科大讯飞', sectorId: 'software', sectorName: '计算机' },
  { code: '601899', name: '紫金矿业', sectorId: 'metal', sectorName: '有色金属' },
  { code: '002475', name: '立讯精密', sectorId: 'electronics', sectorName: '消费电子' },
]

// 板块映射已移除 — 改用 eastmoney.getSectors() 动态获取东财全量行业 (~86个)

// ============ 懒加载：股票→板块映射缓存 ============

const SECTOR_CACHE_TTL = 30 * 60 * 1000 // 30 分钟
let stockSectorCache = null
let stockSectorCacheTs = 0
let sectorCacheBuildPromise = null
let lastSectorCache = null // 板块树缓存，东财不可用时的降级数据
// 启动时从磁盘缓存恢复（仅当格式正确时）
try {
  const cached = cache.readSectors()
  if (cached?.sectors?.length >= 30 && cached.sectors[0].code) lastSectorCache = cached.sectors
} catch (e) {}

/** 构建全市场股票→板块映射（懒加载，首次调用时构建并缓存）*/
async function getStockSectorMap() {
  const now = Date.now()
  if (stockSectorCache && (now - stockSectorCacheTs) < SECTOR_CACHE_TTL) {
    return stockSectorCache
  }
  // 正在构建中 → 复用已有 promise
  if (sectorCacheBuildPromise) return sectorCacheBuildPromise

  sectorCacheBuildPromise = (async () => {
    console.log('[观澜] 开始构建股票→板块映射...')
    const map = {}
    try {
      const sectors = await em.getSectors()
      console.log(`[观澜] 获取到 ${sectors.length} 个行业板块`)

      // 分批并行获取成分股（每批 5 个板块）
      const BATCH = 5
      for (let i = 0; i < sectors.length; i += BATCH) {
        const batch = sectors.slice(i, i + BATCH)
        const results = await Promise.allSettled(
          batch.map((s) => em.getSectorStocks(s.code).then((stocks) => ({ code: s.code, name: s.name, stocks })))
        )
        for (const r of results) {
          if (r.status === 'fulfilled' && r.value) {
            const { code: bkCode, name: bkName, stocks } = r.value
            for (const st of (stocks || [])) {
              if (st.code) map[st.code] = { sectorId: bkCode, sectorName: bkName }
            }
          }
        }
        if ((i + BATCH) % 25 === 0 || i + BATCH >= sectors.length) {
          console.log(`[观澜] 板块映射构建进度: ${Math.min(i + BATCH, sectors.length)}/${sectors.length}`)
        }
      }
      console.log(`[观澜] 股票→板块映射构建完成，共 ${Object.keys(map).length} 只股票`)
    } catch (err) {
      console.error('[观澜] 构建股票→板块映射失败:', err.message)
    }
    stockSectorCache = map
    stockSectorCacheTs = now
    sectorCacheBuildPromise = null
    return map
  })()

  return sectorCacheBuildPromise
}

// ============ API 路由 ============

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// ---- 市场总览 ----
app.get('/api/market', async (req, res) => {
  try {
    const codes = STOCK_POOL.map((s) => s.code)
    const data = await tct.getMarketOverview(codes)

    // 统一北向资金数据源：使用 north-flow-db（同花顺 hsgtApi），与底部图表一致
    const northFlowData = db.readNorthFlow()
    if (northFlowData.length > 0) {
      data.northFlow = northFlowData[northFlowData.length - 1].netFlow
    }

    res.json(data)
  } catch (err) {
    console.error('market error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 市场资金流向（全A股精确数据，按订单规模分类） ----
app.get('/api/market/fund-flow', async (req, res) => {
  try {
    const sectors = await em.getSectors().catch(() => [])
    if (!sectors || sectors.length === 0) {
      return res.json({
        institutional: null, mainForce: null, largeRetail: null, retail: null,
        total: null, samples: 0, note: '盘中数据（收盘后东财API不可用）',
      })
    }
    let totalSuper = 0, totalLarge = 0, totalMid = 0, totalSmall = 0
    for (const s of sectors) {
      totalSuper += s.superLargeInflow || 0
      totalLarge += s.largeInflow || 0
      totalMid += s.mediumInflow || 0
      totalSmall += s.smallInflow || 0
    }
    // 东财分类 → 用户分类
    // 超大单(>=500万) → 机构  大单(100-500万) → 主力
    // 中单(20-100万) → 大户  小单(<20万) → 散户
    res.json({
      institutional: +totalSuper.toFixed(1),
      mainForce: +totalLarge.toFixed(1),
      largeRetail: +totalMid.toFixed(1),
      retail: +totalSmall.toFixed(1),
      total: +(totalSuper + totalLarge + totalMid + totalSmall).toFixed(1),
      samples: sectors.length,
      note: '全市场100个行业板块精确汇总，非估算',
    })
  } catch (err) {
    console.error('market fund-flow error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 资金流向快照采集（5分钟级，盘后可查） ----
const FUND_FLOW_SNAPSHOT_FILE = path.resolve(__dirname, 'data', 'fund-flow-today.json')

function readFundFlowSnapshots() {
  try {
    if (!fs.existsSync(FUND_FLOW_SNAPSHOT_FILE)) return { date: '', snapshots: [] }
    return JSON.parse(fs.readFileSync(FUND_FLOW_SNAPSHOT_FILE, 'utf-8'))
  } catch { return { date: '', snapshots: [] } }
}

function writeFundFlowSnapshots(data) {
  fs.writeFileSync(FUND_FLOW_SNAPSHOT_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// 采集当前资金流向快照
app.post('/api/market/fund-flow/snapshot', async (req, res) => {
  try {
    const sectors = await em.getSectors().catch(() => [])
    if (!sectors || sectors.length === 0) {
      return res.json({ ok: false, error: '东财API不可用' })
    }
    let totalSuper = 0, totalLarge = 0, totalMid = 0, totalSmall = 0
    for (const s of sectors) {
      totalSuper += s.superLargeInflow || 0
      totalLarge += s.largeInflow || 0
      totalMid += s.mediumInflow || 0
      totalSmall += s.smallInflow || 0
    }
    const now = new Date()
    const today = now.toISOString().slice(0, 10)
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const snap = readFundFlowSnapshots()
    // 跨天重置
    if (snap.date !== today) {
      snap.date = today
      snap.snapshots = []
    }
    // 避免重复（同一分钟不重复采集）
    if (snap.snapshots.length > 0 && snap.snapshots[snap.snapshots.length - 1].timestamp === timeStr) {
      return res.json({ ok: true, cached: true, timestamp: timeStr })
    }
    snap.snapshots.push({
      timestamp: timeStr,
      institutional: +totalSuper.toFixed(1),
      mainForce: +totalLarge.toFixed(1),
      largeRetail: +totalMid.toFixed(1),
      retail: +totalSmall.toFixed(1),
    })
    writeFundFlowSnapshots(snap)
    res.json({ ok: true, cached: false, timestamp: timeStr, count: snap.snapshots.length })
  } catch (err) {
    console.error('fund-flow snapshot error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// 查询今日资金流向历史
app.get('/api/market/fund-flow/history', (req, res) => {
  const snap = readFundFlowSnapshots()
  const today = new Date().toISOString().slice(0, 10)
  if (snap.date === today) {
    res.json({ date: today, snapshots: snap.snapshots })
  } else {
    res.json({ date: today, snapshots: [] })
  }
})
app.get('/api/market/stabilization-fund', async (req, res) => {
  try {
    // 1. 监控沪深300等主要ETF异常放量
    const ETF_CODES = ['510300', '510050', '159919', '510310', '588000', '512100']
    const etfQuotes = await em.getStockQuotesBatch(ETF_CODES).catch(() => [])
    const etfSignals = etfQuotes.map(q => {
      // 量比>2 或 成交额>30亿 视为异常放量
      const abnormal = (q.volumeRatio || 0) > 2 || (q.turnover || 0) > 30
      return {
        code: q.code, name: q.name,
        turnover: q.turnover, volumeRatio: q.volumeRatio,
        changePct: q.changePct,
        signal: abnormal ? '异常放量' : '正常',
        severity: (q.volumeRatio || 0) > 3 ? 'strong' : abnormal ? 'moderate' : 'none',
      }
    })
    const etfActiveCount = etfSignals.filter(s => s.severity !== 'none').length

    // 2. 银行板块 vs 全市场资金流背离检测
    const sectors = await em.getSectors().catch(() => [])
    const bankSector = sectors ? sectors.find(s => s.code === 'BK0475') : null
    const marketSectors = (sectors || []).filter(s => s.turnover > 0) || []
    const totalMainInflow = marketSectors.reduce((sum, s) => sum + (s.mainInflow || 0), 0)
    const bankInflow = bankSector?.mainInflow || 0
    let bankDivergence = 0
    let bankSignal = 'none'
    if (bankInflow > 0 && totalMainInflow < 0) {
      bankDivergence = Math.abs(bankInflow / Math.max(1, Math.abs(totalMainInflow)))
      bankSignal = bankDivergence > 0.5 ? 'strong' : 'moderate'
    } else if (bankInflow < 0 && totalMainInflow > 0) {
      bankDivergence = -Math.abs(bankInflow / Math.max(1, Math.abs(totalMainInflow)))
    }

    // 3. 超大单持续买入检测（用板块级超大单数据，覆盖全市场）
    const totalSuperInflow = marketSectors.reduce((sum, s) => sum + (s.superLargeInflow || 0), 0)
    const superBuySectors = marketSectors.filter(s => (s.superLargeInflow || 0) > 0).length
    const superSellSectors = marketSectors.filter(s => (s.superLargeInflow || 0) < 0).length
    let superSignal = 'none'
    if (superBuySectors > superSellSectors * 1.5 && totalSuperInflow > 0) superSignal = 'strong'
    else if (superBuySectors > superSellSectors) superSignal = 'moderate'
    else if (superSellSectors > superBuySectors) superSignal = 'negative'

    // 4. 综合评分
    const signalCount = [etfActiveCount > 0, bankSignal === 'strong' || bankSignal === 'moderate',
      superSignal === 'strong' || superSignal === 'moderate'].filter(Boolean).length
    const negativeSignals = [superSignal === 'negative', bankDivergence < 0].filter(Boolean).length

    let verdict = '无明显平准资金介入迹象'
    let confidence = 0
    if (signalCount >= 2) {
      verdict = '平准资金疑似介入（多重信号）'
      confidence = 7
    } else if (signalCount === 1) {
      verdict = '平准资金可能有介入（单一信号）'
      confidence = 4
    } else if (negativeSignals > 0) {
      verdict = '市场仍以净流出为主'
      confidence = 2
    }

    res.json({
      timestamp: new Date().toISOString(),
      verdict,
      confidence,
      isActive: signalCount >= 1,
      details: {
        etf: { signals: etfSignals, activeCount: etfActiveCount, summary: etfActiveCount > 0 ? `${etfActiveCount}只ETF异常放量` : 'ETF成交正常' },
        bankDivergence: {
          bankInflow: +bankInflow.toFixed(1),
          totalMainInflow: +totalMainInflow.toFixed(1),
          signal: bankSignal,
          summary: bankSignal !== 'none'
            ? '银行板块资金流入 vs 全市场流出（典型平准特征）'
            : '银行与市场资金方向一致',
        },
        superOrder: {
          buySectors: superBuySectors, sellSectors: superSellSectors, signal: superSignal,
          summary: superSignal === 'strong' ? '超大单持续买入' : superSignal === 'negative' ? '超大单以卖出为主' : '超大单信号不明显',
        },
      },
    })
  } catch (err) {
    console.error('stabilization fund error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 板块列表（东财实时全量行业板块 ~86个，失败时回退缓存） ----
app.get('/api/sectors', async (req, res) => {
  try {
    let rawSectors
    try {
      rawSectors = await em.getSectors()
    } catch (e) {
      console.warn('[观澜] 东财板块API不可用，回退缓存:', e.message)
    }

    // 东财成功 → 用实时全量数据
    if (rawSectors && rawSectors.length > 0) {
      const sectors = rawSectors.map((s) => {
        // 资金面评分（用主力净流入+成交额）
        const capital = scoring.scoreCapital(
          { turnover: s.turnover, turnoverRate: s.turnoverRate || 1 },
          { mainInflow: s.mainInflow || 0, largeInflow: s.largeInflow || 0 },
          0
        )
        // 情绪面评分（用涨跌家数+振幅）
        const totalStocks = (s.upCount || 0) + (s.downCount || 0)
        const sentiment = scoring.scoreSentiment(
          { turnoverRate: s.turnoverRate || 1, volumeRatio: 1, amplitude: s.amplitude || 2 },
          totalStocks > 0 ? { upCount: s.upCount || 0, downCount: s.downCount || 0, total: totalStocks } : null
        )
        // 基本面评分（板块列表无PE/PB，统一给中性分）
        const fundamental = {
          dimension: 'fundamental', score: 50, rating: 'neutral',
          summary: '板块基本面需查看详情页获取完整评分',
          indicators: [],
        }
        // 技术面评分（以涨跌幅为依据）
        const techScore = s.changePct > 2 ? 75 : s.changePct > 0 ? 55 : s.changePct > -2 ? 45 : 25
        const technical = {
          dimension: 'technical', score: techScore, rating: scoring.scoreToRating(techScore),
          summary: s.changePct > 2 ? '技术面强势，板块涨幅领先' : s.changePct > 0 ? '技术面中性偏强' : s.changePct > -2 ? '技术面中性偏弱' : '技术面偏弱',
          indicators: [],
        }
        const analysis = [fundamental, capital, sentiment, technical]
        const totalScore = scoring.calcTotalScore(analysis)

        return {
          id: s.code,           // BK代码作为唯一ID
          name: s.name,
          code: s.code,
          changePct: +s.changePct.toFixed(2),
          turnover: +s.turnover.toFixed(2),
          leadingStock: '',
          stockCount: totalStocks,
          netInflow: +(s.mainInflow || 0).toFixed(2),
          marketCap: +(s.totalMarketCap || 0).toFixed(2),
          floatMarketCap: +(s.circulationMarketCap || 0).toFixed(2),
          totalScore,
          rating: scoring.scoreToRating(totalScore),
          analysis,
          trend5d: [],
        }
      })

      console.log(`[观澜] 板块列表: ${sectors.length}个行业 (东财实时)`)
      // 缓存到磁盘，收盘后可继续查看
      cache.writeSectors({ date: new Date().toISOString().slice(0, 10), sectors, updatedAt: new Date().toISOString() })
      return res.json(sectors)
    }

    // 东财不可用 → 回退缓存
    console.warn('[观澜] 板块列表: 回退缓存数据')
    const cached = cache.readSectors()
    if (!cached || !cached.sectors || cached.sectors.length === 0) {
      return res.status(503).json({ error: '板块数据源均不可用' })
    }
    const fallback = cached.sectors.filter(s => s.name && s.changePct != null).map((s) => {
      try {
        const mc = s.marketCap || s.totalMarketCap || 1
        const fundamental = scoring.scoreFundamental({ pe: +(s.pe || 0), pb: +(s.pb || 0), marketCap: mc }, null)
        const capital = scoring.scoreCapital(
          { turnover: s.turnover || 0, turnoverRate: (s.turnover || 0) / mc * 100 },
          { mainInflow: s.mainInflow || s.netInflow || 0 }, 0
        )
        const sentiment = scoring.scoreSentiment(
          { turnoverRate: (s.turnover || 0) / mc * 100, volumeRatio: 1, amplitude: s.amplitude || 2 }, null
        )
        const chg = s.changePct || 0
        const techScore = chg > 2 ? 75 : chg > 0 ? 55 : chg > -2 ? 45 : 25
        const technical = {
          dimension: 'technical', score: techScore, rating: scoring.scoreToRating(techScore),
          summary: chg > 2 ? '技术面强势' : chg > 0 ? '技术面中性偏强' : '技术面偏弱',
          indicators: [],
        }
        const analysis = [fundamental, capital, sentiment, technical]
        const totalScore = scoring.calcTotalScore(analysis)
        return {
          id: s.code || s.id || '',
          name: s.name, code: s.code || s.tdxCode || '',
          changePct: +(+chg).toFixed(2), turnover: +(s.turnover || 0).toFixed(2),
          leadingStock: '', stockCount: 0, netInflow: +(s.mainInflow || s.netInflow || 0).toFixed(2),
          marketCap: +(mc).toFixed(2),
          floatMarketCap: +(s.circulationMarketCap || s.floatMarketCap || 0).toFixed(2),
          totalScore, rating: scoring.scoreToRating(totalScore), analysis, trend5d: [],
        }
      } catch (e) {
        console.warn('[缓存] 跳过无效板块:', s.name, e.message)
        return null
      }
    }).filter(Boolean)
    res.json(fallback)
  } catch (err) {
    console.error('sectors error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 板块资金热力图数据（支持 shw 模式按申万一级聚合） ----
app.get('/api/sectors/heatmap', async (req, res) => {
  try {
    const hours = Math.min(5000, Math.max(2, parseInt(req.query.hours) || 8))
    const level = req.query.level ? parseInt(req.query.level) : undefined

    let data = sectorDb.getHourlySnapshot({ hours, level })

    // shw=true → 按申万一级行业（BK_TO_SHW）聚合
    if (req.query.shw === 'true' && data.sectors.length > 0) {
      // 将 BK 代码映射到申万一级行业：同名板块（如BK1201电子）单独使用，不叠加子行业
      const shwMap = {}
      for (const sec of data.sectors) {
        const shw = BK_TO_SHW[sec.code] || '其他'
        if (!shwMap[shw]) shwMap[shw] = { name: shw, codes: [], mainCode: null }
        if (sec.name === shw) {
          shwMap[shw].mainCode = sec.code  // 同名板块（如电子→BK1201），已含全行业总量
        } else {
          shwMap[shw].codes.push(sec.code)  // 子行业（半导体等）
        }
      }
      // 有同名板块时，用它替代所有子行业之和（避免重复计数）
      for (const g of Object.values(shwMap)) {
        if (g.mainCode) g.codes = [g.mainCode]
      }
      const shwList = Object.values(shwMap)

      // 聚合市值
      const shwMarketCaps = {}
      for (const g of shwList) {
        let totalMC = 0
        for (const code of g.codes) {
          totalMC += data.sectorMarketCaps?.[code] || 0
        }
        shwMarketCaps[g.name] = totalMC
      }

      // 聚合每条时间线的资金流数据
      const aggregatedData = data.timestamps.map(ts => {
        const row = { timestamp: ts }
        const origRow = data.data.find(r => r.timestamp === ts) || {}
        for (const g of shwList) {
          let sum = 0
          for (const code of g.codes) sum += origRow[code] || 0
          row[g.name] = +sum.toFixed(2)
        }
        return row
      })

      data = {
        timestamps: data.timestamps,
        sectors: shwList.map(g => ({ code: g.name, name: g.name })),
        data: aggregatedData,
        sectorMarketCaps: shwMarketCaps,
      }
    }

    // 叠加当前实时 f62 值作为最新时间点（与板块列表同源）
    // 注意：实时值是当日累计总额，需要转为增量（减去历史累计）后追加
    try {
      const realtime = await em.getSectors()
      if (realtime && realtime.length > 0) {
        // 收盘后（>=15:00 CST）使用 15:00 作为时间戳，盘中用当前时间
        const now = new Date()
        const utcH = now.getUTCHours()
        const cstH = (utcH + 8) % 24
        const overlayH = cstH >= 15 ? '07' : String(utcH).padStart(2, '0') // 15:00 CST = 07:00 UTC
        const nowTs = now.toISOString().slice(0, 11) + overlayH + ':00:00'
        const realtimeTotal = {}

        if (req.query.shw === 'true') {
          // 用与历史聚合相同的逻辑：同名板块单独使用，不叠加子行业
          const rtShw = {}
          for (const sec of realtime) {
            const shw = BK_TO_SHW[sec.code] || '其他'
            if (!rtShw[shw]) rtShw[shw] = { total: 0, hasMain: false }
            // 同名板块（如BK1207计算机→计算机）单独使用
            if (sec.name === shw) {
              rtShw[shw].total = sec.mainInflow || 0
              rtShw[shw].hasMain = true
            } else if (!rtShw[shw].hasMain) {
              rtShw[shw].total += sec.mainInflow || 0
            }
          }
          for (const [shw, v] of Object.entries(rtShw)) {
            realtimeTotal[shw] = +v.total.toFixed(2)
          }
        } else {
          for (const sec of realtime) {
            realtimeTotal[sec.code] = +(sec.mainInflow || 0).toFixed(2)
          }
        }

        // 计算从历史累计到实时累计的增量
        const realtimeRow = { timestamp: nowTs }
        for (const code of Object.keys(realtimeTotal)) {
          let histCum = 0
          for (const row of data.data) {
            histCum += row[code] || 0
          }
          realtimeRow[code] = +(realtimeTotal[code] - histCum).toFixed(2)
        }
        // 更新市值
        if (req.query.shw === 'true') {
          for (const sec of realtime) {
            const shw = BK_TO_SHW[sec.code] || '其他'
            data.sectorMarketCaps[shw] = (data.sectorMarketCaps[shw] || 0) + (sec.totalMarketCap || 0)
          }
        } else {
          for (const sec of realtime) {
            data.sectorMarketCaps[sec.code] = +(sec.totalMarketCap || 0).toFixed(2)
          }
        }

        // 移除实时叠加点之后的所有历史数据（如 16:00 的陈旧采集）
        data.timestamps = data.timestamps.filter(ts => ts < nowTs)
        data.data = data.data.filter(row => row.timestamp < nowTs)

        data.timestamps.push(nowTs)
        data.data.push(realtimeRow)
      }
    } catch (e) {
      console.warn('[热力图] 叠加实时数据失败:', e.message)
    }

    res.json(data)
  } catch (err) {
    console.error('heatmap error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 板块层级数据 ----
app.get('/api/sectors/levels', (req, res) => {
  try {
    const tree = sectorDb.getIndustryTree()
    res.json(tree)
  } catch (err) {
    console.error('levels error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ============ 东财板块 → 申万31一级行业映射 ============
// 原则：每个申万一级行业只映射对应名的东财板块（如 BK0486 传媒 → 传媒）
// 其他子行业（游戏Ⅱ、出版等）不是申万一级，不计入
const BK_TO_SHW = {
  BK0420:'交通运输',BK0421:'交通运输',BK0422:'交通运输',BK0450:'交通运输',BK1210:'交通运输',
  BK0424:'建筑材料',BK0476:'建筑材料',BK0546:'建筑材料',BK1020:'建筑材料',BK1208:'建筑材料',
  BK0427:'公用事业',BK0428:'公用事业',BK1028:'公用事业',
  BK0433:'农林牧渔',
  BK0436:'纺织服饰',BK1224:'纺织服饰',BK1225:'纺织服饰',BK0734:'纺织服饰',
  BK0437:'煤炭',
  BK0438:'食品饮料',
  BK0440:'轻工制造',BK1212:'轻工制造',
  BK0448:'通信',BK0736:'通信',BK1215:'通信',
  BK0451:'房地产',BK1045:'房地产',BK1202:'房地产',
  BK0454:'基础化工',BK0471:'基础化工',BK0538:'基础化工',
  BK0731:'基础化工',BK1018:'基础化工',BK1019:'基础化工',
  BK1206:'基础化工',
  BK0456:'家用电器',
  BK0457:'电力设备',BK1030:'电力设备',BK1031:'电力设备',BK1032:'电力设备',
  BK1033:'电力设备',BK1034:'电力设备',BK1200:'电力设备',
  BK0458:'机械设备',BK0545:'机械设备',BK0739:'机械设备',BK0910:'机械设备',BK1205:'机械设备',
  BK0459:'电子',BK1036:'电子',BK1037:'电子',BK1038:'电子',BK1039:'电子',BK1201:'电子',BK1223:'电子',
  BK0464:'石油石化',
  BK0465:'医药生物',BK0727:'医药生物',BK1040:'医药生物',BK1041:'医药生物',
  BK1042:'医药生物',BK1044:'医药生物',BK1216:'医药生物',
  BK0473:'非银金融',BK0474:'非银金融',BK0738:'非银金融',BK1203:'非银金融',
  BK0475:'银行',
  BK0478:'有色金属',BK0732:'有色金属',BK1015:'有色金属',BK1027:'有色金属',
  BK0479:'钢铁',
  BK0481:'汽车',BK1016:'汽车',BK1211:'汽车',
  BK0482:'商贸零售',BK0484:'商贸零售',BK1213:'商贸零售',
  BK0486:'传媒',BK1046:'传媒',BK1218:'传媒',BK1219:'传媒',
  BK1220:'传媒',BK1221:'传媒',BK1222:'传媒',
  BK0539:'综合',BK1217:'综合',
  BK0725:'建筑装饰',BK0726:'建筑装饰',BK1209:'建筑装饰',
  BK0728:'环保',
  BK0735:'计算机',BK0737:'计算机',BK1207:'计算机',
  BK0740:'社会服务',BK1043:'社会服务',BK1214:'社会服务',
  BK1204:'国防军工',
  BK1035:'美容护理',
}

// ---- 板块折叠树（申万31一级行业 → 东财100行业板块） ----
app.get('/api/sectors/tree', async (req, res) => {
  try {
    let rawSectors
    try {
      rawSectors = await em.getSectors()
    } catch (e) {
      console.warn('[板块树] 东财不可用:', e.message)
    }
    // 东财失败或返回太少 → 用内存中的上次成功结果
    if (!rawSectors || rawSectors.length < 30) {
      if (lastSectorCache && lastSectorCache.length >= 30 && lastSectorCache[0].code) {
        rawSectors = lastSectorCache
      } else {
        // 兜底：从行业层级表拉 code+name（离线可用）
        const levels = sectorDb.getIndustryLevels().filter(l => l.level === 2)
        rawSectors = levels.map(l => ({ code: l.code, name: l.name, changePct: 0, turnover: 0, mainInflow: 0, totalMarketCap: 0, circulationMarketCap: 0 }))
      }
    }
    if (!rawSectors || rawSectors.length === 0) {
      return res.json([])
    }
    // 缓存本次结果以备下次降级使用
    if (rawSectors.length >= 30) {
      lastSectorCache = rawSectors
      // 同时写入磁盘缓存
      cache.writeSectors({ date: new Date().toISOString().slice(0, 10), sectors: rawSectors, updatedAt: new Date().toISOString() })
    }

    // 构建实时数据映射
    const sectorMap = {}
    for (const s of rawSectors) {
      sectorMap[s.code] = s
    }

    // 为单个板块计算四维评分
    function calcAnalysis(s) {
      if (!s) return null
      const capital = scoring.scoreCapital(
        { turnover: s.turnover, turnoverRate: s.turnoverRate || 1 },
        { mainInflow: s.mainInflow || 0, largeInflow: s.largeInflow || 0 }, 0
      )
      const totalStocks = (s.upCount || 0) + (s.downCount || 0)
      const sentiment = scoring.scoreSentiment(
        { turnoverRate: s.turnoverRate || 1, volumeRatio: 1, amplitude: s.amplitude || 2 },
        totalStocks > 0 ? { upCount: s.upCount || 0, downCount: s.downCount || 0, total: totalStocks } : null
      )
      const techScore = s.changePct > 2 ? 75 : s.changePct > 0 ? 55 : s.changePct > -2 ? 45 : 25
      const analysis = [
        { dimension: 'fundamental', score: 50, rating: 'neutral', summary: '', indicators: [] },
        capital, sentiment,
        { dimension: 'technical', score: techScore, rating: scoring.scoreToRating(techScore), summary: '', indicators: [] },
      ]
      return { analysis, totalScore: scoring.calcTotalScore(analysis), rating: scoring.scoreToRating(scoring.calcTotalScore(analysis)) }
    }

    // 按申万一级行业分组
    const groups = {}
    for (const s of rawSectors) {
      const shw = BK_TO_SHW[s.code] || '其他'
      if (!groups[shw]) groups[shw] = { name: shw, children: [], sameNameChild: null }
      const scored = calcAnalysis(s)
      const child = {
        code: s.code, name: s.name, level: 2, children: [],
        changePct: s.changePct, turnover: s.turnover, mainInflow: s.mainInflow,
        marketCap: +(s.totalMarketCap || 0).toFixed(2),
        floatMarketCap: +(s.circulationMarketCap || 0).toFixed(2),
        ...scored,
      }
      if (s.name === shw) {
        // 与一级行业同名 → 暂存，后面判断
        groups[shw].sameNameChild = child
      } else {
        groups[shw].children.push(child)
      }
    }
    // 如果一级行业下没有不同名的子项，则保留同名子项（如煤炭→煤炭、银行→银行Ⅱ）
    for (const g of Object.values(groups)) {
      if (g.children.length === 0 && g.sameNameChild) {
        g.children.push(g.sameNameChild)
      }
    }

    // 构建树：Level 1 = 申万一级行业
    // 优先使用同名板块的直接数据（如 BK1200 电力设备 +1.92%），否则用子级加权聚合
    const tree = Object.entries(groups)
      .sort(([, a], [, b]) => b.children.length - a.children.length)
      .map(([, group]) => {
        const kids = group.children.filter(c => c.totalScore != null)
        const totalTurnover = kids.reduce((s, c) => s + (c.turnover || 0), 0)
        // 有同名板块（如 BK1200 电力设备）→ 直接用它的数据作一级聚合
        const l1Source = group.sameNameChild
        return {
          code: l1Source ? l1Source.code : group.name,
          name: group.name,
          level: 1,
          children: group.children,
          changePct: l1Source
            ? l1Source.changePct
            : totalTurnover > 0
              ? +(kids.reduce((s, c) => s + c.changePct * (c.turnover || 0), 0) / totalTurnover).toFixed(4)
              : null,
          turnover: l1Source
            ? l1Source.turnover
            : +totalTurnover.toFixed(2),
          mainInflow: l1Source
            ? l1Source.mainInflow
            : +kids.reduce((s, c) => s + (c.mainInflow || 0), 0).toFixed(2),
          marketCap: l1Source
            ? l1Source.marketCap
            : +kids.reduce((s, c) => s + (c.marketCap || 0), 0).toFixed(2),
          totalScore: l1Source
            ? l1Source.totalScore
            : kids.length > 0
              ? Math.round(kids.reduce((s, c) => s + c.totalScore * (c.turnover || 1), 0) / Math.max(0.001, kids.reduce((s, c) => s + (c.turnover || 1), 0)))
              : null,
        }
      })

    res.json(tree)
  } catch (err) {
    console.error('tree error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 手动触发板块采集 ----
app.post('/api/sectors/capture', async (req, res) => {
  try {
    const result = await sectorDb.captureHourlySnapshot(em)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---- 板块多日资金流入汇总 ----
app.get('/api/sectors/inflow-summary', (req, res) => {
  try {
    const level = req.query.level ? parseInt(req.query.level) : undefined
    const data = sectorDb.getMultiDayInflowSummary({ level })
    res.json(data)
  } catch (err) {
    console.error('inflow-summary error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 个股日级资金流采集 ----
app.post('/api/stocks/capture-flows', async (req, res) => {
  try {
    const result = await sectorDb.captureStockDailyFlows(em, STOCK_POOL)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---- 个股资金流历史 ----
app.get('/api/stocks/:code/flow-history', (req, res) => {
  try {
    const { code } = req.params
    const limit = Math.min(120, parseInt(req.query.limit) || 60)
    const data = sectorDb.getStockDailyFlow(code, limit)
    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---- 板块详情（东财成分股 + 腾讯估值历史） ----
app.get('/api/sectors/:id', async (req, res) => {
  try {
    const bkCode = req.params.id.toUpperCase()
    if (!bkCode.startsWith('BK')) {
      return res.status(400).json({ error: '板块代码格式错误' })
    }

    // 获取板块成分股（东财实时）
    let constituentStocks
    let sectorName = bkCode
    try {
      constituentStocks = await em.getSectorStocks(bkCode)
      const allSectors = await em.getSectors()
      const sectorMeta = allSectors.find((s) => s.code.toUpperCase() === bkCode)
      if (sectorMeta) sectorName = sectorMeta.name
    } catch (e) {
      console.warn(`[观澜] 板块详情 ${bkCode} 东财不可用:`, e.message)
    }
    if (!constituentStocks || constituentStocks.length === 0) {
      return res.status(404).json({ error: `板块 ${bkCode} 数据暂不可用` })
    }

    // 聚合成分股数据
    const validPEs = constituentStocks.map((s) => s.pe).filter((v) => v > 0)
    const validPBs = constituentStocks.map((s) => s.pb).filter((v) => v > 0)
    const avgChangePct = avg(constituentStocks.map((s) => s.changePct))
    const totalTurnover = sum(constituentStocks.map((s) => s.turnover))
    const totalMarketCap = sum(constituentStocks.map((s) => s.marketCap))
    const avgPE = validPEs.length > 0 ? avg(validPEs) : 25
    const avgPB = validPBs.length > 0 ? avg(validPBs) : 2.5
    const avgTR = avg(constituentStocks.map((s) => s.turnoverRate))
    const avgAmp = avg(constituentStocks.map((s) => s.amplitude || 2))
    const totalMainInflow = sum(constituentStocks.map((s) => s.mainInflow || 0))
    const upCount = constituentStocks.filter((s) => s.changePct > 0).length

    // 四维评分（使用全成分股聚合数据）
    const fundamental = scoring.scoreFundamental({ pe: avgPE, pb: avgPB, marketCap: totalMarketCap }, null)
    const capital = scoring.scoreCapital(
      { turnover: totalTurnover, turnoverRate: avgTR },
      { mainInflow: totalMainInflow, largeInflow: totalMainInflow * 0.6 },
      0
    )
    const sentiment = scoring.scoreSentiment(
      { turnoverRate: avgTR, volumeRatio: 1, amplitude: avgAmp },
      { upCount, downCount: constituentStocks.length - upCount, total: constituentStocks.length }
    )
    const techScore = avgChangePct > 2 ? 75 : avgChangePct > 0 ? 55 : avgChangePct > -2 ? 45 : 25
    const technical = {
      dimension: 'technical', score: techScore, rating: scoring.scoreToRating(techScore),
      summary: avgChangePct > 2 ? '技术面强势' : avgChangePct > 0 ? '技术面中性偏强' : '技术面偏弱',
      indicators: [],
    }
    const analysis = [fundamental, capital, sentiment, technical]
    const totalScore = scoring.calcTotalScore(analysis)

    // 成分股评分
    const stocks = constituentStocks.map((s) => {
      const fs = scoring.scoreFundamental(s, null)
      const cs = scoring.scoreCapital(s, { mainInflow: s.mainInflow || 0 }, 0)
      const ss = scoring.scoreSentiment(s, null)
      const ts = { dimension: 'technical', score: 50, rating: 'neutral', summary: '', indicators: [] }
      const a = [fs, cs, ss, ts]
      return {
        id: s.code,
        name: s.name,
        code: s.code,
        sectorId: bkCode,
        sectorName,
        price: +(s.price || 0).toFixed(2),
        changePct: +(s.changePct || 0).toFixed(2),
        turnoverRate: +(s.turnoverRate || 0).toFixed(2),
        marketCap: +(s.marketCap || 0).toFixed(2),
        pe: +(s.pe || 0).toFixed(1),
        pb: +(s.pb || 0).toFixed(2),
        netInflow: +(s.mainInflow || 0).toFixed(2),
        totalScore: scoring.calcTotalScore(a),
        rating: scoring.scoreToRating(scoring.calcTotalScore(a)),
      }
    })

    // 板块估值历史（用第一只成分股代理）
    const firstCode = constituentStocks[0].code
    const valuationHistory = await tct.getValuationHistory(firstCode, 36)
      .catch(() => ({ points: [], peAvg: 0, peStd: 0, pbAvg: 0, pbStd: 0, pePercentile: 50, pbPercentile: 50 }))

    res.json({
      id: bkCode,
      name: sectorName,
      code: bkCode,
      changePct: +avgChangePct.toFixed(2),
      turnover: +totalTurnover.toFixed(2),
      leadingStock: stocks.sort((a, b) => b.changePct - a.changePct)[0]?.name || '',
      stockCount: constituentStocks.length,
      netInflow: +totalMainInflow.toFixed(2),
      totalScore,
      rating: scoring.scoreToRating(totalScore),
      analysis,
      trend5d: [],
      valuationHistory,
      stocks,
    })
  } catch (err) {
    console.error('sector detail error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 个股列表（全市场分页） ----
app.get('/api/stocks', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1)
    const size = Math.min(500, Math.max(10, parseInt(req.query.size) || 200))
    const sort = req.query.sort || ''
    
    const allStocks = db.getStockList()
    if (!allStocks.length) {
      return res.json({ stocks: [], total: 0, page: 1, size, totalPages: 0 })
    }

    // 首次加载时懒构建股票→板块映射（只构建一次，后续走缓存）
    const sectorMap = await getStockSectorMap()

    // 排序模式下拉取全量数据，否则分页
    const needsFullData = !!sort
    const stocksToQuery = needsFullData ? allStocks : allStocks.slice((page - 1) * size, (page - 1) * size + size)
    const codes = stocksToQuery.map(s => s.code)

    // 批量查询腾讯实时行情 + 东财主力资金（每批500只，并行）
    const BATCH = 500
    const allQuotes = []
    const inflowMap = {}
    let inflowFailed = false
    for (let i = 0; i < codes.length; i += BATCH) {
      const batch = codes.slice(i, i + BATCH)
      const [quotes, inflows] = await Promise.all([
        tct.getStockQuotesBatch(batch),
        em.getMainInflowBatch(batch).catch(() => { inflowFailed = true; return {} }),
      ])
      allQuotes.push(...quotes)
      Object.assign(inflowMap, inflows)
    }

    // 缓存个股资金流数据（盘中成功时写入，收盘后降级使用）
    const cacheNow = new Date().toISOString()
    if (!inflowFailed && Object.keys(inflowMap).length > 0) {
      cache.writeStockInflows({ updatedAt: cacheNow, inflows: inflowMap })
    } else {
      // 东财失败 → 用缓存兜底
      const cached = cache.readStockInflows()
      if (cached?.inflows && Object.keys(cached.inflows).length > 0) {
        Object.assign(inflowMap, cached.inflows)
        console.log(`[个股] 资金流降级缓存: ${Object.keys(cached.inflows).length} 只`)
      } else {
        console.log('[个股] 无资金流缓存数据，显示待同步')
      }
    }

    const stocks = allQuotes.map((q) => {
      const sectorInfo = sectorMap[q.code] || STOCK_POOL.find((s) => s.code === q.code) || {}
      // 简化的综合评分（基于实时行情字段）
      const scorePE = q.pe > 0 ? Math.round(50 - Math.min(q.pe, 100) * 0.3) : 40
      const scoreChange = Math.round(50 + q.changePct * 3)
      const scoreTurnover = q.turnoverRate < 1 ? 40 : q.turnoverRate < 3 ? 80 : q.turnoverRate < 8 ? 60 : 30
      const scoreMC = q.marketCap > 1000 ? 70 : q.marketCap > 200 ? 55 : q.marketCap > 50 ? 45 : 35
      const totalScore = Math.round((scorePE + scoreChange + scoreTurnover + scoreMC) / 4)
      const rating = scoring.scoreToRating(totalScore)
      return {
        id: q.code,
        name: q.name,
        code: q.code,
        sectorId: sectorInfo.sectorId || '',
        sectorName: sectorInfo.sectorName || '',
        price: +q.price.toFixed(2),
        changePct: +q.changePct.toFixed(2),
        turnoverRate: +q.turnoverRate.toFixed(2),
        marketCap: +q.marketCap.toFixed(2),
        floatMarketCap: +q.floatMarketCap.toFixed(2),
        pe: +q.pe.toFixed(1),
        pb: +q.pb.toFixed(2),
        netInflow: inflowMap[q.code] != null ? +(inflowMap[q.code]).toFixed(2) : null,
        totalScore,
        rating,
      }
    })

    // 排序
    if (sort === 'rating') stocks.sort((a, b) => b.totalScore - a.totalScore)
    else if (sort === 'changePct') stocks.sort((a, b) => b.changePct - a.changePct)
    else if (sort === 'turnover') stocks.sort((a, b) => b.turnoverRate - a.turnoverRate)
    else if (sort === 'pe') stocks.sort((a, b) => (a.pe > 0 ? a.pe : 999) - (b.pe > 0 ? b.pe : 999))
    else if (sort === 'netInflow') stocks.sort((a, b) => b.netInflow - a.netInflow)
    else if (sort === 'mainEffort') stocks.sort((a, b) => {
      const aRatio = a.netInflow / a.floatMarketCap
      const bRatio = b.netInflow / b.floatMarketCap
      return bRatio - aRatio
    })

    // 分页（排序后取当前页）
    if (needsFullData) {
      const totalPages = Math.ceil(stocks.length / size)
      const start = (page - 1) * size
      const pageStocks = stocks.slice(start, start + size)
      return res.json({ stocks: pageStocks, total: stocks.length, page, size, totalPages })
    }

    res.json({ stocks, total: allStocks.length, page, size, totalPages: Math.ceil(allStocks.length / size) })
  } catch (err) {
    console.error('stocks error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 全市场股票搜索 ----
app.get('/api/stocks/search', async (req, res) => {
  try {
    const { q } = req.query
    if (!q || q.trim() === '') {
      return res.json({ stocks: [], total: db.getStockList().length })
    }
    const results = db.searchStocks(q, 30)
    const sectorMap = await getStockSectorMap()
    const enriched = results.map(s => ({
      ...s,
      id: s.code,
      sectorId: (sectorMap[s.code] || {}).sectorId || '',
      sectorName: (sectorMap[s.code] || {}).sectorName || '',
    }))
    res.json({ stocks: enriched, total: db.getStockList().length })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---- 个股详情 ----
app.get('/api/stocks/:code', async (req, res) => {
  try {
    const { code } = req.params
    const poolItem = STOCK_POOL.find((s) => s.code === code)
    const stockInfo = poolItem || db.getStockInfo(code)
    if (!stockInfo) return res.status(404).json({ error: '股票代码不存在' })

    const [quote, klines, valuationHistory, capitalFlow, financials, sectorMap] = await Promise.all([
      tct.getStockQuote(code),
      tct.getKlines(code, 60, 'day'),
      tct.getValuationHistoryWithEPS(code, 36).catch(() => ({ points: [], peAvg: 0, peStd: 0, pbAvg: 0, pbStd: 0, pePercentile: 50, pbPercentile: 50, epsHistory: [] })),
      em.getStockCapitalFlow(code).catch(() => []),
      em.getFinancials(code).catch(() => null),
      getStockSectorMap(),
    ])

    const sectorInfo = sectorMap[code] || poolItem || {}

    // 同步使用 f62 主力净流入（与股票列表同源）
    const stockInflowMap = await em.getMainInflowBatch([code]).catch(() => ({}))
    const baseNetInflow = +(stockInflowMap[code] || 0).toFixed(2)

    if (!quote) return res.status(404).json({ error: '股票不存在' })

    // 个股资金流（统一使用 f62 同源数据）
    const capitalData = {
      mainInflow: baseNetInflow,
      largeInflow: (() => {
        const lf = (capitalFlow || []).filter(f => f.main)
        return lf.length > 0 ? +((lf[lf.length - 1].large + lf[lf.length - 1].superLarge) / 100000000).toFixed(2) : 0
      })(),
    }

    // 四维评分（接入真实资金流和财务数据）
    const fundamental = scoring.scoreFundamental(quote, financials)
    const capital = scoring.scoreCapital(quote, capitalData, 0)
    const sentiment = scoring.scoreSentiment(quote, null)
    const technical = scoring.scoreTechnical(klines)
    const analysis = [fundamental, capital, sentiment, technical]
    const totalScore = scoring.calcTotalScore(analysis)

    // 大资金持仓数据（来自数据库 + 内置标签补充）
    const stockSummary = db.getStockSummary(code)
    const builtinTags = !stockSummary ? db.getBuiltinTags(code) : null
    const stockHolding = stockSummary ? {
      fundHolding: stockSummary.fundHolding || null,
      fundReduce: null,
      zhjHolding: stockSummary.zhjHolding || null,
      bigFundHolding: stockSummary.bigFundHolding || null,
      socialSecurityHolding: stockSummary.socialSecurityHolding || null,
      insuranceHolding: stockSummary.insuranceHolding || null,
      qfiiHolding: stockSummary.qfiiHolding || null,
      brokerHolding: stockSummary.brokerHolding || null,
      hkConnectHolding: stockSummary.hkConnectHolding || null,
    } : builtinTags ? {
      hkConnectHolding: builtinTags.hkConnectHolding || null,
      zhjHolding: builtinTags.zhjHolding || null,
      bigFundHolding: builtinTags.bigFundHolding || null,
      fundHolding: null, fundReduce: null, socialSecurityHolding: null,
      insuranceHolding: null, qfiiHolding: null, brokerHolding: null,
    } : null

    res.json({
      id: code,
      name: quote.name,
      code: quote.code,
      sectorId: sectorInfo.sectorId || '',
      sectorName: sectorInfo.sectorName || stockInfo?.name || '',
      price: +quote.price.toFixed(2),
      changePct: +quote.changePct.toFixed(2),
      turnoverRate: +quote.turnoverRate.toFixed(2),
      marketCap: +quote.marketCap.toFixed(2),
      floatMarketCap: +quote.floatMarketCap.toFixed(2),
      pe: +quote.pe.toFixed(1),
      pb: +quote.pb.toFixed(2),
      totalScore,
      rating: scoring.scoreToRating(totalScore),
      analysis,
      klines,
      capitalFlow: (() => {
        // 合并数据库积累数据 + 当天实时数据
        const dbFlows = sectorDb.getStockDailyFlow(code, 60)
        const flowMap = new Map()
        for (const f of dbFlows) flowMap.set(f.date, { main: f.main_inflow * 1e8 })
        for (const f of (capitalFlow || [])) flowMap.set(f.date, { main: f.main })
        return [...flowMap.entries()]
          .map(([date, v]) => ({ date, main: v.main }))
          .sort((a, b) => a.date.localeCompare(b.date))
          .slice(-60)
      })(),
      netInflow: baseNetInflow,
      riskEvents: await riskEvents.getRiskEventsByStock(poolItem?.name || quote.name).catch(() => []),
      valuationHistory,
      institutional: stockHolding || null,
    })
  } catch (err) {
    console.error('stock detail error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 刷新全市场机构持仓数据 ----
app.post('/api/refresh-holdings', async (req, res) => {
  try {
    // 运行刷新脚本
    const { execSync } = require('child_process')
    const script = path.resolve(__dirname, 'refresh-holdings.cjs')
    const output = execSync(`node "${script}"`, { encoding: 'utf-8', timeout: 15000 })
    const result = JSON.parse(output.trim())
    res.json(result)
  } catch (err) {
    // 回退：只读取现有数据
    try {
      const records = db.readAll()
      const stats = {}
      for (const r of records) stats[r.holder_type] = (stats[r.holder_type] || 0) + 1
      res.json({
        ok: true,
        total: records.length,
        north: stats.north || 0,
        zhj: stats.zhj || 0,
        big_fund: stats.big_fund || 0,
        social_security: stats.social_security || 0,
        insurance: stats.insurance || 0,
        qfii: stats.qfii || 0,
        broker: stats.broker || 0,
        autoUpdateSchedule: '每天 15:30',
      })
    } catch(e2) {
      res.status(500).json({ ok: false, error: err.message })
    }
  }
})

// ---- 实时财经新闻（新浪财经滚动新闻） ----
app.get('/api/news', async (req, res) => {
  try {
    const https = require('https')
    const url = 'https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=2509&k=&num=20&page=1'
    https.get(url, (resp) => {
      let body = ''
      resp.on('data', c => body += c)
      resp.on('end', () => {
        try {
          const data = JSON.parse(body)
          const items = (data?.result?.data || []).map((item, i) => ({
            id: `news_${i}`,
            title: item.title || '',
            url: item.url || '',
            ctime: item.ctime || '',
          }))
          res.json(items)
        } catch (e) {
          res.json([])
        }
      })
    }).on('error', () => res.json([]))
  } catch (err) {
    console.error('news error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 宏观流动性监测（美元/人民币/国债） ----
// ---- 宏观流动性监测（美元/人民币/国债） ----
const MACRO_CACHE_FILE = path.resolve(__dirname, 'data', 'macro-cache.json')

function readMacroCache() {
  try {
    if (!fs.existsSync(MACRO_CACHE_FILE)) return {}
    return JSON.parse(fs.readFileSync(MACRO_CACHE_FILE, 'utf-8'))
  } catch { return {} }
}

function writeMacroCache(data) {
  fs.writeFileSync(MACRO_CACHE_FILE, JSON.stringify(data, null, 2), 'utf-8')
}

// 接收外部更新的美债/中国债收益率（自动化通过 WebFetch 获取后写入）
app.post('/api/macro-liquidity/update-rate', (req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', () => {
    try {
      const params = new URLSearchParams(req.url?.split('?')[1] || '')
      const us10y = parseFloat(params.get('us10y') || req.query?.us10y)
      const cn10y = parseFloat(params.get('cn10y') || req.query?.cn10y)
      const cache = readMacroCache()
      if (!isNaN(us10y)) { cache.us10y = +us10y.toFixed(3); cache.us10yUpdatedAt = new Date().toISOString() }
      if (!isNaN(cn10y)) { cache.cn10y = +cn10y.toFixed(3); cache.cn10yUpdatedAt = new Date().toISOString() }
      writeMacroCache(cache)
      res.json({ ok: true, us10y: cache.us10y, cn10y: cache.cn10y })
    } catch (e) {
      res.json({ ok: false, error: e.message })
    }
  })
})

app.get('/api/macro-liquidity', async (req, res) => {
  try {
    const https = require('https')
    const cache = readMacroCache()
    const result = { usdCny: null, dxy: null, cn10y: cache.cn10y || null, us10y: cache.us10y || null, spread: null }

    // 计算中美利差
    if (result.cn10y !== null && result.us10y !== null) {
      result.spread = +(result.cn10y - result.us10y).toFixed(3)
    }

    // 1. USD/CNY 在岸汇率（新浪财经）
    await new Promise((resolve) => {
      https.get('https://hq.sinajs.cn/list=fx_susdcny', { headers: { 'Referer': 'https://finance.sina.com.cn' } }, (resp) => {
        let body = ''
        resp.on('data', c => body += c)
        resp.on('end', () => {
          const m = body.match(/"([^"]+)"/)
          if (m) {
            const parts = m[1].split(',')
            result.usdCny = parseFloat(parts[1]) || null
          }
          resolve()
        })
      }).on('error', () => resolve())
    })

    // 2. 美元指数 (从 exchangerate-api 估算)
    await new Promise((resolve) => {
      const url = 'https://api.exchangerate-api.com/v4/latest/USD'
      https.get(url, (resp) => {
        let body = ''
        resp.on('data', c => body += c)
        resp.on('end', () => {
          try {
            const data = JSON.parse(body)
            if (data?.rates) {
              // 粗略美元指数 = 50.143 * EUR/USD^(-0.576) * ... 简化版
              const eur = data.rates.EUR || 1
              const jpy = data.rates.JPY || 1
              const gbp = data.rates.GBP || 1
              const cad = data.rates.CAD || 1
              const sek = data.rates.SEK || 1
              const chf = data.rates.CHF || 1
              // DXY = 50.14348112 × EURUSD^(-0.576) × USDJPY^(0.136) × GBPUSD^(-0.119) × USDCAD^(0.091) × USDSEK^(0.042) × USDCHF^(0.036)
              const eurusd = 1 / eur
              const usdjpy = jpy
              const gbpusd = 1 / gbp
              const usdcad = cad
              const usdsek = sek
              const usdchf = chf
              result.dxy = +(50.14348112 * Math.pow(eurusd, -0.576) * Math.pow(usdjpy, 0.136) * Math.pow(gbpusd, -0.119) * Math.pow(usdcad, 0.091) * Math.pow(usdsek, 0.042) * Math.pow(usdchf, 0.036)).toFixed(2)
            }
          } catch (e) {}
          resolve()
        })
      }).on('error', () => resolve())
    })

    // 3. 美国10年期国债收益率（从缓存读取，由外部自动化更新）
    // 已通过 cache.us10y 在开头初始化

    // 4. 计算中美利差
    if (result.cn10y !== null && result.us10y !== null) {
      result.spread = +(result.cn10y - result.us10y).toFixed(3)
    }

    res.json(result)
  } catch (err) {
    console.error('macro liquidity error:', err.message)
    res.status(500).json({ error: err.message })
  }
})
// ---- M1/M2 剪刀差 ----
const M1M2_CACHE_FILE = path.resolve(__dirname, 'data', 'm1m2-cache.json')
function ensureM1M2Cache() {
  if (!fs.existsSync(M1M2_CACHE_FILE)) {
    fs.writeFileSync(M1M2_CACHE_FILE, JSON.stringify({
      updatedAt: '2026-07-29T22:24:00',
      series: [
        { date: '2026-06', m1: 1184775.53, m2: 3567108.43 },
        { date: '2026-05', m1: 1148891.41, m2: 3536688.92 },
        { date: '2026-04', m1: 1145833.73, m2: 3530425.21 },
        { date: '2026-03', m1: 1193202.99, m2: 3538636.53 },
        { date: '2026-02', m1: 1159258.82, m2: 3492159.91 },
        { date: '2026-01', m1: 1179680.52, m2: 3471860.39 },
        { date: '2025-12', m1: 1155146.50, m2: 3402948.06 },
        { date: '2025-11', m1: 1128866.64, m2: 3369890.52 },
        { date: '2025-10', m1: 1119962.73, m2: 3351312.31 },
        { date: '2025-09', m1: 1131455.07, m2: 3353771.03 },
        { date: '2025-08', m1: 1112255.70, m2: 3319831.44 },
        { date: '2025-07', m1: 1110586.92, m2: 3299429.06 },
      ],
    }, null, 2), 'utf-8')
  }
}
app.get('/api/m1m2', (req, res) => {
  try {
    ensureM1M2Cache()
    const data = JSON.parse(fs.readFileSync(M1M2_CACHE_FILE, 'utf-8'))
    const series = data.series || []
    // 计算同比增速（假设上一年同月为前12个条目）
    const enriched = series.map((item, i) => {
      const prev = i >= 12 ? series[i - 12] : null
      const m1Growth = prev ? +((item.m1 - prev.m1) / prev.m1 * 100).toFixed(2) : null
      const m2Growth = prev ? +((item.m2 - prev.m2) / prev.m2 * 100).toFixed(2) : null
      return { ...item, m1Growth, m2Growth, spread: m1Growth != null && m2Growth != null ? +(m1Growth - m2Growth).toFixed(2) : null }
    })
    const latest = enriched[enriched.length - 1]
    res.json({
      updatedAt: data.updatedAt,
      latest: { date: latest.date, m1: +(latest.m1 / 10000).toFixed(2), m2: +(latest.m2 / 10000).toFixed(2), m1YoY: latest.m1Growth, m2YoY: latest.m2Growth, spread: latest.spread },
      series: enriched.map(s => ({ date: s.date, m1Growth: s.m1Growth, m2Growth: s.m2Growth, spread: s.spread })),
    })
  } catch (err) { console.error('m1m2 error:', err.message); res.status(500).json({ error: err.message }) }
})

app.get('/api/liquidity', async (req, res) => {
  try {
    // 1. 从 sectors 获取全市场量比和换手率
    const sectors = await em.getSectors().catch(() => [])
    const activeSectors = sectors.filter(s => s.turnover > 0)
    const avgVolumeRatio = activeSectors.length > 0
      ? +(activeSectors.reduce((s, x) => s + x.amplitude, 0) / activeSectors.length).toFixed(2)
      : null

    // 2. 两融余额
    const marginData = db.readMargin()
    const latestMargin = marginData.length > 0 ? marginData[marginData.length - 1] : null

    // 3. 全市场成交额
    const totalTurnover = activeSectors.reduce((s, x) => s + (x.turnover || 0), 0)

    // 4. 涨跌停比例（市场深度）
    const limitUp = activeSectors.reduce((s, x) => s + (x.upCount || 0), 0)
    const limitDown = activeSectors.reduce((s, x) => s + (x.downCount || 0), 0)

    res.json({
      totalTurnover: +totalTurnover.toFixed(0),
      avgVolumeRatio,
      marginBalance: latestMargin ? +(latestMargin.balance || 0).toFixed(0) : null,
      marginBuy: latestMargin ? +(latestMargin.marginBuy || 0).toFixed(0) : null,
      limitUp, limitDown,
      note: activeSectors.length > 0 ? `基于${activeSectors.length}个行业板块` : '盘中数据',
    })
  } catch (err) {
    console.error('liquidity error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 两市成交额历史 ----
app.get('/api/turnover-history', (req, res) => {
  try {
    const dataDir = path.resolve(__dirname, 'data')
    const file = path.join(dataDir, 'turnover-history.json')
    let records = []
    if (fs.existsSync(file)) {
      try { records = JSON.parse(fs.readFileSync(file, 'utf-8')) } catch (e) {}
    }
    // 没有任何记录时返回一条空记录让图表能渲染
    if (records.length === 0) {
      records = [{ date: new Date().toISOString().slice(0, 10), total: 0 }]
    }
    res.json(records.slice(-30))
  } catch (err) {
    console.error('turnover history error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ---- 北向资金30日历史（数据源: 同花顺 hsgtApi） ----
app.get('/api/north-flow-history', (req, res) => {
  try {
    let data = db.readNorthFlow()

    // 如果当天数据缺失，通过同花顺 hsgtApi 获取
    const today = new Date()
    const todayStr = today.toISOString().slice(0, 10)
    const hasToday = data.some(r => r.date === todayStr)
    const isTradeTime = today.getHours() >= 9 && today.getHours() < 16 &&
      today.getDay() >= 1 && today.getDay() <= 5

    // 盘中数据缺失 或 收盘后当天数据仍缺失 → 触发更新
    if (!hasToday) {
      try {
        const pythonPath = 'C:/Users/wen-q/.workbuddy/binaries/python/versions/3.13.12/python.exe'
        const scriptPath = path.resolve(__dirname, 'northbound_query.py')
        require('child_process').execSync(
          `"${pythonPath}" "${scriptPath}"`,
          { timeout: 30000, encoding: 'utf-8' }
        )
        // 脚本已写入 north-flow-db.json
        data = db.readNorthFlow()
        console.log(`[观澜] hsgtApi北向数据已更新: 共${data.length}条`)
      } catch (e) {
        console.log('[观澜] hsgtApi获取北向数据失败:', e.message)
      }
    }

    res.json(data)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// ---- 两融余额30日历史 ----
app.get('/api/margin-history', async (req, res) => {
  try {
    // 优先从数据库读取
    let data = db.readMargin()
    if (data.length >= 10) {
      return res.json(data)
    }
    // 数据库数据不足，通过 Python akshare 获取
    const pythonPath = 'C:/Users/wen-q/.workbuddy/binaries/python/versions/3.13.12/python.exe'
    const scriptPath = path.resolve(__dirname, 'data', 'fetch-margin.py')
    const output = require('child_process').execSync(`"${pythonPath}" "${scriptPath}"`, {
      timeout: 30000, encoding: 'utf-8'
    }).trim()
    data = JSON.parse(output)
    db.writeMargin(data)
    res.json(data)
  } catch (err) {
    console.error('margin-history error:', err.message)
    // 最后的回退：尝试读取已有数据库
    const fallback = db.readMargin()
    if (fallback.length > 0) return res.json(fallback)
    res.status(500).json({ error: err.message })
  }
})

// ---- 风险事件日历（限售解禁 + 分红除权 + 宏观事件 + 政策会议） ----
app.get('/api/risk-events', async (req, res) => {
  try {
    const events = await riskEvents.getAllRiskEvents()
    res.json(events)
  } catch (err) {
    console.error('risk-events error:', err.message)
    res.status(500).json({ error: err.message })
  }
})

// ============ 工具函数 ============

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0
}

function sum(arr) {
  return arr.reduce((a, b) => a + b, 0)
}

// SPA 兜底路由（生产模式，非 API 请求都返回 index.html）
if (fs.existsSync(DIST_DIR)) {
  app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) return
    res.sendFile(path.join(DIST_DIR, 'index.html'))
  })
}

// ============ 启动 ============

app.listen(PORT, () => {
  console.log(`[观澜] 后端 API 服务已启动: http://localhost:${PORT}`)
  console.log(`[观澜] 数据源: 腾讯财经 API`)
  
  // 启动时初始化全市场股票数据库
  const result = db.initStockList()
  if (result.ok) {
    console.log(`[观澜] 全市场数据库: ${result.count} 只股票 (来源: ${result.source})`)
  } else {
    console.warn(`[观澜] 全市场数据库未就绪: ${result.error}`)
  }
  
  // 资金流向5分钟自动采集（交易时段 9:00-15:00，仅工作日）
  async function autoCaptureFundFlow() {
    const now = new Date()
    const h = now.getHours()
    const m = now.getMinutes()
    const d = now.getDay()
    const isTradeDay = d >= 1 && d <= 5
    const isTradeTime = (h >= 10 && h <= 11) || (h >= 13 && h <= 14) || (h === 9 && m >= 30) || (h === 15)
    if (!isTradeDay || !isTradeTime) return
    try {
      const http = require('http')
      const req = http.get('http://localhost:' + PORT + '/api/market/fund-flow/snapshot', { method: 'POST' }, (res) => {
        let body = ''
        res.on('data', c => body += c)
        res.on('end', () => {
          try {
            const r = JSON.parse(body)
            if (r.ok) console.log(`[资金流向] 自动采集: ${r.timestamp} (第${r.count || '?'}次)`)
          } catch (e) {}
        })
      })
      req.on('error', () => {})
      req.setTimeout(10000, () => req.destroy())
      req.end()
    } catch (e) {}
  }
  // 首次延迟30秒启动，之后每5分钟
  setTimeout(() => {
    autoCaptureFundFlow()
    setInterval(autoCaptureFundFlow, 5 * 60 * 1000)
  }, 30000)
  console.log('[资金流向] 自动采集已启动（5分钟/次，交易时段）')
})
