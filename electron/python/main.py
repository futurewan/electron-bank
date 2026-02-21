
import argparse
import sys
import json
import traceback
from dataclasses import asdict
from invoice_parser import InvoiceParser
from models import InvoiceInfo

def main():
    parser = argparse.ArgumentParser(description="Electron-Bank Invoice Parser")
    # Add subparsers and use 'dest' to identify which subcommand was called
    subparsers = parser.add_subparsers(dest="command", help="Command to run")
    
    # Parse command
    parse_cmd = subparsers.add_parser("parse", help="Batch parse PDFs")
    parse_cmd.add_argument("--folder", required=True, help="Folder containing PDFs")
    
    # Export command
    export_cmd = subparsers.add_parser("export", help="Export to Excel")
    export_cmd.add_argument("--output", required=True, help="Output Excel file path")

    # Extract text command (for AI)
    extract_cmd = subparsers.add_parser("extract_text", help="Extract raw text for AI")
    extract_cmd.add_argument("--file", required=True, help="PDF file path")
    extract_cmd.add_argument("--max_chars", type=int, default=3000, help="Max characters to extract")
    
    args = parser.parse_args()
    
    try:
        if args.command == "parse":
            parser_svc = InvoiceParser()
            result = parser_svc.batch_parse(args.folder)
            
            # Print final result wrapped in {"type": "result", "data": ...}
            # so the TS-side onProgress handler can identify it correctly
            print(json.dumps({
                "type": "result",
                "data": asdict(result)
            }))
            
        elif args.command == "export":
            # Read invoices from stdin
            # Use sys.stdin.buffer.read() to handle potential encoding issues if needed, but text read is usually fine
            input_data = sys.stdin.read()
            if not input_data:
                raise ValueError("No input data provided")
                
            invoices_data = json.loads(input_data)
            
            # Convert dicts back to InvoiceInfo objects - careful with optional fields
            # dataclasses.asdict might have serialised Nones, ensure we can init back
            # InvoiceInfo has defaults so it should be fine
            invoices = [InvoiceInfo(**inv) for inv in invoices_data]
            
            parser_svc = InvoiceParser()
            parser_svc.export_excel(invoices, args.output)
            
            print(json.dumps({
                "success": True,
                "file_path": args.output
            }))

        elif args.command == "extract_text":
            parser_svc = InvoiceParser()
            text = parser_svc.extract_raw_text(args.file, args.max_chars)
            print(json.dumps({
                "success": True,
                "text": text,
                "length": len(text)
            }))

            
    except Exception as e:
        traceback.print_exc(file=sys.stderr)
        print(json.dumps({
            "type": "error",
            "message": str(e)
        }))
        sys.exit(1)

if __name__ == "__main__":
    main()
