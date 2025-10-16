from enum import Enum
from typing import List
from pydantic import BaseModel, ValidationError
from openai import OpenAI
from config import settings
import json
import re

client = OpenAI(api_key=settings.OPENAI_API_KEY)


# ---- ENUM for measurement units ----
class MeasurementUnit(str, Enum):
    KG = "kg"
    G = "g"
    UNIT = "unit"
    ML = "ml"
    L = "l"
    PACK = "pack"
    UNKNOWN = "unknown"


# ---- Schema for a product item ----
class ProductItem(BaseModel):
    name: str
    quantity: float
    unit: MeasurementUnit


def _normalize_unit(u: str) -> MeasurementUnit:
    """
    Normalize a free-text unit string to the MeasurementUnit enum.
    """
    if not u:
        return MeasurementUnit.UNKNOWN
    s = str(u).strip().lower()

    # common aliases
    aliases = {
        "kgs": "kg",
        "kilogram": "kg",
        "kilograms": "kg",

        "gram": "g",
        "grams": "g",

        "unidad": "unit",
        "unidades": "unit",
        "piece": "unit",
        "pieces": "unit",
        "pc": "unit",
        "pcs": "unit",

        "milliliter": "ml",
        "milliliters": "ml",
        "cc": "ml",

        "liter": "l",
        "liters": "l",
        "lt": "l",

        "packaging": "pack",
        "package": "pack",
        "pkg": "pack",
        "pk": "pack",
        "paquete": "pack",
    }
    s = aliases.get(s, s)

    if s in {e.value for e in MeasurementUnit}:
        return MeasurementUnit(s)
    return MeasurementUnit.UNKNOWN


def _extract_text_from_response(resp) -> str:
    """
    Robustly extract text from the Responses API output.
    Tries .output_text; falls back to concatenating content blocks.
    """
    # Preferred (newer SDKs)
    if hasattr(resp, "output_text") and resp.output_text:
        return resp.output_text

    # Fallback: join text blocks from resp.output[*].content[*].text
    parts = []
    for block in getattr(resp, "output", []) or []:
        for c in getattr(block, "content", []) or []:
            # Some SDKs use type="output_text" or "text"
            ctype = getattr(c, "type", None)
            if ctype in ("output_text", "text"):
                txt = getattr(c, "text", None)
                if txt:
                    parts.append(txt)
    return "\n".join(parts).strip()


def _strip_code_fences(s: str) -> str:
    """
    If the model wrapped JSON in ``` fences, remove them.
    Also try to slice out the JSON array between the first '[' and the last ']'.
    """
    if not s:
        return s
    # Remove triple backticks blocks if present
    # e.g. ```json ... ``` or ``` ... ```
    fence_match = re.search(r"```(?:json|javascript)?\s*([\s\S]*?)```", s, flags=re.IGNORECASE)
    if fence_match:
        s = fence_match.group(1).strip()

    # Extract JSON array substring if extra text remains
    start = s.find("[")
    end = s.rfind("]")
    if start != -1 and end != -1 and end > start:
        return s[start:end + 1].strip()

    return s.strip()


def extract_receipt_items(image_url: str) -> List[ProductItem]:
    """
    Given a receipt image URL, analyze it and return a List[ProductItem].
    This version does NOT rely on response_format or responses.parse (to avoid SDK incompatibilities).
    It prompts the model to return a pure JSON array, then parses and validates with Pydantic.
    """
    messages = [
        {
            "role": "system",
            "content": (
                "You are an expert OCR and grocery receipt parser.\n"
                "Return ONLY a valid JSON array (no prose). Each array element must be an object with:\n"
                "  - \"name\": string (product name)\n"
                "  - \"quantity\": number (numeric quantity; if not specified on the receipt, assume 1)\n"
                "  - \"unit\": string, one of: \"kg\",\"g\",\"unit\",\"ml\",\"l\",\"pack\",\"unknown\"\n"
                "Ignore totals, taxes, discounts, headers, footers, or delivery fees unless they are clearly product lines.\n"
                "Output must be a JSON array. No comments, no trailing commas, no code fences."
            ),
        },
        {
            "role": "user",
            "content": [
                {"type": "input_text", "text": "Extract all purchased items from this receipt:"},
                {"type": "input_image", "image_url": image_url},
            ],
        },
    ]

    # Call the Responses API
    resp = client.responses.create(
        model="gpt-4o-mini",  # or "gpt-4o" for higher accuracy
        input=messages,
    )

    raw = _extract_text_from_response(resp)
    cleaned = _strip_code_fences(raw)

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as je:
        raise RuntimeError(
            f"Could not parse JSON from model output: {je}\nRaw output:\n{raw}"
        )

    if isinstance(data, dict) and "items" in data and isinstance(data["items"], list):
        items_payload = data["items"]  # in case the model returned { "items": [...] }
    elif isinstance(data, list):
        items_payload = data
    else:
        raise RuntimeError(
            f"Unexpected JSON shape. Expected a list or an object with 'items'. Got: {type(data)}"
        )

    normalized: List[ProductItem] = []
    for obj in items_payload:
        if not isinstance(obj, dict):
            continue

        name = str(obj.get("name", "")).strip()
        if not name:
            # skip nameless rows
            continue

        # quantity: coerce to float
        qty_raw = obj.get("quantity", 1)
        try:
            quantity = float(qty_raw)
        except Exception:
            # e.g., "2 x" or "1 paquete"
            digits = re.findall(r"[\d]+(?:[.,]\d+)?", str(qty_raw))
            quantity = float(digits[0].replace(",", ".")) if digits else 1.0

        # unit: normalize to enum
        unit = _normalize_unit(str(obj.get("unit", "")).strip())

        try:
            normalized.append(ProductItem(name=name, quantity=quantity, unit=unit))
        except ValidationError as ve:
            # If something still goes wrong, mark as unknown unit and try again
            try:
                normalized.append(
                    ProductItem(name=name, quantity=quantity, unit=MeasurementUnit.UNKNOWN)
                )
            except ValidationError:
                # skip irreparable rows
                print(f"Skipping invalid item: {obj} -> {ve}")

    return normalized
