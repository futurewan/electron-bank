#!/usr/bin/env python3
"""Dump raw text from a PDF for debugging."""
import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import pdfplumber

folder = "/Users/taolijun/Downloads/对账/01发票"
pdfs = sorted([f for f in os.listdir(folder) if f.lower().endswith('.pdf')])

for f in pdfs:
    fp = os.path.join(folder, f)
    try:
        with pdfplumber.open(fp) as pdf:
            page = pdf.pages[0]
            text = page.extract_text() or ""
            tables = page.extract_tables()
            
            print(f"=== FILE: {f} ===")
            print(f"TEXT_LENGTH: {len(text)}")
            print("--- TEXT START ---")
            print(text[:3000])
            print("--- TEXT END ---")
            print(f"TABLES: {len(tables)}")
            for ti, table in enumerate(tables):
                print(f"  TABLE_{ti} rows={len(table)}")
                for ri, row in enumerate(table[:8]):
                    cells = [str(c).replace('\n', '|') if c else '' for c in row]
                    print(f"    ROW{ri}: {cells}")
            print()
    except Exception as e:
        print(f"=== FILE: {f} ERROR: {e} ===")
