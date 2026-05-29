"""
LLM-based article classification.
Only called for articles that pass the pre-filter (score >= MIN_FOR_LLM).
Uses Groq (fast/cheap) with Anthropic as fallback.
"""
from __future__ import annotations

import json
import re
import time
from dataclasses import dataclass, field
from typing import Any

import structlog

log = structlog.get_logger(__name__)

_SYSTEM_PROMPT = """\
Eres un analista experto en el sector Oil & Gas Argentina, especializado en Vaca Muerta, \
upstream, midstream, downstream, LNG, servicios petroleros y mercados de hidrocarburos.

REGLAS ESTRICTAS DE RELEVANCIA:
1. Solo el impacto DIRECTO en el sector O&G Argentina eleva el relevance_score.
2. "Retenciones al agro", política agraria, soja, maíz, trigo = relevance_score < 0.15 SIEMPRE.
3. Deportes, turismo, salud pública sin vínculo energético = relevance_score < 0.10.
4. Vaca Muerta, perforación, shale, LNG, upstream = relevance_score >= 0.60 mínimo.
5. Rystad Energy y benchmarks internacionales son SIEMPRE alta prioridad.

Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown."""

_USER_TEMPLATE = """\
Analiza este artículo del sector O&G Argentina:

TÍTULO: {title}
FUENTE: {source_url}

CONTENIDO:
{content}

Responde con este JSON exacto:
{{
  "category": "upstream|downstream|midstream|supply_chain|regulation|market|company|environment|politics|infrastructure|other",
  "subcategory": "string (máx 40 chars)",
  "sentiment": "positive|negative|neutral",
  "relevance_score": 0.0,
  "supply_chain_impact": "string o null",
  "keywords": ["kw1", "kw2", "kw3"],
  "summary": "Resumen 2-3 oraciones en español.",
  "risk_level": "low|medium|high",
  "entities": [
    {{"name": "...", "type": "company|person|location|project|regulation", "context": "..."}}
  ]
}}

Criterios relevance_score:
- 0.0–0.15: Sin impacto O&G (agro, deportes, política no energética)
- 0.15–0.40: Impacto indirecto o contexto macroeconómico
- 0.40–0.65: Impacto moderado en operaciones o mercado O&G
- 0.65–0.85: Impacto significativo (contratos, producción, regulación energética)
- 0.85–1.00: Impacto crítico (disrupciones, Vaca Muerta, LNG, cambios regulatorios mayores)"""


@dataclass
class ClassificationResult:
    category: str = "other"
    subcategory: str = ""
    sentiment: str = "neutral"
    relevance_score: float = 0.0
    supply_chain_impact: str | None = None
    keywords: list[str] = field(default_factory=list)
    summary: str = ""
    risk_level: str = "low"
    entities: list[dict[str, str]] = field(default_factory=list)
    model_used: str = ""
    latency_ms: int = 0


_VALID_CATEGORIES = {
    "upstream", "downstream", "midstream", "supply_chain", "regulation",
    "market", "company", "environment", "politics", "infrastructure", "other",
}
_VALID_SENTIMENTS = {"positive", "negative", "neutral"}
_VALID_RISK = {"low", "medium", "high"}
_VALID_ENTITY_TYPES = {"company", "person", "location", "project", "regulation"}


def _parse_response(raw: str) -> dict[str, Any]:
    raw = raw.strip()
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        raise ValueError(f"No JSON found in response: {raw[:200]}")
    return json.loads(m.group(0))


def _sanitize(data: dict) -> ClassificationResult:
    def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
        return max(lo, min(hi, float(v)))

    return ClassificationResult(
        category=data.get("category", "other") if data.get("category") in _VALID_CATEGORIES else "other",
        subcategory=str(data.get("subcategory", ""))[:40],
        sentiment=data.get("sentiment", "neutral") if data.get("sentiment") in _VALID_SENTIMENTS else "neutral",
        relevance_score=clamp(data.get("relevance_score", 0.0)),
        supply_chain_impact=data.get("supply_chain_impact") or None,
        keywords=[str(k) for k in (data.get("keywords") or [])[:10]],
        summary=str(data.get("summary", ""))[:1000],
        risk_level=data.get("risk_level", "low") if data.get("risk_level") in _VALID_RISK else "low",
        entities=[
            {
                "name": str(e.get("name", ""))[:200],
                "type": e.get("type", "company") if e.get("type") in _VALID_ENTITY_TYPES else "company",
                "context": str(e.get("context", ""))[:500],
            }
            for e in (data.get("entities") or [])[:10]
            if e.get("name")
        ],
    )


async def classify_article(
    title: str,
    content: str,
    source_url: str = "",
    pre_filter_score: float = 0.0,
) -> ClassificationResult:
    from app.config import get_settings
    settings = get_settings()

    content_trunc = content[:3000] if content else title
    prompt = _USER_TEMPLATE.format(
        title=title,
        source_url=source_url or "desconocida",
        content=content_trunc,
    )

    t0 = time.monotonic()

    if settings.preferred_ai_provider == "groq" and settings.groq_api_key:
        result = await _classify_groq(prompt, settings.groq_api_key)
    elif settings.anthropic_api_key:
        result = await _classify_anthropic(prompt, settings.anthropic_api_key)
    else:
        raise RuntimeError("No AI provider configured (set GROQ_API_KEY or ANTHROPIC_API_KEY)")

    result.latency_ms = int((time.monotonic() - t0) * 1000)
    log.debug("article_classified",
              title=title[:60],
              relevance=result.relevance_score,
              category=result.category,
              latency_ms=result.latency_ms)
    return result


async def _classify_groq(prompt: str, api_key: str) -> ClassificationResult:
    import groq
    client = groq.AsyncGroq(api_key=api_key)
    resp = await client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=[
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        max_tokens=1024,
        temperature=0.05,
        response_format={"type": "json_object"},
    )
    raw = resp.choices[0].message.content or ""
    result = _sanitize(_parse_response(raw))
    result.model_used = "groq/llama-3.3-70b-versatile"
    return result


async def _classify_anthropic(prompt: str, api_key: str) -> ClassificationResult:
    import anthropic
    client = anthropic.AsyncAnthropic(api_key=api_key)
    msg = await client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=1024,
        system=_SYSTEM_PROMPT,
        messages=[{"role": "user", "content": prompt}],
    )
    raw = msg.content[0].text if msg.content else ""
    result = _sanitize(_parse_response(raw))
    result.model_used = "anthropic/claude-haiku-4-5"
    return result
