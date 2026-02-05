from pydantic import BaseModel


class Variant(BaseModel):
    id: str
    log: str
    activities: tuple[str, ...]
    frequency: int
    cases: list[str]
    average_duration: float


class ViolatedVariant(BaseModel):
    id: str
    variant: Variant
    activities: dict[str, list[str]]
