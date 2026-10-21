from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class DocumentInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    title: str = Field(min_length=1, max_length=200)
    source: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=100_000)

    @field_validator("title", "source", "content")
    @classmethod
    def strip_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value


class IngestRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    documents: list[DocumentInput] = Field(min_length=1, max_length=50)

    @model_validator(mode="after")
    def sources_are_unique(self) -> "IngestRequest":
        if len({document.source for document in self.documents}) != len(self.documents):
            raise ValueError("documents sources must be unique")
        return self


class AskRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    question: str = Field(min_length=1, max_length=2000)
    topK: int = Field(default=5, ge=1, le=10)
    includeLiveData: bool = True

    @field_validator("question")
    @classmethod
    def strip_question(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("must not be blank")
        return value
