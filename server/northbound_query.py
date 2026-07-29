#!/usr/bin/env python3
"""
北向资金每日查询工具 — 同花顺 hsgtApi 实现
============================================

功能:
  1. 查询当日北向资金实时分钟流向(同花顺 hsgtApi)
  2. 生成 HTML 可视化报告(含走势图 + 汇总表)
  3. 自动缓存历史数据到本地 CSV
  4. 支持命令行/自动化调用

数据说明:
  hsgtApi 返回两个通道的分钟级数据：
  - hgt (沪股通): 当日累计净买入, 从 0 开始累加 ← 可直接用
  - sgt (深股通): 累计持仓型指标, 需取首尾差值得当日流入
  
  北向合计 = hgt_final + (sgt_last - sgt_first)

用法:
  python northbound_query.py                     # 查询并生成HTML+CSV
  python northbound_query.py --chart-only        # 仅生成HTML(不更新CSV)
  python northbound_query.py --watch             # 每隔5分钟刷新一次(盘中模式)
"""

import argparse
import csv
import json
import time
import sys
from datetime import datetime
from pathlib import Path

import requests

# ---------- 配置 ----------
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/117.0.0.0 Safari/537.36"
HSGT_API = "https://data.hexin.cn/market/hsgtApi/method/dayChart/"

# 观澜项目数据文件
PROJECT_DIR = Path(__file__).parent.parent                      # D:\vibe\guanlan_04
CACHE_DIR = PROJECT_DIR / "data" / "northbound"
CACHE_FILE = CACHE_DIR / "northbound_daily.csv"
OUTPUT_DIR = PROJECT_DIR / "public" / "northbound"
NORTH_FLOW_JSON = PROJECT_DIR / "server" / "data" / "north-flow-db.json"


# ================================================================
# 1. 数据获取
# ================================================================
def fetch_hsgt() -> dict:
    """获取同花顺 hsgtApi 数据，返回结构化结果"""
    r = requests.get(
        HSGT_API,
        headers={"User-Agent": UA, "Referer": "https://data.hexin.cn/"},
        timeout=15,
    )
    r.raise_for_status()
    raw = r.json()

    times: list[str] = raw.get("time", [])
    hgt_raw: list = raw.get("hgt", [])
    sgt_raw: list = raw.get("sgt", [])

    n = len(times)

    # ---- 沪股通 (hgt): 当日累计净买入, 从0开始 ----
    hgt = _align_list(hgt_raw, n)

    # ---- 深股通 (sgt): 累计持仓型, 需取首尾差值得当日净流入 ----
    sgt = _align_list(sgt_raw, n)
    sgt_first = next((v for v in sgt if v is not None), None)
    sgt_last = next((v for v in reversed(sgt) if v is not None), None)

    # --- 沪股通最终值 ---
    hgt_final = next((v for v in reversed(hgt) if v is not None), None)

    # --- 深股通当日净流入 = 最后一个非空值 - 第一个非空值 ---
    sgt_today_flow = None
    if sgt_first is not None and sgt_last is not None and sgt_last != sgt_first:
        # 检查: 如果 sgt_first 很大(>50), 说明不是当日起始值, 取差值
        if abs(sgt_first) > 50:
            # sgt 是累计型指标, 当日流入 = 最后一减第一个
            sgt_today_flow = sgt_last - sgt_first
        else:
            # sgt_first 很小, 说明是当日累计值, 直接用最后一个
            sgt_today_flow = sgt_last

    # --- 北向合计 ---
    total = None
    if hgt_final is not None and sgt_today_flow is not None:
        total = hgt_final + sgt_today_flow
    elif hgt_final is not None:
        total = hgt_final

    direction = "净流入" if total and total > 0 else "净流出"

    return {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "time": times,
        "hgt_values": hgt,
        "sgt_values": sgt,
        "hgt_final": hgt_final,             # 沪股通当日净买入(亿)
        "sgt_first": sgt_first,             # 深股通开盘值(累计)
        "sgt_last": sgt_last,               # 深股通收盘值(累计)
        "sgt_today_flow": sgt_today_flow,   # 深股通当日净买入(亿)
        "total_final": total,               # 北向合计净买入(亿)
        "direction": direction,
        "sample_count": n,
    }


