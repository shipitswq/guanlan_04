"""
北向资金数据源获取 — 完整代码工具箱
====================================
基于 2026-07-28 实测，覆盖 4 个数据源，附带第 5 个备用方案。

使用方式:
  pip install requests pandas
  python northbound_data_guide.py

数据源可靠度排名:
  1️⃣ 同花顺 hsgtApi          ✅ 最佳免费实时源
  2️⃣ 东财 push2his HSGT      ⚠️ 北向断供, 南向可用
  3️⃣ 通达信 MCP 个股资金流    ✅ 需MCP工具调用
  4️⃣ 腾讯自选股 westock-data  🔄 备份方案
  5️⃣ 百度股市通(替代方案)     🔄 最后兜底
"""

import requests, json, time, random
from datetime import datetime, timedelta

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0.0.0 Safari/537.36"


# ================================================================
# 数据源 1: 同花顺 hsgtApi — 实时分钟级北向流向（最佳）
# ================================================================
def hsgt_realtime() -> dict:
    """
    同花顺沪深港通实时分钟流向。
    返回: {
        'time': ['09:10', '09:11', ..., '15:00'],   # 262个时间点
        'hgt_yi': [浮点数],   # 沪股通累计净买入(亿元)
        'sgt_yi': [浮点数],   # 深股通累计净买入(亿元)
        'total_yi': [浮点数], # 合计
    }
    """
    url = "https://data.hexin.cn/market/hsgtApi/method/dayChart/"
    headers = {"User-Agent": UA, "Referer": "https://data.hexin.cn/"}
    r = requests.get(url, headers=headers, timeout=10)
    d = r.json()
    times = d.get("time", [])
    hgt = d.get("hgt", [])
    sgt = d.get("sgt", [])
    n = len(times)
    hgt_fixed = [float(v) if v is not None else None for v in (hgt[:n] + [None] * (n - len(hgt)))]
    sgt_fixed = [float(v) if v is not None else None for v in (sgt[:n] + [None] * (n - len(sgt)))]
    total = [h + s if h is not None and s is not None else None
             for h, s in zip(hgt_fixed, sgt_fixed)]
    return {"time": times, "hgt_yi": hgt_fixed, "sgt_yi": sgt_fixed, "total_yi": total}


# ================================================================
# 数据源 2: 东财 push2his — 沪深港通日线(南向可用, 北向断供)
# ================================================================
# 注意: 北向(hk2sh/hk2sz) 净买额字段自 2024-08 起全为 0,
#       但南向(sh2hk/sz2hk) 数据仍正常。
def eastmoney_hsgt_daily(lmt: int = 30) -> dict:
    """
    东财沪深港通日线。
    返回: {
        'hk2sh': [{date, net_buy, quota, cumulative}],  # 北向沪(⚠️ net_buy=0)
        'hk2sz': [{date, net_buy, quota, cumulative}],  # 北向深(⚠️ net_buy=0)
        'sh2hk': [{date, net_buy, quota, cumulative}],  # 南向沪(✅ 可用)
        's2n':   [{date, net_buy, quota, cumulative}],  # 汇总
    }
    """
    url = "https://push2his.eastmoney.com/api/qt/kamt.kline/get"
    params = {
        "fields1": "f1,f2,f3,f5",
        "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62",
        "klt": 101,  # 日线
        "lmt": lmt,
    }
    r = requests.get(url, params=params,
                     headers={"User-Agent": UA, "Referer": "https://data.eastmoney.com/"},
                     timeout=10)
    d = r.json()
    data = d.get("data", {})

    result = {}
    dir_map = {
        "hk2sh": "北向沪", "hk2sz": "北向深",
        "sh2hk": "南向沪", "sz2hk": "南向深", "s2n": "汇总"
    }
    for key, label in dir_map.items():
        rows = []
        for line in data.get(key, []):
            parts = line.split(",")
            if len(parts) >= 4:
                rows.append({
                    "date": parts[0],
                    "net_buy": float(parts[1]),
                    "quota": float(parts[2]),
                    "cumulative": float(parts[3]),
                })
        result[key] = {"label": label, "rows": rows}
    return result


