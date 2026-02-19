from __future__ import annotations
from typing import Dict, List, Tuple
from pydantic import BaseModel


class Variant(BaseModel):
    id: str
    log: str
    activities: Tuple[str, ...]
    frequency: int
    cases: List[str]
    average_duration: float


class ViolatedVariant(BaseModel):
    id: str
    variant: Variant
    activities: Dict[str, List[str]]
