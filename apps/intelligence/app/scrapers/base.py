from dataclasses import dataclass, field


@dataclass
class ScrapedItem:
    url: str
    title: str
    content: str = ""
    published_at: str | None = None
    method: str = "bs4"       # bs4 | playwright | rss
    selector_used: str = ""
    response_time_ms: int = 0
