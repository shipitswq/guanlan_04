/**
 * 测试直接访问 TDX hub API
 * 不经过 MCP 代理
 */
const url = 'http://tdxhub.icfqs.com:7615/TQLEX'
const TOKEN = JSON.parse(process.env.CODEBUDDY_MCP_CONFIG)
  .mcpServers['connector-proxy']
  .headers.Authorization.replace('Bearer ', '')

const tests = [
  // 格式1: Entry + Params
  { body: { Entry: 'TdxSharePCCW.tdxf10_gg_gdyj', Params: ['002371', 'ltgd'] }, label: 'Entry+Params' },
  // 格式2: 把Entry改成其他字段名
  { body: { Name: 'TdxSharePCCW.tdxf10_gg_gdyj', Params: ['002371', 'ltgd'] }, label: 'Name+Params' },
  // 格式3: 扁平格式
  { body: { Entry: 'TdxSharePCCW.tdxf10_gg_gdyj', code: '002371', fixedTag: 'ltgd' }, label: '扁平格式' },
]

async function run() {
  for (const t of tests) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', token: TOKEN },
        body: JSON.stringify(t.body),
      })
      const text = await r.text()
      console.log(t.label + ':', text.slice(0, 300))
    } catch (e) {
      console.log(t.label + ' ERROR:', e.message)
    }
  }
}
run()
