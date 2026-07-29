import requests, json, time, random
from datetime import datetime, timedelta

print("=" * 70)
print("北向资金数据源全面测试报告")
print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print("=" * 70)

# ============================================================
# 1. 同花顺 hsgtApi — 北向实时分钟流向（最佳免费源）
# ============================================================
print("\n" + "=" * 70)
print("【数据源1】同花顺 hsgtApi — 北向实时分钟流向")
print("   URL: https://data.hexin.cn/market/hsgtApi/method/dayChart/")
print("   特点: 零鉴权, 262个时间点(09:10~15:00), 沪/深股通分别返回")
print("=" * 70)

url1 = "https://data.hexin.cn/market/hsgtApi/method/dayChart/"
headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0.0.0 Safari/537.36",
    "Referer": "https://data.hexin.cn/",
}
r1 = requests.get(url1, headers=headers, timeout=10)
d1 = r1.json()

times = d1.get("time", [])
hgt = d1.get("hgt", [])
sgt = d1.get("sgt", [])
n = len(times)
hgt_fixed = hgt[:n] + [None] * (n - len(hgt))
sgt_fixed = sgt[:n] + [None] * (n - len(sgt))

print(f"  ✅ 成功! 返回 {n} 个时间点的分钟级数据")
print(f"  最新时间: {times[-1]}")
if hgt_fixed[-1] is not None and sgt_fixed[-1] is not None:
    total = float(hgt_fixed[-1]) + float(sgt_fixed[-1])
    print(f"  沪股通净买入: {hgt_fixed[-1]} 亿  |  深股通净买入: {sgt_fixed[-1]} 亿")
    print(f"  北向合计净买入: {total:.2f} 亿元")
    print(f"  当日北向资金方向: {'净流入' if total > 0 else '净流出'} ({total:+.2f}亿)")

# 最近5个非空数据点
print("\n  当日北向分钟流向(收盘前5个时间点):")
count = 0
for i in range(n - 1, -1, -1):
    if hgt_fixed[i] is not None and sgt_fixed[i] is not None:
        total = float(hgt_fixed[i]) + float(sgt_fixed[i])
        print(f"    {times[i]}: 沪={hgt_fixed[i]:>8}亿 | 深={sgt_fixed[i]:>8}亿 | 合计={total:>8.2f}亿")
        count += 1
        if count >= 5:
            break

# ============================================================
# 2. 东财 push2his — 沪深港通日线（历史每日总量）
# ============================================================
print("\n" + "=" * 70)
print("【数据源2】东财 push2his — 沪深港通每日额度与净买入")
print("   URL: https://push2his.eastmoney.com/api/qt/kamt.kline/get")
print("   特点: 历史日线, 可获取连续多日北向总量")
print("   状态: 实测2024-08后净买额字段可能为空(NaN)")
print("=" * 70)

url2 = "https://push2his.eastmoney.com/api/qt/kamt.kline/get"
params2 = {
    "fields1": "f1,f2,f3,f5",
    "fields2": "f51,f52,f53,f54,f55,f56",
    "klt": 101,
    "lmt": 10,
}
headers2 = {
    "User-Agent": headers["User-Agent"],
    "Referer": "https://data.eastmoney.com/",
}
r2 = requests.get(url2, params=params2, headers=headers2, timeout=10)
d2 = r2.json()
klines = d2.get("data", {}).get("klines", [])
print(f"  ✅ 成功! 返回 {len(klines)} 个交易日数据")
for line in klines[-5:]:
    parts = line.split(",")
    if len(parts) >= 6:
        print(f"    {parts[0]}: 沪股通={parts[1]}(亿) 深股通={parts[2]}(亿) 合计={parts[3]}(亿)")
    else:
        print(f"    {line[:60]} (字段不足)")

# ============================================================
# 3. 东财 push2 — 沪深港通实时分钟额度（盘中）
# ============================================================
print("\n" + "=" * 70)
print("【数据源3】东财 push2 — 沪深港通盘中实时分钟额度")
print("   URL: https://push2.eastmoney.com/api/qt/kamt.kline/get")
print("   特点: 同push2his但klt=1为分钟级")
print("=" * 70)