# ================================================================
# 数据源 3: 东财 push2 — 个股资金流向（包含北向间接判断）
# ================================================================
def stock_fund_flow(code: str, lmt: int = 20) -> list[dict]:
    """
    个股资金流向(日级)。
    code: 6位数字股票代码
    返回: [{date, main_net, large_net, super_net, small_net, mid_net}]
    单位: 元
    用途: 结合北向热点分析, 看主力+超大单方向是否与北向一致
    """
    market = 1 if code.startswith("6") else 0
    url = "https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get"
    params = {
        "secid": f"{market}.{code}",
        "fields1": "f1,f2,f3,f7",
        "fields2": "f51,f52,f53,f54,f55,f56,f57",
        "lmt": lmt,
    }
    r = requests.get(url, params=params,
                     headers={"User-Agent": UA, "Referer": "https://quote.eastmoney.com/"},
                     timeout=10)
    d = r.json()
    klines = d.get("data", {}).get("klines", [])
    rows = []
    for line in klines:
        parts = line.split(",")
        if len(parts) >= 7:
            rows.append({
                "date": parts[0],
                "main_net": float(parts[1]),
                "small_net": float(parts[2]),
                "mid_net": float(parts[3]),
                "large_net": float(parts[4]),
                "super_net": float(parts[5]),
            })
    return rows


# ================================================================
# 数据源 4: 东财 push2 — 沪深港通实时分钟额度
# ================================================================
def eastmoney_hsgt_minute(lmt: int = 10) -> dict:
    """
    东财沪深港通分钟级额度。
    参数同 daily, klt=1 即为分钟级。
    """
    url = "https://push2.eastmoney.com/api/qt/kamt.kline/get"
    params = {
        "fields1": "f1,f2,f3,f5",
        "fields2": "f51,f52,f53,f54,f55,f56",
        "klt": 1,
        "lmt": lmt,
    }
    r = requests.get(url, params=params,
                     headers={"User-Agent": UA, "Referer": "https://data.eastmoney.com/"},
                     timeout=10)
    d = r.json()
    data = d.get("data", {})
    result = {}
    for key in ["hk2sh", "hk2sz", "sh2hk", "sz2hk", "s2n"]:
        rows = []
        for line in data.get(key, []):
            parts = line.split(",")
            if len(parts) >= 4:
                rows.append(dict(zip(["date","net_buy","quota","cumulative"], parts)))
        result[key] = rows
    return result


