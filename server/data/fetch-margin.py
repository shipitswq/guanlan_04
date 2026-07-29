import os
os.environ['no_proxy'] = '*'
os.environ['NO_PROXY'] = '*'
import akshare as ak
import json

sh = ak.macro_china_market_margin_sh()
sz = ak.macro_china_market_margin_sz()

sh_dict = {}
for _, r in sh.tail(30).iterrows():
    dt = str(r['日期'])[:10]
    sh_dict[dt] = {
        'sh_finance': float(r['融资余额']),
        'sh_short': float(r['融券余额']),
        'sh_total': float(r['融资融券余额']),
    }

result = []
for _, r in sz.tail(30).iterrows():
    dt = str(r['日期'])[:10]
    sz_finance = float(r['融资余额'])
    sz_short = float(r['融券余额'])
    sz_total = float(r['融资融券余额'])
    sh_f = sh_dict.get(dt, {}).get('sh_finance', 0)
    sh_s = sh_dict.get(dt, {}).get('sh_short', 0)
    sh_t = sh_dict.get(dt, {}).get('sh_total', 0)
    result.append({
        'date': dt,
        'finance': round((sh_f + sz_finance) / 1e8, 2),
        'short': round((sh_s + sz_short) / 1e8, 2),
        'total': round((sh_t + sz_total) / 1e8, 2),
    })

print(json.dumps(result, ensure_ascii=False))
