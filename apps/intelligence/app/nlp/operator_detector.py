"""Detect which operators/companies are mentioned in an article."""
from __future__ import annotations

from app.nlp.normalizer import normalize_text

# slug -> (display name, aliases)
OPERATOR_REGISTRY: dict[str, tuple[str, list[str]]] = {
    "ypf": ("YPF", ["ypf", "yacimientos petrolíferos", "yacimientos petroliferos"]),
    "pae": ("Pan American Energy", ["pan american energy", "pae", "pan american"]),
    "vista_energy": ("Vista Energy", ["vista energy", "vista oil", "vista oil & gas"]),
    "tecpetrol": ("Tecpetrol", ["tecpetrol", "techpetrol"]),
    "totalenergies": ("TotalEnergies", ["totalenergies", "total energies", "total argentina"]),
    "shell": ("Shell Argentina", ["shell argentina", "shell"]),
    "chevron": ("Chevron Argentina", ["chevron argentina", "chevron"]),
    "pluspetrol": ("Pluspetrol", ["pluspetrol", "plus petrol"]),
    "cgc": ("CGC", ["cgc", "compañía general de combustibles", "compania general de combustibles"]),
    "pampa": ("Pampa Energía", ["pampa energía", "pampa energia", "pampa energy"]),
    "slb": ("SLB", ["slb", "schlumberger"]),
    "halliburton": ("Halliburton", ["halliburton"]),
    "baker_hughes": ("Baker Hughes", ["baker hughes", "bhge"]),
    "weatherford": ("Weatherford", ["weatherford"]),
    "techint": ("Techint", ["techint", "techint ingeniería", "techint ingenieria"]),
    "aesa": ("AESA", ["aesa"]),
    "sacde": ("SACDE", ["sacde"]),
    "pecom": ("Pecom", ["pecom", "pecom energía", "pecom energia"]),
    "san_antonio": ("San Antonio", ["san antonio", "san antonio internacional"]),
    "calfrac": ("Calfrac", ["calfrac"]),
}


def detect_operators(title: str, content: str = "") -> list[str]:
    """Return slugs of operators/companies mentioned in the text."""
    combined = normalize_text(f"{title} {content[:3000]}")
    found: list[str] = []
    for slug, (_, aliases) in OPERATOR_REGISTRY.items():
        if any(alias in combined for alias in aliases):
            found.append(slug)
    return found


def get_operator_info(slug: str) -> dict | None:
    if slug not in OPERATOR_REGISTRY:
        return None
    name, aliases = OPERATOR_REGISTRY[slug]
    return {"slug": slug, "name": name, "aliases": aliases}


def list_operators() -> list[dict]:
    return [
        {"slug": slug, "name": name, "aliases": aliases}
        for slug, (name, aliases) in OPERATOR_REGISTRY.items()
    ]
