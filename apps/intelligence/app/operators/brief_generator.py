"""
Daily Operator Brief generator.
Aggregates recent articles per operator and generates a structured brief.
"""
from __future__ import annotations

import asyncio
from collections import Counter
from datetime import date, datetime, timezone, timedelta

import structlog
from sqlalchemy import select, func, and_

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models.article import Article, ArticleStatus
from app.models.operator_brief import OperatorBrief
from app.nlp.classifier import classify_article
from app.operators.registry import list_operators, get_operator

log = structlog.get_logger(__name__)
settings = get_settings()

_BRIEF_TEMPLATE = """\
# Daily Operator Brief — {operator_name}
**Fecha:** {date}

## Noticias principales

{news_items}

## Posibles impactos operativos

{impacts}

## Riesgos detectados

**Nivel de riesgo global:** {risk_level}

{risks}

---
*Generado automáticamente por OBI Intelligence · {articles_count} artículos analizados*
"""


async def generate_operator_brief(operator_slug: str, target_date: date | None = None) -> OperatorBrief | None:
    """Generate a daily brief for one operator."""
    if target_date is None:
        target_date = datetime.now(timezone.utc).date()

    operator = get_operator(operator_slug)
    if not operator:
        log.error("operator_not_found", slug=operator_slug)
        return None

    # Fetch recent articles (last 24h) mentioning this operator
    since = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    until = since + timedelta(days=1)

    async with AsyncSessionLocal() as db:
        result = await db.execute(
            select(Article)
            .where(
                and_(
                    Article.status == ArticleStatus.completed.value,
                    Article.operator_slugs.any(operator_slug),  # type: ignore
                    Article.scraped_at >= since,
                    Article.scraped_at < until,
                )
            )
            .order_by(Article.relevance_score.desc().nullslast())
            .limit(20)
        )
        articles = result.scalars().all()

    if not articles:
        log.info("no_articles_for_brief", operator=operator_slug, date=target_date)
        return None

    # Aggregate stats
    scores = [a.relevance_score for a in articles if a.relevance_score is not None]
    avg_relevance = sum(scores) / len(scores) if scores else 0.0

    sentiments = Counter(a.sentiment for a in articles if a.sentiment)
    dominant_sentiment = sentiments.most_common(1)[0][0] if sentiments else "neutral"

    all_keywords: list[str] = []
    for a in articles:
        all_keywords.extend(a.keywords or [])
    top_keywords = [kw for kw, _ in Counter(all_keywords).most_common(10)]

    # Risk level from individual article scores
    if avg_relevance >= 0.7 or any(a.relevance_score and a.relevance_score >= 0.85 for a in articles):
        risk_level = "high"
    elif avg_relevance >= 0.45:
        risk_level = "medium"
    else:
        risk_level = "low"

    # Build markdown content
    news_items_md = _build_news_items_md(articles[:5])
    impacts_md = _build_impacts_md(articles)
    risks_md = _build_risks_md(articles, risk_level)

    content = _BRIEF_TEMPLATE.format(
        operator_name=operator.name,
        date=target_date.strftime("%d/%m/%Y"),
        news_items=news_items_md,
        impacts=impacts_md,
        risk_level={"low": "🟢 BAJO", "medium": "🟡 MEDIO", "high": "🔴 ALTO"}.get(risk_level, risk_level),
        risks=risks_md,
        articles_count=len(articles),
    )

    # Detect impact areas
    impacts = _detect_impacts(articles)

    brief = OperatorBrief(
        operator_slug=operator_slug,
        operator_name=operator.name,
        brief_date=target_date,
        content_md=content,
        article_count=len(articles),
        avg_relevance=round(avg_relevance, 3),
        dominant_sentiment=dominant_sentiment,
        top_keywords=top_keywords,
        risk_level=risk_level,
        impacts=impacts,
        top_article_ids=[a.id for a in articles[:5]],
    )

    # Upsert (replace existing brief for same operator+date)
    async with AsyncSessionLocal() as db:
        existing = await db.execute(
            select(OperatorBrief).where(
                and_(
                    OperatorBrief.operator_slug == operator_slug,
                    OperatorBrief.brief_date == target_date,
                )
            )
        )
        prev = existing.scalar_one_or_none()
        if prev:
            for attr in ("content_md", "article_count", "avg_relevance",
                         "dominant_sentiment", "top_keywords", "risk_level",
                         "impacts", "top_article_ids", "generated_at"):
                setattr(prev, attr, getattr(brief, attr))
            await db.commit()
            return prev
        else:
            db.add(brief)
            await db.commit()
            await db.refresh(brief)
            return brief


