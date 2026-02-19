from __future__ import annotations
from typing import Dict, List
from pydantic import BaseModel, computed_field

from process_mining.process_atoms.mine.declare.enums.mp_constants import Template

nat_lang_templates = {
    Template.ABSENCE.templ_str: "{1} does not occur more than {n} times",
    Template.EXISTENCE.templ_str: "{1} occurs at least {n} times",
    Template.EXACTLY.templ_str: "{1} occurs exactly {n} times",
    Template.INIT.templ_str: "{1} is the first to occur",
    Template.END.templ_str: "{1} is the last to occur",
    Template.CHOICE.templ_str: "{1} or {2} or both eventually occur in the same process instance",
    Template.EXCLUSIVE_CHOICE.templ_str: "{1} or {2} occurs, but never both in the same process instance",
    Template.RESPONDED_EXISTENCE.templ_str: "If {1} occurs in the process instance, then {2} occurs as well",
    Template.RESPONSE.templ_str: "If {1} occurs, then {2} occurs at some point after {1}",
    Template.ALTERNATE_RESPONSE.templ_str: "Each time {1} occurs, then {2} occurs afterwards, and no other "
    "{1} recurs in between",
    Template.CHAIN_RESPONSE.templ_str: "Each time {1} occurs, then {2} occurs immediately afterwards",
    Template.PRECEDENCE.templ_str: "{2} occurs only if it is preceded by {1}",
    Template.ALTERNATE_PRECEDENCE.templ_str: "Each time {2} occurs, it is preceded by {1} and no other "
    "{2} can recur in between",
    Template.CHAIN_PRECEDENCE.templ_str: "Each time {2} occurs, then {1} occurs immediately beforehand",
    Template.SUCCESSION.templ_str: "{1} occurs if and only if it is followed by {2}",
    Template.ALTERNATE_SUCCESSION.templ_str: "{1} and {2} occur if and only if the latter follows the former, "
    "and they alternate in a process instance",
    Template.CHAIN_SUCCESSION.templ_str: "{1} and {2} occur if and only if the latter immediately follows the former",
    Template.CO_EXISTENCE.templ_str: "If {1} occurs, then {2} occurs as well, and vice versa",
    Template.NOT_RESPONDED_EXISTENCE.templ_str: "Only one of {1} and {2} can occur in a process instance, but not both",
    Template.NOT_CHAIN_PRECEDENCE.templ_str: "When {2} occurs, {1} did not occur immediately beforehand",
    Template.NOT_PRECEDENCE.templ_str: "When {2} occurs, {1} did not occur beforehand",
    Template.NOT_RESPONSE.templ_str: "When {1} occurs, {2} cannot not occur afterwards",
    Template.NOT_CHAIN_RESPONSE.templ_str: "When {1} occurs, {2} cannot not occur immediately afterwards",
    Template.NOT_SUCCESSION.templ_str: "{2} cannot occur after {1}",
    Template.NOT_CO_EXISTENCE.templ_str: "If {1} occurs, then {2} cannot occur, and vice versa",
    "": "",
}


class ProcessAtom(BaseModel):
    id: str
    atom_type: str
    atom_str: str
    signal_query: str
    arity: int
    cardinality: int
    level: str
    operands: List[str]
    support: float
    provision_type: str
    providers: List[str]
    activation_conditions: List[str]
    target_conditions: List[str]
    attributes: Dict

    @computed_field
    @property
    def atom_description(self) -> str:
        tmp = nat_lang_templates[self.atom_type]
        if self.cardinality == 0 and self.atom_type == "Absence":
            tmp = "No {1} occurs"
        if self.arity == 1:
            tmp = tmp.replace("{1}", '"' + self.operands[0] + '"')
        elif self.arity == 2:
            tmp = tmp.replace("{1}", '"' + self.operands[0] + '"')
            tmp = tmp.replace("{2}", '"' + self.operands[1] + '"')
        if self.cardinality > 0:
            tmp = tmp.replace("{n}", str(self.cardinality))
        return tmp

    def __repr__(self) -> str:
        return self.atom_description

    def get_inverse_atom_str(self) -> str:
        tmp = self.atom_str.replace(self.operands[0], "a").replace(
            self.operands[1], "b"
        )
        tmp = tmp.replace("a", self.operands[1]).replace("b", self.operands[0])
        return tmp


class FittedProcessAtom(ProcessAtom):
    process: str
    matches: dict
    relevance: float
    base_atom: ProcessAtom
