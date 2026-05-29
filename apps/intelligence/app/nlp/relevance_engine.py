"""
O&G Relevance Engine — fast keyword-based pre-filter before sending to LLM.

Design:
- Positive O&G signals boost the score
- Agricultural/unrelated topics PENALIZE the score
- Only articles with score > MIN_FOR_LLM are sent to the LLM
- This prevents "Baja de retenciones al agro" from reaching the LLM

Score range: 0.0 (completely irrelevant) to 1.0 (critical O&G content)
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.nlp.normalizer import normalize_text


# ── TIER 1: Core O&G keywords (high weight) ──────────────────────────────────
CORE_OG_TERMS = {
    "vaca muerta", "vacamuerta",
    "upstream", "downstream", "midstream",
    "petróleo", "petroleo", "hidrocarburo", "hidrocarburos",
    "gas natural", "gas natural licuado", "lng", "gnl",
    "perforación", "perforacion", "fractura hidráulica", "fracking", "fractura",
    "shale", "tight gas", "oil", "crude",
    "oleoducto", "gasoducto", "poliducto",
    "refinería", "refineria", "refinación", "refinacion",
    "yacimiento", "reservorio", "formación neuquina", "formacion neuquina",
    "plataforma", "rig", "well", "pozos", "pozo",
    "barrel", "barril", "mmcf", "mmboe", "boe",
    "offshore", "onshore",
    "rig count", "drilling", "workover",
    "completion", "stimulation", "well pad",
    "enhanced oil recovery", "eor",
    "basin", "cuenca neuquina", "cuenca",
    "tight oil", "unconventional",
}

# ── TIER 2: O&G companies & projects ─────────────────────────────────────────
OPERATOR_TERMS = {
    "ypf", "y.p.f",
    "pan american energy", "pae",
    "vista energy", "vista oil",
    "tecpetrol",
    "totalenergies", "total energies",
    "shell argentina", "shell",
    "chevron argentina", "chevron",
    "pluspetrol",
    "cgc", "compañía general de combustibles",
    "pampa energía", "pampa energia",
    "slb", "schlumberger",
    "halliburton",
    "baker hughes",
    "weatherford",
    "techint",
    "aesa",
    "sacde",
    "pecom",
    "san antonio",
    "calfrac",
    "rystad", "rystad energy",
    "iapg",
    "enarsa", "ieasa",
    "cammesa",
    "nqn", "neuquén energía", "neuquen energia",
}

# ── TIER 3: O&G economic/financial terms ─────────────────────────────────────
OG_FINANCIAL_TERMS = {
    "capex", "opex",
    "inversión en energía", "inversion en energia",
    "producción de petróleo", "produccion de petroleo",
    "producción de gas", "produccion de gas",
    "exportación de gas", "exportacion de gas", "exportación de lng",
    "precio del petróleo", "precio del gas", "precio del barril",
    "brent", "wti",
    "royalty", "regalías", "regalias",
    "hidrocarburos no convencionales",
    "energía no convencional",
    "gasoducto néstor kirchner", "gnk",
    "vaca muerta one", "blue star",
    "megawatt", "mw", "gw",
    "plan gas", "gas.ar",
    "encuesta de perforación",
    "actividad exploratoria", "exploración y producción",
    "exploracion y produccion", "e&p",
    "servicios petroleros",
    "oilfield services",
    "licitación petrolera", "licitacion petrolera",
    "concesión de explotación", "concesion de explotacion",
}

# ── NEGATIVE: terms that penalize score (non-O&G context) ────────────────────
AGRO_PENALTY_TERMS = {
    "retenciones al agro", "retenciones agropecuarias",
    "campo soja", "exportaciones soja", "soja",
    "maíz", "maiz", "trigo", "girasol", "cebada",
    "agropecuaria", "agropecuario", "sector agropecuario",
    "ganadería", "ganaderia", "vacunos", "bovinos",
    "cosecha récord", "cosecha record",
    "siembra", "hectáreas sembradas",
    "exportación de granos", "exportacion de granos",
    "feedlot", "tambero",
}

UNRELATED_PENALTY_TERMS = {
    "fútbol", "futbol", "copa del mundo", "mundial",
    "tennis", "tenis", "básquet", "basquet",
    "elecciones presidenciales", "campaña electoral", "voto",
    "turismo", "viaje", "hotel", "aeropuerto",
    "moda", "fashion", "indumentaria",
    "salud pública", "salud publica", "pandemia", "vacuna covid",
    "educación básica", "educacion basica",
    "criptomonedas", "bitcoin", "ethereum",
    "inmobiliario", "real estate", "alquiler vivienda",
}

# ── BOOST RULES: specific high-value contexts ────────────────────────────────
BOOST_RULES = [
    # Vaca Muerta content gets strong boost
    (re.compile(r"vaca\s+muerta", re.I), 0.30),
    # Rystad = benchmark international content
    (re.compile(r"rystad", re.I), 0.25),
    # Drilling activity
    (re.compile(r"\bdrilling\b|\bperforaci[oó]n\b|\brig\s+count\b", re.I), 0.20),
    # LNG exports
    (re.compile(r"\blng\b|\bgnl\b|\blicuefacci[oó]n\b", re.I), 0.20),
    # Production forecasts
    (re.compile(r"forecast|proyecci[oó]n.*producci[oó]n|producci[oó]n.*barril", re.I), 0.15),
    # Contract/investment news
    (re.compile(r"contrat[oa]|licitaci[oó]n|adjudicaci[oó]n|inversi[oó]n.*mill", re.I), 0.12),
]


@dataclass
class RelevanceResult:
    score: float
    label: str               # critical | high | medium | low | irrelevant
    send_to_llm: bool
    matched_terms: list[str] = field(default_factory=list)
    penalty_terms: list[str] = field(default_factory=list)
    boost_rules_matched: list[str] = field(default_factory=list)
    explanation: str = ""


def score_article(title: str, content: str = "", source_is_priority: bool = False) -> RelevanceResult:
    """
    Fast keyword-based O&G relevance scoring.
    Returns score 0.0–1.0 and whether to send to LLM for full classification.
    """
    combined = normalize_text(f"{title} {content[:2000]}")
    title_norm = normalize_text(title)

    score = 0.0
    matched: list[str] = []
    penalties: list[str] = []
    boosts: list[str] = []

    # ── 1. Core O&G terms ────────────────────────────────────────────────────
    for term in CORE_OG_TERMS:
        if term in combined:
            weight = 0.18 if term in title_norm else 0.10
            score += weight
            matched.append(term)

    # ── 2. Operator/company terms ────────────────────────────────────────────
    for term in OPERATOR_TERMS:
        if term in combined:
            weight = 0.15 if term in title_norm else 0.08
            score += weight
            matched.append(term)

    # ── 3. Financial/market O&G terms ────────────────────────────────────────
    for term in OG_FINANCIAL_TERMS:
        if term in combined:
            weight = 0.10 if term in title_norm else 0.06
            score += weight
            matched.append(term)

    # ── 4. Boost rules ───────────────────────────────────────────────────────
    for pattern, boost in BOOST_RULES:
        if pattern.search(combined):
            score += boost
            boosts.append(pattern.pattern[:40])

    # ── 5. Priority source bump ──────────────────────────────────────────────
    if source_is_priority and score > 0.05:
        score *= 1.15

    # ── 6. Agricultural penalties ────────────────────────────────────────────
    for term in AGRO_PENALTY_TERMS:
        if term in combined:
            score -= 0.35
            penalties.append(term)

    # ── 7. Unrelated topic penalties ─────────────────────────────────────────
    for term in UNRELATED_PENALTY_TERMS:
        if term in combined:
            score -= 0.20
            penalties.append(term)

    # Cap and deduplicate
    score = max(0.0, min(1.0, score))
    matched = list(dict.fromkeys(matched))[:10]

    # Label
    if score >= 0.65:
        label = "critical"
    elif score >= 0.45:
        label = "high"
    elif score >= 0.25:
        label = "medium"
    elif score >= 0.10:
        label = "low"
    else:
        label = "irrelevant"

    from app.config import get_settings
    min_for_llm = get_settings().min_og_relevance_for_llm
    send_to_llm = score >= min_for_llm

    explanation = (
        f"score={score:.2f} matched={matched[:3]} penalties={penalties[:2]} boosts={boosts[:2]}"
    )

    return RelevanceResult(
        score=round(score, 3),
        label=label,
        send_to_llm=send_to_llm,
        matched_terms=matched,
        penalty_terms=penalties,
        boost_rules_matched=boosts,
        explanation=explanation,
    )


PRIORITY_DOMAINS = {
    "econojournal.com.ar",
    "energiaonline.com.ar",
    "mase.lmneuquen.com",
    "lmneuquen.com",
    "mejorenergia.com.ar",
    "rystadenergy.com",
    "guiavacamuerta.com",
    "iapg.org.ar",
    "energia-argentina.com.ar",
}


def is_priority_source(url: str) -> bool:
    return any(domain in url.lower() for domain in PRIORITY_DOMAINS)