async def generate_all_briefs(target_date: date | None = None) -> dict:
    """Generate briefs for all registered operators."""
    operators = list_operators()
    generated = 0
    skipped = 0

    for operator in operators:
        try:
            brief = await generate_operator_brief(operator.slug, target_date)
            if brief:
                generated += 1
            else:
                skipped += 1
        except Exception as e:
            log.error("brief_generation_failed", operator=operator.slug, error=str(e))
            skipped += 1

    log.info("all_briefs_generated", generated=generated, skipped=skipped)
    return {"generated": generated, "skipped": skipped}


def _build_news_items_md(articles: list) -> str:
    lines = []
    for i, a in enumerate(articles, 1):
        summary = a.summary or a.title or "Sin resumen"
        score_tag = f"[relevancia: {a.relevance_score:.2f}]" if a.relevance_score else ""
        lines.append(f"{i}. **{a.title or 'Sin título'}** {score_tag}\n   {summary}\n   [Ver artículo]({a.url})")
    return "\n\n".join(lines) if lines else "_Sin noticias relevantes en las últimas 24 horas._"


def _build_impacts_md(articles: list) -> str:
    impacts: dict[str, list[str]] = {
        "costos": [],
        "supply_chain": [],
        "actividad": [],
        "logística": [],
    }
    for a in articles:
        if not a.supply_chain_impact:
            continue
        impact_text = a.supply_chain_impact.lower()
        if any(w in impact_text for w in ("costo", "tarifa", "precio", "capex", "opex")):
            impacts["costos"].append(a.supply_chain_impact)
        if any(w in impact_text for w in ("supply", "proveedor", "cadena", "logística")):
            impacts["supply_chain"].append(a.supply_chain_impact)
        if any(w in impact_text for w in ("producción", "perforación", "operación", "actividad")):
            impacts["actividad"].append(a.supply_chain_impact)
        if any(w in impact_text for w in ("transporte", "logística", "oleoducto", "gasoducto")):
            impacts["logística"].append(a.supply_chain_impact)

    lines = []
    for area, items in impacts.items():
        if items:
            lines.append(f"**{area.capitalize()}:** {items[0]}")
    return "\n".join(lines) if lines else "_Sin impactos específicos identificados._"


def _build_risks_md(articles: list, risk_level: str) -> str:
    high_risk = [a for a in articles if a.relevance_score and a.relevance_score >= 0.8]
    if not high_risk:
        return "_No se detectaron riesgos críticos._"
    lines = []
    for a in high_risk[:3]:
        lines.append(f"- {a.title} (score: {a.relevance_score:.2f})")
    return "\n".join(lines)


def _detect_impacts(articles: list) -> dict:
    impacts = {
        "costos": False,
        "supply_chain": False,
        "actividad": False,
        "logistica": False,
    }
    for a in articles:
        kws = " ".join(a.keywords or []).lower()
        summary = (a.summary or "").lower()
        text = f"{kws} {summary}"
        if any(w in text for w in ("costo", "precio", "tarifa", "capex", "opex")):
            impacts["costos"] = True
        if any(w in text for w in ("supply", "proveedor", "cadena")):
            impacts["supply_chain"] = True
        if any(w in text for w in ("producción", "perforación", "pozos", "rig")):
            impacts["actividad"] = True
        if any(w in text for w in ("transporte", "oleoducto", "gasoducto", "logística")):
            impacts["logistica"] = True
    return impacts
