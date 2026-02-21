
import pdfplumber
import re
import os
import json
from dataclasses import asdict
from typing import List, Optional, Tuple, Dict
from models import InvoiceInfo, BatchParseResult, DuplicateRecord, ErrorRecord


class InvoiceParser:
    """
    Chinese electronic invoice PDF parser.
    
    Handles these real-world formats observed from actual PDFs:
    
    Format A (全电发票 - same-line buyer/seller):
        购 名称：万亚飞 销 名称：松下家电（中国）有限公司
        or: 买 名 称 万亚飞 售 名 称 江苏京东海元贸易有限公司
    
    Format B (稀疏文本 - sparse text, two companies on one line):
        大树科技有限公司 南京新媒体工作室
        91530112MACK55RA01 91530112MACK55RK08
        金额 税率/征收率 税额
        36461.19 13% 4739.96
    
    Table ROW0 (most reliable for buyer/seller):
        ['购|买|方|信|息', '名称：万亚飞|税号：...', '', '销|售|方|信|息', '名称：松下...|税号：...']
    """

    def __init__(self):
        pass

    def parse_single_invoice(self, file_path: str) -> Tuple[bool, Optional[InvoiceInfo], Optional[str]]:
        if not os.path.exists(file_path):
            return False, None, f"File not found: {file_path}"

        try:
            with pdfplumber.open(file_path) as pdf:
                if len(pdf.pages) == 0:
                    return False, None, "Empty PDF"

                file_name = os.path.basename(file_path)
                invoice = InvoiceInfo(file_path=file_path, file_name=file_name)

                # 1. Try PDF metadata first
                self._extract_metadata(pdf, invoice)

                # 2. Extract full page text and tables
                first_page = pdf.pages[0]
                text = first_page.extract_text() or ""
                tables = first_page.extract_tables()

                # 3. Extract from tables FIRST (most reliable for buyer/seller)
                if tables:
                    self._extract_buyer_seller_from_table(tables, invoice)
                    self._extract_amounts_from_table(tables, invoice)
                    self._extract_item_from_table(tables, invoice)

                # 4. Text-based extraction (fills gaps)
                if text:
                    self._extract_invoice_number(text, invoice)
                    self._extract_invoice_date(text, invoice)
                    self._extract_invoice_type(text, invoice)
                    self._extract_buyer_seller_from_text(text, invoice)
                    self._extract_amounts_from_text(text, invoice)
                    self._extract_item_from_text(text, invoice)
                    self._extract_chinese_total(text, invoice)
                    self._extract_remark(text, invoice)
                    self._extract_issuer(text, invoice)
                    self._extract_sparse_format(text, invoice)

                # 5. Derive missing amounts
                self._derive_amounts(invoice)

                # 6. Parse source
                has_meta = invoice.parse_source == "metadata"
                has_text = bool(text and len(text.strip()) > 0)
                if has_meta and has_text:
                    invoice.parse_source = "both"
                elif has_text:
                    invoice.parse_source = "textlayer"

                return True, invoice, None

        except Exception as e:
            return False, None, str(e)

    # ============================================
    # TABLE-BASED EXTRACTION (highest priority)
    # ============================================

    def _extract_buyer_seller_from_table(self, tables: list, invoice: InvoiceInfo):
        """
        Extract buyer/seller from table ROW0 which typically looks like:
        ['购|买|方|信|息', '名称：万亚飞|统一社会信用代码/纳税人识别号：321281199108082091', 
         '', '销|售|方|信|息', '名称：松下家电...|统一社会信用代码/纳税人识别号：913301...']
        """
        for table in tables:
            if not table or len(table) < 1:
                continue

            row0 = table[0]
            if not row0:
                continue

            buyer_cell = None
            seller_cell = None

            for i, cell in enumerate(row0):
                if not cell:
                    continue
                cell_str = str(cell).replace('\n', '|')

                # Detect buyer info cell
                if re.search(r'购[\s|]*买[\s|]*方', cell_str):
                    # The NEXT non-empty cell contains buyer data
                    for j in range(i + 1, len(row0)):
                        if row0[j] and str(row0[j]).strip():
                            buyer_cell = str(row0[j])
                            break
                # Detect seller info cell
                elif re.search(r'销[\s|]*售[\s|]*方', cell_str):
                    # The NEXT non-empty cell contains seller data
                    for j in range(i + 1, len(row0)):
                        if row0[j] and str(row0[j]).strip():
                            seller_cell = str(row0[j])
                            break

            # Parse buyer cell - always try to extract both name and tax ID
            if buyer_cell:
                self._parse_info_cell(buyer_cell, invoice, 'buyer')

            if seller_cell:
                self._parse_info_cell(seller_cell, invoice, 'seller')

    def _parse_info_cell(self, cell_text: str, invoice: InvoiceInfo, role: str):
        """Parse a buyer/seller info cell that contains name and tax ID."""
        # Split by newlines or pipe chars
        parts = re.split(r'[\n|]', cell_text)

        for part in parts:
            part = part.strip()
            if not part:
                continue

            # Extract name: "名称：万亚飞" or "名 称 万亚飞" or "名 称:江苏京东..."
            m = re.match(r'名\s*称\s*[:：]?\s*(.+)', part)
            if m:
                name = m.group(1).strip()
                if name and len(name) >= 2:
                    if role == 'buyer' and not invoice.buyer_name:
                        invoice.buyer_name = name
                    elif role == 'seller' and not invoice.seller_name:
                        invoice.seller_name = name
                continue

            # Extract tax ID: "统一社会信用代码/纳税人识别号：91320..."
            # Must be 15-20 alphanumeric chars
            m = re.search(r'(?:统一社会信用代码|纳税人识别号|税号)\s*/?:?\s*[:：]?\s*([A-Za-z0-9]{15,20})', part)
            if m:
                tax_id = m.group(1).upper()
                if role == 'buyer' and not invoice.buyer_tax_id:
                    invoice.buyer_tax_id = tax_id
                elif role == 'seller' and not invoice.seller_tax_id:
                    invoice.seller_tax_id = tax_id

    def _extract_amounts_from_table(self, tables: list, invoice: InvoiceInfo):
        """
        Extract amounts from table rows. Look for:
        - 合计 row with ¥amounts
        - 价税合计 row with total
        """
        for table in tables:
            if not table:
                continue

            for row in table:
                if not row:
                    continue
                row_text = ' '.join(str(c or '') for c in row)

                # 价税合计 row: "壹佰柒拾玖圆玖角整 （小写） ¥179.90"
                if '价税合计' in row_text:
                    for cell in row:
                        if not cell:
                            continue
                        cell_str = str(cell)
                        # Look for (小写) ¥amount
                        m = re.search(r'[（(]小写[)）]\s*[¥￥]\s*([\d,]+\.?\d*)', cell_str)
                        if m and not invoice.total_amount:
                            try:
                                invoice.total_amount = float(m.group(1).replace(',', ''))
                            except:
                                pass

                # Item rows with amounts (look in concatenated cell text)
                # Table cells in these invoices are often concatenated into one big cell
                # Pattern: "合 计 ¥159.20 ¥20.70" or "合 计\n¥159.20 ¥20.70"
                if '合' in row_text and '计' in row_text and '价税' not in row_text:
                    for cell in row:
                        if not cell:
                            continue
                        cell_str = str(cell)
                        # Find all ¥ amounts on 合计 line
                        amounts = re.findall(r'[¥￥]\s*([\d,]+\.?\d+)', cell_str)
                        if len(amounts) >= 2:
                            # First ¥ is amount, second is tax amount
                            try:
                                if not invoice.amount:
                                    invoice.amount = float(amounts[0].replace(',', ''))
                                if not invoice.tax_amount:
                                    invoice.tax_amount = float(amounts[1].replace(',', ''))
                            except:
                                pass
                        elif len(amounts) == 1:
                            # Only one amount found
                            try:
                                if not invoice.amount:
                                    invoice.amount = float(amounts[0].replace(',', ''))
                            except:
                                pass

    def _extract_item_from_table(self, tables: list, invoice: InvoiceInfo):
        """Extract item name from table data rows."""
        if invoice.item_name:
            return

        for table in tables:
            if not table:
                continue

            for row in table:
                if not row:
                    continue

                for cell in row:
                    if not cell:
                        continue
                    cell_str = str(cell)

                    # Skip non-item cells
                    if any(kw in cell_str for kw in ['购', '销', '价税合计', '备注', '开票人']):
                        continue

                    # Look for item pattern: *category*brand product-spec
                    # e.g. "*家用清洁电器具*松下 MC-DC5G 台 1 220.35..."
                    m = re.search(r'\*([^*]+)\*(.+?)(?:\s+\d+\.\d|\s+台\s|\s+个\s|\s+套\s|\s+件\s|\s+只\s|\s*$)', cell_str)
                    if m:
                        category = m.group(1).strip()
                        brand_product = m.group(2).strip()
                        brand_product = re.split(r'\s{2,}', brand_product)[0]
                        brand_product = re.sub(r'\s+\d+$', '', brand_product).strip()
                        # If brand has a space-separated repeat (e.g. "皓齿健...牙刷 皓齿健 ..."), take first part
                        if ' ' in brand_product and len(brand_product) > 20:
                            first_word = brand_product.split()[0]
                            if len(first_word) >= 3:
                                brand_product = first_word
                        if len(brand_product) > 25:
                            brand_product = brand_product[:25].rstrip()
                        if brand_product and len(brand_product) >= 2:
                            invoice.item_name = f"{category}-{brand_product}" if category else brand_product
                            return

    # ============================================
    # TEXT-BASED EXTRACTION
    # ============================================

    def _extract_invoice_number(self, text: str, invoice: InvoiceInfo):
        if not invoice.invoice_code:
            m = re.search(r'发票代码\s*[:：]\s*(\d{10,12})', text)
            if m:
                invoice.invoice_code = m.group(1)

        if not invoice.invoice_number:
            m = re.search(r'发票号码\s*[:：]\s*(\d{8,20})', text)
            if m:
                invoice.invoice_number = m.group(1)
            # Fallback: standalone 20-digit number at start of text
            if not invoice.invoice_number:
                m = re.search(r'^(\d{20})\s*$', text, re.MULTILINE)
                if m:
                    invoice.invoice_number = m.group(1)

    def _extract_invoice_date(self, text: str, invoice: InvoiceInfo):
        if invoice.invoice_date:
            return
        m = re.search(r'(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日', text)
        if m:
            invoice.invoice_date = f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"

    def _extract_invoice_type(self, text: str, invoice: InvoiceInfo):
        if invoice.invoice_type:
            return
        # Order matters: longer matches first
        type_patterns = [
            ("电子发票（增值税发票）", "电子发票（增值税发票）"),
            ("电子发票(增值税发票)", "电子发票（增值税发票）"),
            ("增值税电子专用发票", "增值税电子专用发票"),
            ("增值税电子普通发票", "增值税电子普通发票"),
            ("增值税专用发票", "增值税专用发票"),
            ("增值税普通发票", "增值税普通发票"),
            ("电子发票（普通发票）", "电子发票（普通发票）"),
            ("电子发票(普通发票)", "电子发票（普通发票）"),
            ("电子发票", "电子发票"),
            ("全电发票", "全电发票"),
        ]
        for pattern, name in type_patterns:
            if pattern in text:
                invoice.invoice_type = name
                return

    def _extract_buyer_seller_from_text(self, text: str, invoice: InvoiceInfo):
        """
        Handle same-line buyer/seller format:
        "购 名称：万亚飞 销 名称：松下家电（中国）有限公司"
        "买 名 称 万亚飞 售 名 称 江苏京东海元贸易有限公司"
        """
        # Pattern 1: 名称：buyer 销 名称：seller (with colon)
        if not invoice.buyer_name or not invoice.seller_name:
            m = re.search(
                r'(?:购|买)\s*名\s*称\s*[:：]\s*(.+?)\s+(?:销|售)\s*名\s*称\s*[:：]\s*(.+)',
                text
            )
            if m:
                buyer = m.group(1).strip()
                seller = m.group(2).strip()
                if buyer and not invoice.buyer_name:
                    invoice.buyer_name = buyer
                if seller and not invoice.seller_name:
                    invoice.seller_name = self._clean_company_name(seller)

        # Pattern 2: 名 称 buyer 售 名 称 seller (no colon, spaces)
        if not invoice.buyer_name or not invoice.seller_name:
            m = re.search(
                r'(?:购|买)\s+名\s+称\s+(.+?)\s+(?:销|售)\s+名\s+称\s+(.+)',
                text
            )
            if m:
                buyer = m.group(1).strip().rstrip(':： ')
                seller = m.group(2).strip()
                if buyer and not invoice.buyer_name:
                    invoice.buyer_name = buyer
                if seller and not invoice.seller_name:
                    invoice.seller_name = self._clean_company_name(seller)

        # Extract tax IDs from text - buyer section comes before seller section
        if not invoice.buyer_tax_id or not invoice.seller_tax_id:
            # Find all 15-20 char tax IDs in text order
            tax_ids = re.findall(
                r'(?:统一社会信用代码|纳税人识别号|税号)\s*/?:?\s*[:：]?\s*([A-Za-z0-9]{15,20})',
                text
            )
            corp_tax_ids = [tid.upper() for tid in tax_ids if len(tid) >= 15]
            if corp_tax_ids:
                # If buyer is a person (no company keywords), skip buyer tax ID
                buyer_is_person = invoice.buyer_name and not self._looks_like_company_name(invoice.buyer_name)
                if buyer_is_person:
                    # First tax ID is likely buyer's personal ID, skip it
                    # Assign seller the LAST corporate tax ID (seller comes after buyer)
                    if not invoice.seller_tax_id:
                        invoice.seller_tax_id = corp_tax_ids[-1]
                else:
                    if not invoice.buyer_tax_id and len(corp_tax_ids) >= 1:
                        invoice.buyer_tax_id = corp_tax_ids[0]
                    if not invoice.seller_tax_id and len(corp_tax_ids) >= 2:
                        invoice.seller_tax_id = corp_tax_ids[1]

    def _extract_amounts_from_text(self, text: str, invoice: InvoiceInfo):
        """Extract amounts from text patterns."""

        # ---- 合计 line: "合 计\n¥159.20 ¥20.70" or "合 计 ¥7.88 ¥1.02" ----
        if not invoice.amount or not invoice.tax_amount:
            # Find 合计 followed by ¥ amounts (possibly on next line)
            m = re.search(r'合\s*计\s*\n?\s*[¥￥]\s*([\d,]+\.?\d+)\s+[¥￥]\s*([\d,]+\.?\d+)', text)
            if m:
                try:
                    if not invoice.amount:
                        invoice.amount = float(m.group(1).replace(',', ''))
                    if not invoice.tax_amount:
                        invoice.tax_amount = float(m.group(2).replace(',', ''))
                except:
                    pass

        # ---- 价税合计(小写): "（小写） ¥179.90" or "(小写) ¥8.90" ----
        if not invoice.total_amount:
            m = re.search(r'[（(]小写[)）]\s*[¥￥]\s*([\d,]+\.?\d*)', text)
            if m:
                try:
                    invoice.total_amount = float(m.group(1).replace(',', ''))
                except:
                    pass

        # ---- Fallback: single amount after 合计 ----
        if not invoice.amount:
            m = re.search(r'合\s*计\s*\n?\s*[¥￥]?\s*([\d,]+\.\d{2})', text)
            if m:
                try:
                    invoice.amount = float(m.group(1).replace(',', ''))
                except:
                    pass

        # ---- Tax rate ----
        if not invoice.tax_rate:
            # Look for tax rate in context (near 税率 or after %)
            m = re.search(r'(?:税率|征收率)\s*\n?\s*(\d{1,2})%', text)
            if m:
                rate = m.group(1)
                if rate in ('0', '1', '3', '5', '6', '9', '13'):
                    invoice.tax_rate = f"{rate}%"
            else:
                # Find percentage in amount context
                m = re.search(r'(\d{1,2})%', text)
                if m:
                    rate = m.group(1)
                    if rate in ('1', '3', '5', '6', '9', '13'):
                        invoice.tax_rate = f"{rate}%"

    def _extract_item_from_text(self, text: str, invoice: InvoiceInfo):
        """Extract item name from text."""
        if invoice.item_name:
            return

        # Pattern: *category*brand/product (stop at spec columns like unit/quantity/price)
        m = re.search(r'\*([^*]+)\*(.+?)(?:\s+\d+\.\d|\s+台\s|\s+个\s|\s+套\s|\s+件\s|\s+只\s|\s{2,}|\n)', text)
        if m:
            category = m.group(1).strip()
            brand = m.group(2).strip()
            brand = re.split(r'\s{2,}', brand)[0]
            brand = re.sub(r'\s+\d+$', '', brand).strip()
            if len(brand) > 30:
                brand = brand[:30].rstrip()
            if brand and len(brand) >= 2 and brand != '备注':
                invoice.item_name = f"{category}-{brand}" if category else brand
                return

        # Fallback: look for item rows in text
        lines = text.split('\n')
        for line in lines:
            stripped = line.strip()
            if stripped.startswith('*') and '*' in stripped[1:]:
                # *category*name pattern
                parts = stripped.split('*')
                if len(parts) >= 3:
                    category = parts[1].strip()
                    brand = parts[2].strip()
                    brand = re.split(r'\s{2,}', brand)[0]
                    brand = re.sub(r'\s+\d+$', '', brand).strip()
                    if len(brand) > 30:
                        brand = brand[:30].rstrip()
                    if brand and len(brand) >= 2:
                        invoice.item_name = f"{category}-{brand}" if category else brand
                        return

    def _extract_chinese_total(self, text: str, invoice: InvoiceInfo):
        if invoice.total_amount_chinese:
            return
        chinese_chars = r'[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整圆]'
        m = re.search(r'[（(]大写[)）]\s*(' + chinese_chars + r'{4,})', text)
        if m:
            invoice.total_amount_chinese = m.group(1)
        else:
            m = re.search(r'价税合计.*?(' + chinese_chars + r'{4,})', text)
            if m:
                invoice.total_amount_chinese = m.group(1)

    def _extract_remark(self, text: str, invoice: InvoiceInfo):
        """Extract remark (备注) field."""
        if invoice.remark:
            return
        
        # Method 1: Pattern "备 注：xxx" or "备注: xxx"
        m = re.search(r'备\s*注\s*[:：]\s*([\S\s]+?)(?:\n\s*(?:开\s*票\s*人|收\s*款\s*人|复\s*核|销\s*售|购\s*买)|$)', text)
        if m:
            remark = m.group(1).strip()
            # If multi-line, collapse to single line but keep spaces
            invoice.remark = re.sub(r'\s+', ' ', remark).strip()

    def _extract_issuer(self, text: str, invoice: InvoiceInfo):
        """Extract issuer (开票人) field."""
        if invoice.issuer:
            return
        
        # Look for "开票人" usually at bottom
        m = re.search(r'开\s*票\s*人\s*[:：]?\s*(\S+)', text)
        if m:
            invoice.issuer = m.group(1).strip()

    def _extract_sparse_format(self, text: str, invoice: InvoiceInfo):
        """
        Handle sparse-text PDFs like:
            24332001111494769913
            2024年05月30日
            大树科技有限公司 南京新媒体工作室
            91530112MACK55RA01 91530112MACK55RK08
            金额 税率/征收率 税额
            36461.19 13% 4739.96
            肆万壹仟贰佰零壹元壹角伍分 41201.15
        """
        lines = text.strip().split('\n')
        if len(lines) > 20:
            # Not a sparse format, skip
            return

        # Look for a line with two company/org-like names
        org_suffixes = ['公司', '工作室', '有限', '有限公', '厂', '中心', '部', '站', '局',
                        '处', '所', '院', '店', '行', '社', '商贸', '研究院',
                        '集团', '银行']
        if not invoice.buyer_name or not invoice.seller_name:
            for line in lines:
                stripped = line.strip()
                # Check if line contains org-like keywords
                has_org_keyword = any(kw in stripped for kw in org_suffixes)
                if not has_org_keyword:
                    continue
                
                # Try multi-space split first
                parts = re.split(r'\s{2,}', stripped)
                if len(parts) == 2:
                    name1 = parts[0].strip()
                    name2 = parts[1].strip()
                    if self._looks_like_company_name(name1) and self._looks_like_company_name(name2):
                        if not invoice.buyer_name:
                            invoice.buyer_name = name1
                        if not invoice.seller_name:
                            invoice.seller_name = name2
                        break
                
                # Try single-space split: find a boundary where an org suffix ends
                if len(parts) == 1:
                    suffix_pattern = '|'.join(re.escape(s) for s in org_suffixes)
                    m = re.match(r'(.+?(?:' + suffix_pattern + r'))\s+(.+)', stripped)
                    if m:
                        name1 = m.group(1).strip()
                        name2 = m.group(2).strip()
                        # At least one should look like a company name
                        if (self._looks_like_company_name(name1) or self._looks_like_company_name(name2)) and len(name1) >= 4 and len(name2) >= 4:
                            if not invoice.buyer_name:
                                invoice.buyer_name = name1
                            if not invoice.seller_name:
                                invoice.seller_name = name2
                            break

        # Line with two tax IDs
        if not invoice.buyer_tax_id or not invoice.seller_tax_id:
            for line in lines:
                ids = re.findall(r'([A-Za-z0-9]{15,20})', line.strip())
                if len(ids) == 2:
                    if not invoice.buyer_tax_id:
                        invoice.buyer_tax_id = ids[0].upper()
                    if not invoice.seller_tax_id:
                        invoice.seller_tax_id = ids[1].upper()
                    break

        # Line with "金额 税率 税额" followed by values
        for i, line in enumerate(lines):
            if '金额' in line and '税' in line and i + 1 < len(lines):
                vals = lines[i + 1].strip().split()
                if len(vals) >= 3:
                    try:
                        amount = float(vals[0].replace(',', ''))
                        tax_amount = float(vals[2].replace(',', ''))
                        if not invoice.amount:
                            invoice.amount = amount
                        if not invoice.tax_amount:
                            invoice.tax_amount = tax_amount
                    except:
                        pass
                    # Tax rate
                    if not invoice.tax_rate:
                        m = re.search(r'(\d{1,2})%', vals[1])
                        if m:
                            invoice.tax_rate = f"{m.group(1)}%"
                break

        # Line with Chinese total + number: "肆万壹仟贰佰零壹元壹角伍分 41201.15"
        chinese_chars = r'[零壹贰叁肆伍陆柒捌玖拾佰仟万亿元角分整圆]'
        for line in lines:
            m = re.match(r'(' + chinese_chars + r'{4,})\s+([\d,]+\.?\d*)', line.strip())
            if m:
                if not invoice.total_amount_chinese:
                    invoice.total_amount_chinese = m.group(1)
                if not invoice.total_amount:
                    try:
                        invoice.total_amount = float(m.group(2).replace(',', ''))
                    except:
                        pass
                break

    # ============================================
    # METADATA EXTRACTION
    # ============================================

    def _extract_metadata(self, pdf, invoice: InvoiceInfo):
        if not pdf.metadata:
            return

        custom = pdf.metadata.get("Custom", {})
        if not custom:
            custom = pdf.metadata

        invoice.invoice_number = (
            custom.get("InvoiceNumber") or custom.get("invoiceNumber") or
            custom.get("InvoiceNo") or custom.get("fphm")
        )
        invoice.seller_tax_id = custom.get("SellerIdNum") or custom.get("SellerTaxId")
        invoice.buyer_tax_id = custom.get("BuyerIdNum") or custom.get("BuyerTaxId")
        invoice.seller_name = custom.get("SellerName") or custom.get("xfmc")
        invoice.buyer_name = custom.get("BuyerName") or custom.get("gfmc")

        issue_time = custom.get("IssueTime") or custom.get("InvoiceDate") or custom.get("kprq")
        if issue_time:
            m = re.search(r'(\d{4})[-年/](\d{1,2})[-月/](\d{1,2})', issue_time)
            if m:
                invoice.invoice_date = f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"

        for key, attr in [
            ("TotalAmWithoutTax", "amount"), ("je", "amount"),
            ("TotalTax-includedAmount", "total_amount"), ("TotalAmount", "total_amount"), ("jshj", "total_amount"),
            ("TotalTaxAm", "tax_amount"), ("se", "tax_amount"),
        ]:
            val = custom.get(key)
            if val and not getattr(invoice, attr):
                try:
                    setattr(invoice, attr, float(val))
                except:
                    pass

        if invoice.invoice_number:
            invoice.parse_source = "metadata"

    # ============================================
    # UTILITIES
    # ============================================

    def _derive_amounts(self, invoice: InvoiceInfo):
        """Derive any missing amount from the other two."""
        a, t, ta = invoice.amount, invoice.total_amount, invoice.tax_amount
        if a and t and not ta:
            invoice.tax_amount = round(t - a, 2)
        elif t and ta and not a:
            invoice.amount = round(t - ta, 2)
        elif a and ta and not t:
            invoice.total_amount = round(a + ta, 2)

    def _clean_company_name(self, raw: str) -> Optional[str]:
        name = raw.strip()
        name = re.sub(r'\s*[A-Z0-9]{15,20}\s*$', '', name)
        name = re.sub(r'(纳税人识别号|统一社会信用代码|税号|地.*电话|开户行|账号).*$', '', name)
        name = name.strip(' \t:：')
        return name if len(name) >= 2 else None

    def _looks_like_company_name(self, text: str) -> bool:
        if not text or len(text) < 4:
            return False
        keywords = ['公司', '银行', '集团', '中心', '大学', '学院', '医院', '事务所',
                     '有限', '股份', '合伙', '工厂', '商店', '商行', '研究院', '研究所',
                     '工作室', '个体', '商贸', '厂', '部', '站', '局', '处', '所',
                     '院', '店', '行', '社', '有限公']  # '有限公' handles truncated '有限公司'
        return any(kw in text for kw in keywords)

    # ============================================
    # PUBLIC METHODS
    # ============================================

    def extract_raw_text(self, file_path: str, max_chars: int = 3000) -> str:
        if not os.path.exists(file_path):
            return ""
        try:
            with pdfplumber.open(file_path) as pdf:
                if not pdf.pages:
                    return ""
                text = pdf.pages[0].extract_text()
                return (text or "")[:max_chars]
        except Exception:
            return ""

    def batch_parse(self, folder_path: str) -> BatchParseResult:
        files = [f for f in os.listdir(folder_path) if f.lower().endswith('.pdf')]

        success_list = []
        errors = []
        duplicates = []
        seen_keys = set()

        for idx, f in enumerate(files):
            print(json.dumps({
                "type": "progress",
                "current": idx + 1,
                "total": len(files),
                "file": f
            }), flush=True)

            fp = os.path.join(folder_path, f)
            ok, inv, err = self.parse_single_invoice(fp)

            if ok and inv:
                key = inv.invoice_number if inv.invoice_number else f"{inv.seller_name}|{inv.amount}|{inv.invoice_date}"

                if key in seen_keys:
                    duplicates.append(DuplicateRecord(
                        file_name=f,
                        invoice_number=inv.invoice_number,
                        reason="批次内重复"
                    ))
                else:
                    seen_keys.add(key)
                    success_list.append(inv)
            else:
                errors.append(ErrorRecord(file_path=fp, error=err or "Unknown error"))

        return BatchParseResult(
            success=len(success_list) > 0,
            invoices=success_list,
            errors=errors,
            duplicates=duplicates,
            total_files=len(files),
            success_count=len(success_list),
            duplicate_count=len(duplicates),
            fail_count=len(errors)
        )

    def export_excel(self, invoices: List[InvoiceInfo], output_path: str) -> None:
        import pandas as pd

        data = []
        for index, inv in enumerate(invoices):
            data.append({
                "序号": index + 1,
                "发票号码": inv.invoice_number,
                "购方名称": inv.buyer_name,
                "购方税号": inv.buyer_tax_id,
                "销方名称": inv.seller_name,
                "销方税号": inv.seller_tax_id,
                "开票日期": inv.invoice_date,
                "项目名称": inv.item_name,
                "金额": inv.amount,
                "税率": inv.tax_rate,
                "税额": inv.tax_amount,
                "价税合计": inv.total_amount,
                "备注": inv.remark,
                "开票人": inv.issuer,
                "价税合计(大写)": inv.total_amount_chinese,
                "源文件": inv.file_path
            })

        df = pd.DataFrame(data)
        os.makedirs(os.path.dirname(output_path) or '.', exist_ok=True)

        with pd.ExcelWriter(output_path, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='发票清单')
            worksheet = writer.sheets['发票清单']
            for i, col in enumerate(df.columns):
                max_len = max(df[col].astype(str).map(len).max(), len(col)) + 2
                col_letter = chr(65 + i) if i < 26 else chr(64 + i // 26) + chr(65 + i % 26)
                worksheet.column_dimensions[col_letter].width = min(max_len, 50)
