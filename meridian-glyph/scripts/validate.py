"""
validate.py — Meridian Glyph Emoji Dictionary Validator
Checks that an emoji type is valid before authoring tools accept it.
Called by author.py internally. Can also be called standalone.

Usage:
    python validate.py --type EMOJI_TYPE_ID
    python validate.py --emoji 💡
"""

import sys, argparse, re
from pathlib import Path

DICT_PATH = Path(__file__).parent.parent / "workflows" / "dictionary.md"

DOMAIN_TYPES = {}
LANDMARK_TYPES = {}
HEAT_WEIGHTS = {}

def load_dictionary():
    text = DICT_PATH.read_text(encoding="utf-8")
    section = None
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("## DOMAIN TYPES"):
            section = "domain"
        elif line.startswith("## LANDMARK TYPES"):
            section = "landmark"
        elif line.startswith("## HEAT LEVELS"):
            section = "heat"
        elif line.startswith("##"):
            section = None

        if section in ("domain", "landmark") and "|" in line and not line.startswith("#"):
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 3:
                emoji, type_id, desc = parts[0], parts[1], parts[2]
                entry = {"emoji": emoji, "type_id": type_id, "description": desc}
                if section == "domain":
                    DOMAIN_TYPES[type_id] = entry
                    DOMAIN_TYPES[emoji] = entry
                elif section == "landmark":
                    LANDMARK_TYPES[type_id] = entry
                    LANDMARK_TYPES[emoji] = entry

        if section == "heat" and "|" in line and not line.startswith("#"):
            parts = [p.strip() for p in line.split("|")]
            if len(parts) == 2 and "weight:" in parts[1]:
                emoji = parts[0]
                weight = int(parts[1].replace("weight:", "").strip())
                HEAT_WEIGHTS[emoji] = weight


def validate(query: str) -> dict:
    load_dictionary()
    query = query.strip()
    if query in DOMAIN_TYPES:
        entry = DOMAIN_TYPES[query]
        return {"valid": True, "category": "domain", **entry,
                "weight": HEAT_WEIGHTS.get(entry["emoji"], 1)}
    if query in LANDMARK_TYPES:
        entry = LANDMARK_TYPES[query]
        return {"valid": True, "category": "landmark", **entry,
                "weight": HEAT_WEIGHTS.get(entry["emoji"], 1)}
    return {
        "valid": False,
        "query": query,
        "message": f"'{query}' not found in dictionary. "
                   f"Add it to workflows/dictionary.md if it's a new type."
    }


def all_valid_types() -> dict:
    load_dictionary()
    return {
        "domain": list({v["type_id"] for v in DOMAIN_TYPES.values()}),
        "landmark": list({v["type_id"] for v in LANDMARK_TYPES.values()}),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--type",  help="Type ID to validate e.g. INSIGHT")
    ap.add_argument("--emoji", help="Emoji to validate e.g. 💡")
    ap.add_argument("--list",  action="store_true", help="List all valid types")
    args = ap.parse_args()

    import json
    if args.list:
        print(json.dumps(all_valid_types(), indent=2, ensure_ascii=False))
    elif args.type or args.emoji:
        result = validate(args.type or args.emoji)
        print(json.dumps(result, indent=2, ensure_ascii=False))
        sys.exit(0 if result["valid"] else 1)
    else:
        ap.print_help()
