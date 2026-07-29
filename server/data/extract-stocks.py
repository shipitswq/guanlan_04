"""从通达信MCP查询结果中提取全市场股票列表"""
import sys
import json

input_file = sys.argv[1]
output_file = sys.argv[2]

stocks = []
with open(input_file, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line or not line.startswith('|'):
            continue
        parts = [p.strip() for p in line.split('|')]
        # Markdown table: | seq | pos | market | sec_code | sec_name | price | chg |
        if len(parts) >= 7:
            try:
                seq = int(parts[1])
                code = parts[4]
                name = parts[5]
                if code and len(code) == 6 and code.isdigit():
                    stocks.append({'code': code, 'name': name})
            except (ValueError, IndexError):
                pass

with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(stocks, f, ensure_ascii=False)

print(f'共提取 {len(stocks)} 只股票，已写入 {output_file}')
