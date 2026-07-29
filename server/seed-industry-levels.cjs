/**
 * 行业层级数据初始化脚本
 * 从东财拉取一/二/三级行业分类并写入 sector-db
 * 用法: node seed-industry-levels.cjs
 *
 * 东财 API 晚间可能不可用(502)，交易时段自动恢复
 */

const em = require('./eastmoney.cjs')
const sdb = require('./sector-db.cjs')

async function main() {
  console.log('[行业层级] 开始从东财拉取行业分类...')

  const hierarchy = await em.getIndustryHierarchy()

  if (!hierarchy || hierarchy.length === 0) {
    console.log('[行业层级] ❌ 东财 API 不可用，跳过')
    console.log('[行业层级] 请在交易时段(9:30-15:00)重试')
    process.exit(1)
  }

  // 统计各级数量
  const countL1 = hierarchy.filter(s => s.level === 1).length
  const countL2 = hierarchy.filter(s => s.level === 2).length
  const countL3 = hierarchy.filter(s => s.level === 3).length

  // 写入数据库
  sdb.upsertIndustryLevels(hierarchy)

  console.log(`[行业层级] ✅ 写入完成`)
  console.log(`  一级行业: ${countL1} 个`)
  console.log(`  二级行业: ${countL2} 个`)
  console.log(`  三级行业: ${countL3} 个`)
  console.log(`  共计: ${hierarchy.length} 个行业`)

  // 打印树形结构
  const roots = sdb.getIndustryTree()
  console.log(`\n[行业层级] 树形结构:`)
  for (const r of roots.slice(0, 10)) {
    console.log(`  📂 ${r.name}`)
    for (const c of r.children.slice(0, 5)) {
      console.log(`    📁 ${c.name}`)
      for (const g of c.children.slice(0, 3)) {
        console.log(`      📄 ${g.name}`)
      }
      if (c.children.length > 3) console.log(`      ... 还有 ${c.children.length - 3} 个`)
    }
    if (r.children.length > 5) console.log(`    ... 还有 ${r.children.length - 5} 个`)
  }
  if (roots.length > 10) console.log(`  ... 还有 ${roots.length - 10} 个一级行业`)
}

main().catch(err => {
  console.error('[行业层级] 错误:', err.message)
  process.exit(1)
})
