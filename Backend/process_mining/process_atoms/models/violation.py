from __future__ import annotations
from pydantic import BaseModel
from typing import Dict, Type, List
from process_mining.process_atoms.models.processatom import ProcessAtom


class Violation(BaseModel):
    id: str
    log: str
    atom: ProcessAtom
    cases: List[str]
    frequency: int
    attributes: Dict
