from pydantic import BaseModel

from process_atoms.models.processatom import ProcessAtom


class Violation(BaseModel):
    id: str
    log: str
    atom: ProcessAtom
    cases: list[str]
    frequency: int
    attributes: dict
