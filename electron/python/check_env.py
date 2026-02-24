
import sys
import json
import importlib

def check_env():
    result = {
        "available": False,
        "python_version": sys.version,
        "missing": [],
        "errors": {}
    }
    
    # Check dependencies
    required_packages = ["pdfplumber", "pandas", "openpyxl"]
    missing = []
    
    for package in required_packages:
        try:
            importlib.import_module(package)
        except ImportError as e:
            missing.append(package)
            result["errors"][package] = str(e)
        except Exception as e:
            missing.append(package)
            result["errors"][package] = str(e)
            
    if not missing:
        result["available"] = True
    else:
        result["missing"] = missing
        
    print(json.dumps(result))

if __name__ == "__main__":
    check_env()