def _align_list(raw: list, n: int):
    """将原始数据列表对齐到长度为 n，None 填充缺失"""
    result = []
    for i in range(n):
        v = raw[i] if i < len(raw) else None
        result.append(float(v) if v is not None else None)
    return result


# ================================================================
# 2. CSV 缓存
# ================================================================
def load_history() -> list[dict]:
    if not CACHE_FILE.exists():
        return []
    with open(CACHE_FILE, "r", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def save_day_to_cache(data: dict):
    """将当日北向数据追加到 CSV + 同步观澜项目 JSON 数据库"""
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    history = load_history()
    existing_dates = {r["date"] for r in history}
    today = data["date"]

    def _fmt(v):
        return f"{v:.2f}" if v is not None else ""

    row = {
        "date": today,
        "hgt": _fmt(data["hgt_final"]),
        "sgt_delta": _fmt(data["sgt_today_flow"]),
        "total": _fmt(data["total_final"]),
        "direction": data["direction"] if data["total_final"] is not None else "",
    }

    if today in existing_dates:
        for i, r in enumerate(history):
            if r["date"] == today:
                history[i] = row
                break
    else:
        history.append(row)

    with open(CACHE_FILE, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=["date", "hgt", "sgt_delta", "total", "direction"])
        writer.writeheader()
        writer.writerows(history)
    print(f"  ✅ CSV 缓存: {CACHE_FILE} ({len(history)} 个交易日)")

    # === 同步到观澜项目 north-flow-db.json ===
    _sync_to_project_json(data)


def _sync_to_project_json(data: dict):
    """将当日北向数据同步到项目 north-flow-db.json"""
    today = data["date"]
    total = data["total_final"]
    if total is None:
        return

    # 读取现有数据
    db = []
    if NORTH_FLOW_JSON.exists():
        try:
            db = json.loads(NORTH_FLOW_JSON.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, Exception):
            db = []

    # 去重更新
    existing = {r["date"] for r in db}
    if today in existing:
        for r in db:
            if r["date"] == today:
                r["netFlow"] = round(total, 2)
                break
    else:
        db.append({"date": today, "netFlow": round(total, 2)})

    # 排序+裁剪(保留最近60天)
    db.sort(key=lambda r: r["date"])
    if len(db) > 60:
        db = db[-60:]

    NORTH_FLOW_JSON.write_text(
        json.dumps(db, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"  ✅ 同步项目数据库: {NORTH_FLOW_JSON} ({len(db)} 条)")
    if len(db) < 30:
        print(f"  ℹ️  当前 {len(db)} 条, 运行自动化每日积累, 约 {30 - len(db)} 个交易日后达30条")


# ================================================================
# 3. 生成 HTML 报告
# ================================================================
def gen_html(data: dict) -> str:
    today = data["date"]
    hgt = data["hgt_final"]
    sgt_flow = data["sgt_today_flow"]
    total = data["total_final"]
    direction = data["direction"]

    hgt_str = f"{hgt:+.2f}" if hgt is not None else "—"
    sgt_str = f"{sgt_flow:+.2f}" if sgt_flow is not None else "—"
    total_str = f"{total:+.2f}" if total is not None else "—"

    times = data["time"]
    hgt_vals = data["hgt_values"]
    sgt_vals = data["sgt_values"]

    # --- 提取 sgt 有效数据用于趋势线（映射到时间轴） ---
    sgt_trend_time = []
    sgt_trend_val = []
    for i in range(len(times)):
        if sgt_vals[i] is not None:
            sgt_trend_time.append(times[i])
            sgt_trend_val.append(sgt_vals[i])

    # --- 历史 ---
    history = load_history()
    hist_60 = history[-60:] if len(history) > 60 else history
    hist_dates_json = json.dumps([r["date"] for r in hist_60])
    hist_total_json = json.dumps([
        float(r["total"]) if r["total"] else None for r in hist_60
    ])

    times_json = json.dumps(times)
    hgt_json = json.dumps(hgt_vals)

    sgt_time_json = json.dumps(sgt_trend_time)
    sgt_val_json = json.dumps(sgt_trend_val)

    color_red = "#ef4444"
    color_green = "#22c55e"
    color_blue = "#3b82f6"
    color_orange = "#f97316"
    total_color = color_red if total is not None and total < 0 else color_green

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>北向资金日报 — {today}</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{ background: #f8fafc; color: #1e293b; font-family: -apple-system, BlinkMacSystemFont, sans-serif; padding: 24px; }}
.container {{ max-width: 1000px; margin: 0 auto; }}
.header {{ background: linear-gradient(135deg, #1e3a5f, #2d6a9f); color: white; border-radius: 16px; padding: 28px 32px; margin-bottom: 24px; }}
.header h1 {{ font-size: 24px; margin-bottom: 4px; }}
.header .date {{ font-size: 14px; opacity: 0.8; margin-bottom: 20px; }}
.summary-grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }}
.summary-card {{ background: rgba(255,255,255,0.12); border-radius: 12px; padding: 16px; text-align: center; }}
.summary-card .label {{ font-size: 12px; opacity: 0.8; margin-bottom: 4px; }}
.summary-card .value {{ font-size: 26px; font-weight: 700; }}
.summary-card .unit {{ font-size: 12px; opacity: 0.7; }}
.summary-card.total .value {{ color: {total_color}; }}
.summary-card.hgt .value {{ color: {color_orange}; }}
.summary-card.sgt .value {{ color: {color_blue}; }}
.chart-box {{ background: white; border-radius: 12px; padding: 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }}
.chart-box h2 {{ font-size: 16px; margin-bottom: 12px; color: #475569; }}
#dayChart, #histChart {{ width: 100%; height: 360px; }}
.info {{ background: #f1f5f9; border-radius: 12px; padding: 16px; font-size: 13px; color: #64748b; line-height: 1.8; }}
.info strong {{ color: #334155; }}
.info .tag {{ display: inline-block; background: {total_color}; color: white; padding: 2px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; margin-right: 4px; }}
.footer {{ text-align: center; color: #94a3b8; font-size: 12px; margin-top: 24px; }}
</style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🧭 北向资金日报</h1>
    <div class="date">数据来源: 同花顺 hsgtApi · {today} · 采样 {data["sample_count"]} 个时间点</div>
    <div class="summary-grid">
      <div class="summary-card total">
        <div class="label">北向合计</div>
        <div class="value">{total_str}</div>
        <div class="unit">亿元 <span class="tag">{direction}</span></div>
      </div>
      <div class="summary-card hgt">
        <div class="label">沪股通</div>
        <div class="value">{hgt_str}</div>
        <div class="unit">亿元</div>
      </div>
      <div class="summary-card sgt">
        <div class="label">深股通</div>
        <div class="value">{sgt_str}</div>
        <div class="unit">亿元</div>
      </div>
      <div class="summary-card" style="background:rgba(255,255,255,0.08)">
        <div class="label">点位</div>
        <div class="value" style="font-size:18px;margin-top:6px;color:rgba(255,255,255,0.9)">{data["sample_count"]}</div>
        <div class="unit">分钟采样</div>
      </div>
    </div>
  </div>

  <div class="chart-box">
    <h2>📈 当日北向资金分钟走势</h2>
    <div id="dayChart"></div>
  </div>

  <div class="chart-box">
    <h2>📊 近 {len(hist_60)} 个交易日历史走势</h2>
    <div id="histChart"></div>
  </div>

  <div class="info">
    <strong>数据说明：</strong><br>
    • <strong>沪股通</strong> = 当日累计净买入（亿元）, 每分钟更新一次, 开盘从0开始<br>
    • <strong>深股通</strong> = 累计持仓型指标, 取日内首尾差值作为当日净流入估算<br>
    • <strong>北向合计</strong> = 沪股通当日净买入 + 深股通日内差值<br>
    • 盘中数据实时刷新, 收盘后数据为当日最终值<br>
    • 数据仅供研究参考, 不构成投资建议<br>
    • 数据源: <code>https://data.hexin.cn/market/hsgtApi/method/dayChart/</code>
  </div>

  <div class="footer">
    生成时间: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
  </div>
</div>

<script>
var dayChart = echarts.init(document.getElementById("dayChart"));
var times = {times_json};
var hgtData = {hgt_json};
var sgtTimes = {sgt_time_json};
var sgtData = {sgt_val_json};

// 沪股通: 密集的分钟数据
var hgtSeries = [];
for (var i = 0; i < times.length; i++) {{
    if (hgtData[i] !== null) {{
        hgtSeries.push([times[i], hgtData[i]]);
    }}
}}

// 深股通: 稀疏采样点
var sgtSeries = [];
for (var i = 0; i < sgtTimes.length; i++) {{
    sgtSeries.push([sgtTimes[i], sgtData[i]]);
}}

dayChart.setOption({{
    tooltip: {{
        trigger: 'axis',
        formatter: function(params) {{
            var s = '<strong>' + params[0].axisValue + '</strong><br/>';
            params.forEach(function(p) {{
                var val = p.data[1];
                if (val !== undefined) {{
                    s += p.marker + ' ' + p.seriesName + ': ' + val.toFixed(2) + ' 亿<br/>';
                }}
            }});
            return s;
        }}
    }},
    legend: {{ data: ['沪股通(当日累计)', '深股通(累计持仓)'], top: 0 }},
    grid: {{ left: 60, right: 20, top: 40, bottom: 30 }},
    xAxis: {{
        type: 'category',
        data: times,
        axisLabel: {{ fontSize: 10, interval: 20 }}
    }},
    yAxis: [
        {{
            type: 'value',
            name: '沪股通净买入 (亿)',
            splitLine: {{ lineStyle: {{ type: 'dashed', opacity: 0.3 }} }}
        }},
        {{
            type: 'value',
            name: '深股通累计 (亿)',
            splitLine: {{ show: false }}
        }}
    ],
    series: [
        {{
            name: '沪股通(当日累计)',
            type: 'line',
            yAxisIndex: 0,
            data: hgtSeries,
            smooth: true,
            symbol: 'none',
            lineStyle: {{ width: 2, color: '{color_orange}' }},
            areaStyle: {{ color: 'rgba(249, 115, 22, 0.1)' }},
            connectNulls: false
        }},
        {{
            name: '深股通(累计持仓)',
            type: 'line',
            yAxisIndex: 1,
            data: sgtSeries,
            smooth: true,
            symbol: 'circle',
            symbolSize: 4,
            lineStyle: {{ width: 1.5, color: '{color_blue}', type: 'dashed' }},
            connectNulls: false
        }}
    ]
}});

// 历史走势
var histChart = echarts.init(document.getElementById("histChart"));
var histDates = {hist_dates_json};
var histTotals = {hist_total_json};

histChart.setOption({{
    tooltip: {{
        trigger: 'axis',
        formatter: function(params) {{
            var p = params[0];
            var val = p.value;
            return '<strong>' + p.axisValue + '</strong><br/>' +
                   (val !== null ? (val >= 0 ? '🟢' : '🔴') + ' 北向合计: ' + val.toFixed(2) + ' 亿' : '暂无数据');
        }}
    }},
    grid: {{ left: 60, right: 20, top: 10, bottom: 40 }},
    xAxis: {{
        type: 'category',
        data: histDates,
        axisLabel: {{ fontSize: 10, rotate: 45, interval: Math.max(0, Math.floor(histDates.length / 15)) }}
    }},
    yAxis: {{
        type: 'value',
        name: '北向合计 (亿元)',
        splitLine: {{ lineStyle: {{ type: 'dashed', opacity: 0.3 }} }}
    }},
    series: [{{
        type: 'bar',
        data: histTotals.map(function(v) {{
            return {{
                value: v,
                itemStyle: {{ color: v >= 0 ? '{color_green}' : '{color_red}' }}
            }};
        }}),
        barWidth: '60%'
    }}]
}});

window.addEventListener('resize', function() {{
    dayChart.resize();
    histChart.resize();
}});
</script>
</body>
</html>"""
    return html


# ================================================================
# 4. 主入口
# ================================================================
def main():
    parser = argparse.ArgumentParser(description="北向资金每日查询")
    parser.add_argument("--chart-only", action="store_true", help="仅生成HTML，不更新CSV")
    parser.add_argument("--watch", action="store_true", help="盘中模式: 每5分钟刷新一次")
    args = parser.parse_args()

    if args.watch:
        _watch_mode()
        return

    _run_once(args.chart_only)


def _run_once(chart_only: bool):
    print("🧭 北向资金查询中...", end=" ", flush=True)
    try:
        data = fetch_hsgt()
    except Exception as e:
        print(f"\n❌ 数据获取失败: {e}")
        sys.exit(1)

    _print_summary(data)

    if not chart_only:
        save_day_to_cache(data)

    _save_html(data)
    print(f"  📊 历史缓存共 {len(load_history())} 个交易日")


def _print_summary(data: dict):
    hgt = data["hgt_final"]
    sgt_flow = data["sgt_today_flow"]
    total = data["total_final"]

    print(f"✅")
    print(f"  📅 {data['date']}")
    print(f"  🟠 沪股通: {hgt:+.2f}亿")
    if sgt_flow is not None:
        print(f"  🔵 深股通: {sgt_flow:+.2f}亿 (首={data['sgt_first']}, 尾={data['sgt_last']})")
    if total is not None:
        icon = "🟢" if total > 0 else "🔴"
        print(f"  {icon} 北向合计: {total:+.2f}亿 ({data['direction']})")


def _save_html(data: dict):
    html_content = gen_html(data)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    paths = [
        OUTPUT_DIR / f"northbound_{data['date']}.html",
        OUTPUT_DIR / "latest.html",
    ]
    for p in paths:
        with open(p, "w", encoding="utf-8") as f:
            f.write(html_content)
        print(f"  ✅ HTML: {p}")


def _watch_mode():
    """盘中模式: 每分钟刷新, 保留上次的total做对比"""
    import subprocess
    from datetime import datetime

    print("\n📡 北向资金盘中间隔追踪模式 (每5分钟刷新)")
    print("   按 Ctrl+C 退出\n")
    prev_total = None
    try:
        while True:
            now = datetime.now()
            data = fetch_hsgt()
            total = data["total_final"]
            change = ""
            if prev_total is not None and total is not None:
                diff = total - prev_total
                change = f" (较上次 {'+' if diff > 0 else ''}{diff:.2f})"
            prev_total = total

            print(f"  [{now.strftime('%H:%M:%S')}] 沪={data['hgt_final']:+.2f}亿 | "
                  f"深={data['sgt_today_flow']:+.2f}亿 | "
                  f"合计={total:+.2f}亿{change}")

            time.sleep(300)
    except KeyboardInterrupt:
        print("\n   已退出追踪模式")
        # 退出前保存最终数据
        _save_html(data)
        save_day_to_cache(data)


if __name__ == "__main__":
    main()
