/**
 * 观澜 - MCP 客户端（最小化实现，无外部依赖）
 * 通过 HTTP SSE 传输协议调用 MCP 工具
 */
const http = require('http')
const { EventEmitter } = require('events')

class MCPClient extends EventEmitter {
  constructor(proxyUrl, token, sessionId) {
    super()
    this.proxyUrl = new URL(proxyUrl)
    this.token = token
    this.sessionId = sessionId
    this.requestId = 0
    this.initialized = false
    this._pending = new Map() // id -> { resolve, reject, timeout }
  }

  nextId() { return ++this.requestId }

  /** 发送 JSON-RPC 请求 */
  async _request(method, params, options = {}) {
    const id = options.noId ? null : this.nextId()
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, params })

    return new Promise((resolve, reject) => {
      const postData = JSON.stringify({ jsonrpc: '2.0', id, method, params })
      if (id) this._pending.set(id, { resolve, reject })

      const req = http.request({
        hostname: this.proxyUrl.hostname,
        port: this.proxyUrl.port,
        path: this.proxyUrl.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.token,
          'X-WorkBuddy-Session-Id': this.sessionId,
          'Accept': 'application/json, text/event-stream',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          // 尝试解析为 SSE
          const lines = data.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const msg = JSON.parse(line.slice(6))
                if (msg.id && this._pending.has(msg.id)) {
                  const p = this._pending.get(msg.id)
                  this._pending.delete(msg.id)
                  if (msg.error) p.reject(new Error(msg.error.message))
                  else p.resolve(msg.result)
                } else if (method === 'notifications/initialized') {
                  resolve({ notified: true })
                }
              } catch (e) { /* skip malformed */ }
            }
          }
          // 如果是普通 JSON 响应（非 SSE）
          if (!id) resolve({})
          else if (data.startsWith('{')) {
            try {
              const j = JSON.parse(data)
              if (j.error) reject(new Error(j.error.message))
              else resolve(j.result || j)
            } catch(e) {
              if (id && this._pending.has(id)) {
                const p = this._pending.get(id)
                this._pending.delete(id)
                p.reject(new Error('Parse error: ' + data.slice(0,100)))
              }
            }
          }
        })
      })
      req.on('error', reject)
      req.write(postData)
      req.end()
    })
  }

  /** 初始化 MCP 会话 */
  async initialize() {
    await this._request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'guanlan-refresh', version: '1.0' }
    })
    await this._request('notifications/initialized', {}, { noId: true })
    await new Promise(r => setTimeout(r, 200)) // 等待init完成
    this.initialized = true
  }

  /** 调用 MCP 工具 */
  async callTool(name, args) {
    if (!this.initialized) await this.initialize()
    return this._request('tools/call', { name, arguments: args })
  }
}

module.exports = { MCPClient }
