from __future__ import annotations

import asyncio
from pathlib import Path

from app.main import app
from domain.models import KnowledgeDocument


async def main() -> None:
    use_case = app.state.ingest_use_case
    documents = []
    for path in sorted((Path(__file__).parents[3] / "knowledge").glob("*.md")):
        content = path.read_text(encoding="utf-8")
        title = next((line[2:].strip() for line in content.splitlines() if line.startswith("# ")), path.stem)
        documents.append(KnowledgeDocument(title, f"knowledge/{path.name}", content))
    await use_case.execute(documents, "trc_seed_knowledge")


if __name__ == "__main__":
    asyncio.run(main())
