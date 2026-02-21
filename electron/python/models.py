
from dataclasses import dataclass
from typing import Optional, List

@dataclass
class InvoiceInfo:
    file_path: str
    file_name: str
    invoice_code: Optional[str] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[str] = None
    buyer_name: Optional[str] = None
    buyer_tax_id: Optional[str] = None
    seller_name: Optional[str] = None
    seller_tax_id: Optional[str] = None
    amount: Optional[float] = None
    tax_amount: Optional[float] = None
    total_amount: Optional[float] = None
    tax_rate: Optional[str] = None
    invoice_type: Optional[str] = None
    item_name: Optional[str] = None
    total_amount_chinese: Optional[str] = None
    remark: Optional[str] = None
    issuer: Optional[str] = None
    parse_source: str = "none"

@dataclass
class DuplicateRecord:
    file_name: str
    invoice_number: Optional[str]
    reason: str

@dataclass
class ErrorRecord:
    file_path: str
    error: str

@dataclass
class BatchParseResult:
    success: bool
    invoices: List[InvoiceInfo]
    errors: List[ErrorRecord]
    duplicates: List[DuplicateRecord]
    total_files: int
    success_count: int
    duplicate_count: int
    fail_count: int
