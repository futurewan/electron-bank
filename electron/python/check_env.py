
import sys
import json
import importlib

def check_env():
    result = {
        "available": False,
        "python_version": sys.version,
        "missing": []
    }
    
    # Check dependencies
    required_packages = ["pdfplumber", "pandas", "openpyxl"]
    missing = []
    
    for package in required_packages:
        try:
            importlib.import_module(package)
        except ImportError:
            missing.append(package)
            
    if not missing:
        result["available"] = True
    else:
        result["missing"] = missing
        
    print(json.dumps(result))

if __name__ == "__main__":
    check_env()