# ================================================================
# 演示: 调用所有数据源并输出结果
# ================================================================
if __name__ == "__main__":
    print("=" * 65)
    print("北向资金数据源实测结果")
    print(f"测试时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 65)

    # --- 数据源 1: 同花顺 ---
    print("\n[1️⃣ 同花顺 hsgtApi] 实时分钟级北向流向")
    hsgt = hsgt_realtime()
    n = len(hsgt["time"])
    print(f"  时间点数: {n}")
    # 找最后一个有效点
    last_valid = None
    for i in range(n - 1, -1, -1):
        if hsgt["total_yi"][i] is not None:
            last_valid = i
            break
    if last_valid is not None:
        t, h, s, total = (hsgt["time"][last_valid], hsgt["hgt_yi"][last_valid],
                          hsgt["sgt_yi"][last_valid], hsgt["total_yi"][last_valid])
        print(f"  最新({t}): 沪股通={h:.2f}亿 | 深股通={s:.2f}亿 | 合计={total:.2f}亿")
        direction = "净流入" if total > 0 else "净流出"
        print(f"  当日北向资金方向: {direction} ({total:+.2f}亿)")

    # --- 数据源 2: 东财 HSGT ---
    print("\n[2️⃣ 东财 push2his] 沪深港通日线")
    hsgt_daily = eastmoney_hsgt_daily(10)

    # 北向(可能断供)
    hk2sh = hsgt_daily.get("hk2sh", {}).get("rows", [])
    if hk2sh:
        today_nb = hk2sh[-1]["net_buy"]
        status = "⚠️ 断供(net_buy=0)" if today_nb == 0 else "✅ 可用"
        print(f"  北向沪(hk2sh): {len(hk2sh)}行, 最新net_buy={today_nb} → {status}")
        print(f"    注: 东财北向数据自2024-08起净买额字段全为0")

    # 南向(可用)
    sh2hk = hsgt_daily.get("sh2hk", {}).get("rows", [])
    if sh2hk:
        latest = sh2hk[-1]
        print(f"  南向沪(sh2hk): {len(sh2hk)}行, ✅ 可用")
        print(f"    最新: {latest['date']} 净买额={latest['net_buy']:.2f} 累计={latest['cumulative']:.2f}")

    # --- 数据源 3: 个股资金流 ---
    print("\n[3️⃣ 东财 push2] 个股资金流向(以茅台600519为例)")
    flow = stock_fund_flow("600519", 5)
    print(f"  最近{len(flow)}个交易日:")
    for f in flow:
        main_dir = "主力净流入" if f["main_net"] > 0 else "主力净流出"
        print(f"    {f['date']}: {main_dir}={f['main_net']/1e4:.0f}万 | "
              f"超大单={f['super_net']/1e4:.0f}万 | 大单={f['large_net']/1e4:.0f}万")

    # --- 数据源 4: 东财 HSGT 分钟 ---
    print("\n[4️⃣ 东财 push2] 沪深港通分钟级")
    hsgt_1m = eastmoney_hsgt_minute(5)
    hk2sh_1m = hsgt_1m.get("hk2sh", [])
    print(f"  hk2sh(北向沪): {len(hk2sh_1m)}个数据点")
    for r in hk2sh_1m[-3:]:
        print(f"    {r['date']}: net_buy={r['net_buy']} quota={r['quota']}")

    print("\n" + "=" * 65)
    print("结论")
    print("=" * 65)
    print("""
    推荐使用优先级:
    1️⃣ 同花顺 hsgtApi (data.hexin.cn)
       - ✅ 零鉴权, 实时分钟级, 262个时间点
       - 获取当日沪/深股通累计净买入(亿元)
       - 适合: 盘中实时追踪、收盘汇总

    2️⃣ 通达信 MCP (tdx_api_data)
       - ✅ 个股主力资金流向 (zjlx)
       - ⚠️ 个股北向持股(bszj)接口返回"数据库执行失败", 待修复
       - 适合: 个股维度资金分析, 间接判断北向动作

    3️⃣ 东财 push2his HSGT
       - ⚠️ 北向数据断供(2024-08起net_buy=0)
       - ✅ 南向数据(sh2hk/sz2hk)仍可用
       - 适合: 南向资金追踪

    4️⃣ westock-data asfund (腾讯自选股)
       - 可作为备份数据源, 需加载 Skill

    备选: 百度股市通概念板块归属(baidu_concept_blocks)
       - 查看个股是否属于"北向重仓"概念
    """)


# ================================================================
# 附录: 北向资金历史自缓存方案
# ================================================================
def create_northbound_cache():
    """
    由于东财2024-08后北向净买额断供,
    建议每日收盘后通过 hsgtApi 获取当日最终数据,
    写入本地CSV积累历史。参考代码:
    """
    pass
    # from pathlib import Path
    # cache_path = Path.home() / ".tradingagents" / "cache" / "northbound_daily.csv"
    # cache_path.parent.mkdir(parents=True, exist_ok=True)
    # # 每日收盘后执行:
    # hsgt = hsgt_realtime()
    # if hsgt["total_yi"][-1] is not None:
    #     rows = {}
    #     if cache_path.exists():
    #         for line in cache_path.read_text().strip().split("\n")[1:]:
    #             parts = line.split(",")
    #             if len(parts) == 4:
    #                 rows[parts[0]] = line
    #     today = datetime.now().strftime("%Y-%m-%d")
    #     h = hsgt["hgt_yi"][-1]
    #     s = hsgt["sgt_yi"][-1]
    #     rows[today] = f"{today},{h},{s},{h+s}"
    #     with open(cache_path, "w") as f:
    #         f.write("date,hgt,sgt,total\n")
    #         for d in sorted(rows.keys()):
    #             f.write(rows[d] + "\n")