params3 = {
    "fields1": "f1,f2,f3,f5",
    "fields2": "f51,f52,f53,f54,f55,f56",
    "klt": 1,
    "lmt": 10,
}
r3 = requests.get(url2, params=params3, headers=headers2, timeout=10)
d3 = r3.json()
klines3 = d3.get("data", {}).get("klines", [])
if klines3:
    print(f"  ✅ 成功! 返回 {len(klines3)} 个分钟数据点")
    for line in klines3[-3:]:
        parts = line.split(",")
        print(f"    {parts[0]}: 沪={parts[1]}亿 深={parts[2]}亿 合计={parts[3]}亿")
else:
    print(f"  ⚠️ 返回为空或数据格式异常: {json.dumps(d3, ensure_ascii=False)[:200]}")

# ============================================================
# 4. 东财 datacenter — 北向资金持仓排行（个股维度）
# ============================================================
print("\n" + "=" * 70)
print("【数据源4】东财 datacenter — 北向持仓排行(个股) — 备用方案")
print("   URL: https://datacenter-web.eastmoney.com/api/data/v1/get")
print("   特点: 个股当日净买入排行, 需合适的reportName")
print("   状态: 2024-08后净买额字段可能为空")
print("=" * 70)

# 尝试多个reportName
report_names = [
    "RPT_MUTUAL_DEAL_STOCK_HISTORY",
    "RPT_MUTUAL_DEAL_STOCK_HISTORY_RECORD",
]
dc_url = "https://datacenter-web.eastmoney.com/api/data/v1/get"

for rn in report_names:
    params4 = {
        "reportName": rn,
        "columns": "ALL",
        "pageNumber": 1,
        "pageSize": 5,
        "sortColumns": "NET_BUY_AMT",
        "sortTypes": "-1",
        "source": "WEB",
        "client": "WEB",
    }
    time.sleep(1.1)
    r4 = requests.get(dc_url, params=params4, headers=headers2, timeout=10)
    d4 = r4.json()
    if d4.get("result") and d4["result"].get("data"):
        rows = d4["result"]["data"]
        print(f"  ✅ {rn} 返回 {len(rows)} 条数据")
        for row in rows[:5]:
            name = row.get("SECURITY_NAME_ABBR", "")
            code = row.get("SECURITY_CODE", "")
            net_buy = row.get("NET_BUY_AMT", 0)
            if net_buy and float(net_buy) != 0:
                print(f"    {name}({code}): 净买入={float(net_buy)/1e8:.2f}亿")
            else:
                print(f"    {name}({code}): 净买额字段为空(NaN/0)")
        break
    else:
        print(f"  ⚠️ {rn}: 无数据或空结果")

# ============================================================
# 5. 通达信 MCP — 个股北向资金持股（需个股维度）
# ============================================================
print("\n" + "=" * 70)
print("【数据源5】通达信 MCP — 个股北向持股变动")
print("   入口: tdx_api_data")
print("   entry: TdxSharePCCW.tdxf10_gg_zlcc + fixedTag=bszj")
print("   特点: 个股维度的北向持仓(需用MCP工具直接调用)")
print("   状态: 前面测试单个股票(600519)返回'数据库执行失败'")
print("   可能原因: 非交易时间或该接口需指定日期范围")
print("=" * 70)
print("   ⚠️ 需通过 MCP 工具调用, 非交易时间可能返回空")
print("   可用日期范围参数: beginDate + endDate (YYYYMMDD)")
print("   参考 entry: northbound_funds 响应格式化规则")

# ============================================================
# 6. westock-data — 腾讯自选股北向资金
# ============================================================
print("\n" + "=" * 70)
print("【数据源6】腾讯自选股(westock-data) — 北向数据")
print("   命令: westock-data 的 asfund 接口")
print("   特点: 走 westock-data CLI 工具")
print("   状态: 需要在Craft模式下用Skill加载westock-data后再调用")
print("=" * 70)
print("   需通过 Skill 加载 westock-data 后执行:")
print("   westock-data asfund 600519   # 个股资金流向(含北向)")
print()

print("=" * 70)
print("结论与推荐")
print("=" * 70)
print()
print("推荐优先级:")
print("  1️⃣ 同花顺 hsgtApi — 免费实时分钟级, 务必优先使用")
print("  2️⃣ 东财 push2/push2his — 历史日线/分钟线, 注意2024-08后字段空缺")
print("  3️⃣ 通达信 MCP — 个股北向持股, 需MCP工具调用")
print("  4️⃣ westock-data asfund — 腾讯自选股数据, 需Skill加载")
print()
print("数据源可靠度: 同花顺 > 东财(kline) > 通达信MCP > 东财(datacenter)")
