"""Text normalization for Spanish O&G content."""
import re
import unicodedata


def normalize_text(text: str) -> str:
    """Lowercase, remove accents, collapse whitespace — for matching only."""
    if not text:
        return ""
    text = text.lower()
    text = unicodedata.normalize("NFD", text)
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def normalize_title(title: str) -> str:
    """Clean title for display: fix encoding, collapse whitespace, strip."""
    if not title:
        return ""
    title = title.strip()
    title = re.sub(r"\s+", " ", title)
    # Fix common encoding issues
    title = title.replace("â€™", "'").replace("â€œ", '"').replace("â€", '"')
    title = title.replace("Ã³", "ó").replace("Ã©", "é").replace("Ã¡", "á")
    title = title.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
    title = title.replace("&nbsp;", " ").replace("&#39;", "'").replace("&quot;", '"')
    return title


def normalize_content(content: str, max_chars: int = 10_000) -> str:
    """Clean article content for storage and LLM processing."""
    if not content:
        return ""
    content = re.sub(r"<[^>]+>", " ", content)  # strip HTML tags
    content = re.sub(r"https?://\S+", "", content)  # strip URLs
    content = re.sub(r"\s+", " ", content)
    content = content.strip()
    return content[:max_chars]


def extract_slug(name: str) -> str:
    """Convert company name to a stable slug."""
    slug = normalize_text(name)
    slug = re.sub(r"[^a-z0-9\s]", "", slug)
    slug = re.sub(r"\s+", "_", slug)
    return slug.strip("_")


def deduplicate_title(title: str) -> str:
    """Canonical form of title for deduplication."""
    norm = normalize_text(title)
    norm = re.sub(r"[^a-z0-9\s]", "", norm)
    norm = re.sub(r"\s+", " ", norm).strip()
    import hashlib
    return hashlib.sha256(norm.encode()).hexdigest()


def deduplicate_url(url: str) -> str:
    """Canonical URL hash removing tracking params."""
    import hashlib
    from urllib.parse import urlparse, urlencode, parse_qs, urlunparse

    try:
        parsed = urlparse(url.lower().strip())
        hostname = re.sub(r"^(www\.|amp\.)", "", parsed.hostname or "")
        path = parsed.path.rstrip("/")
        path = re.sub(r"/amp(/|$)", "/", path)

        TRACKING = {"utm_source", "utm_medium", "utm_campaign", "utm_term",
                    "utm_content", "fbclid", "gclid", "ref", "mc_cid"}
        qs = {k: v for k, v in parse_qs(parsed.query).items() if k not in TRACKING}
        clean = urlunparse(("", hostname, path, "", urlencode(qs, doseq=True), ""))
        return hashlib.sha256(clean.encode()).hexdigest()
    except Exception:
        return hashlib.sha256(url.lower().strip().encode()).hexdigest()
