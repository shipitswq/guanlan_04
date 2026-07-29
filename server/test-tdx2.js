/**
 * 测试直接访问 TDX hub - 更多格式
 */
const url = 'http://tdxhub.icfqs.com:7615/TQLEX'
const TOKEN = JSON.parse(process.env.CODEBUDDY_MCP_CONFIG)
  .mcpServers['connector-proxy']
  .headers.Authorization.replace('Bearer ', '')

async function test(label, opts) {
  try {
    const r = await fetch(url, opts)
    const text = await r.text()
    console.log(label + ':', text.slice(0, 400))
  } catch (e) {
    console.log(label + ' ERROR:', e.message)
  }
}

async function run() {
  // 纯文本格式 (TQL格式)
  await test('TQL格式', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', token: TOKEN },
    body: "Execute('TdxSharePCCW.tdxf10_gg_gdyj', '002371', 'ltgd')"
  })

  // GET方式
  await test('GET方式', {
    method: 'GET',
    headers: { token: TOKEN },
  })

  // query参数
  await test('query参数', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', token: TOKEN },
    body: JSON.stringify({ entry: 'TdxSharePCCW.tdxf10_gg_gdyj', code: '002371', tag: 'ltgd', mode: 'code-fixed-tag' })
  })

  // form-urlencoded
  await test('form格式', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', token: TOKEN },
    body: 'entry=TdxSharePCCW.tdxf10_gg_gdyj&code=002371&tag=ltgd'
  })
  
  // 带分隔符的TQL
  await test('TQL pipe', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', token: TOKEN },
    body: 'TdxSharePCCW.tdxf10_gg_gdyj|002371|ltgd'
  })
}
run()
