"""
北向资金数据获取脚本
数据源: Tushare Pro (https://tushare.pro)
接口: moneyflow_hsgt - 沪深港通每日资金流向
字段: north_money(北向合计,百万元), hgt(沪股通), sgt(深股通)

使用方式:
  python fetch-north-flow.py <token>
  python fetch-north-flow.py <token> 30    # 指定获取天数(默认30)

输出: JSON数组 [{date, netFlow}, ...] 单位: 亿元
"""

import sys
import json
import tushare as ts

days = int(sys.argv[2]) if len(sys.argv) > 2 else 30
token = sys.argv[1]

pro = ts.pro_api(token)

from datetime import datetime, timedelta
end = datetime.now().strftime('%Y%m%d')
start = (datetime.now() - timedelta(days=days + 10)).strftime('%Y%m%d')

df = pro.moneyflow_hsgt(start_date=start, end_date=end)

if df is None or df.empty:
    print(json.dumps([], ensure_ascii=False))
    sys.exit(0)

# 按日期排序
df = df.sort_values('trade_date', ascending=True)
# 只取最近N天
df = df.tail(days)

result = []
for _, row in df.iterrows():
    date = row['trade_date']
    # 格式化为 YYYY-MM-DD
    date_str = f"{date[:4]}-{date[4:6]}-{date[6:8]}"
    # north_money 单位百万元 → 亿元
    net_flow = round(float(row['north_money']) / 100, 2)
    result.append({'date': date_str, 'netFlow': net_flow})

print(json.dumps(result, ensure_ascii=False))
