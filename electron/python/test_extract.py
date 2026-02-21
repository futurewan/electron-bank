#!/usr/bin/env python3
"""
Quick diagnostic: run against real PDFs and print results to terminal.
Usage: python3 electron/python/test_extract.py [folder_path]
"""
import os, sys, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from invoice_parser import InvoiceParser

folder = sys.argv[1] if len(sys.argv) > 1 else "/Users/taolijun/Downloads/对账/01发票"

parser = InvoiceParser()
target_files = [
    "24332001111494769913.pdf",
    "25332000000513899269-25332000000513899269.pdf",
    "26312000000094881451-26312000000094881451.pdf",
    "digital_25327000001608939132.pdf"
]
pdfs = [f for f in target_files if os.path.exists(os.path.join(folder, f))]
print(f"Testing {len(pdfs)} specific PDFs in {folder}\n")

for f in pdfs:
    fp = os.path.join(folder, f)
    ok, inv, err = parser.parse_single_invoice(fp)
    
    print(f"{'='*50}")
    print(f"FILE: {f}")
    print(f"  OK: {ok}")
    
    if inv:
        fields = [
            ("购买方", inv.buyer_name),
            ("购买方税号", inv.buyer_tax_id),
            ("销售方", inv.seller_name),
            ("销售方税号", inv.seller_tax_id),
            ("发票号码", inv.invoice_number),
            ("开票日期", inv.invoice_date),
            ("项目名称", inv.item_name),
            ("金额", inv.amount),
            ("税率", inv.tax_rate),
            ("税额", inv.tax_amount),
            ("价税合计", inv.total_amount),
            ("备注", inv.remark),
            ("开票人", inv.issuer),
            ("大写", inv.total_amount_chinese),
            ("来源", inv.parse_source),
        ]
        for label, val in fields:
            status = "✅" if val else "❌"
            print(f"  {status} {label}: {val}")
    
    if err:
        print(f"  ERROR: {err}")
    print()
