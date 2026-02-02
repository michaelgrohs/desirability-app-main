from typing import List

from process_atoms.mine.declare.enums.mp_constants import activation_based_on
from process_atoms.models.event_log import EventLog
from process_atoms.models.processatom import ProcessAtom


def add_relevance_category_mined(atom: ProcessAtom):
    if atom.attributes["confidence"] > 0.9 and atom.support > 0.5:
        atom.attributes["relevance"] = 1
    elif atom.attributes["confidence"] > 0.9:
        atom.attributes["relevance"] = 2
    else:
        atom.attributes["relevance"] = 3
    return atom


def add_relevance_category_matched(atom: ProcessAtom):
    if atom.attributes["relative_activation"] > 0.7:
        atom.attributes["relevance"] = 1
    elif atom.attributes["relative_activation"] > 0.3:
        atom.attributes["relevance"] = 2
    else:
        atom.attributes["relevance"] = 3
    return atom


def add_relevance_score(atom: ProcessAtom, activity_counts: dict, num_traces: int):
    if len(activation_based_on[atom.atom_type]) == 0:
        atom.attributes["relative_activation"] = 1
    elif len(activation_based_on[atom.atom_type]) == 1:
        atom.attributes["relative_activation"] = (
            activity_counts[atom.operands[activation_based_on[atom.atom_type][0]]]
            / num_traces
        )
    elif len(activation_based_on[atom.atom_type]) == 2:
        atom.attributes["relative_activation"] = max(
            activity_counts[atom.operands[activation_based_on[atom.atom_type][0]]]
            / num_traces,
            activity_counts[atom.operands[activation_based_on[atom.atom_type][1]]]
            / num_traces,
        )
    else:
        atom.attributes["relative_activation"] = 0
    return atom


def esimate_relevance_simple(log: EventLog, atoms: List[ProcessAtom]):
    activity_counts = log.activity_counts()
    num_traces = len(log)
    atoms = [
        add_relevance_category_matched(
            add_relevance_score(
                atom, activity_counts=activity_counts, num_traces=num_traces
            )
        )
        for atom in atoms
    ]
    return atoms
