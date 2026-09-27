import urllib.parse
from decimal import Decimal
from typing import Optional

def generate_upi_link(
    upi_id: Optional[str],
    payee_name: str,
    amount: Decimal,
    transaction_note: Optional[str] = "Flat Expense Settlement"
) -> Optional[str]:
    if not upi_id or not upi_id.strip():
        return None
    
    clean_upi = upi_id.strip()
    clean_name = payee_name.strip()
    formatted_amount = f"{amount:.2f}"
    clean_note = (transaction_note or "Flat Expense Settlement").strip()
    
    params = {
        "pa": clean_upi,
        "pn": clean_name,
        "am": formatted_amount,
        "cu": "INR",
        "tn": clean_note
    }
    
    query_string = urllib.parse.urlencode(params)
    return f"upi://pay?{query_string}"
