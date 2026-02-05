from itertools import groupby
from operator import attrgetter
from typing import List

import pandas as pd

from process_atoms.constants import USELESS_LABELS, XES_NAME
from process_atoms.mine.declare.enums.mp_constants import (
    Template,
    directed_strings,
    subsumption_hierarchy,
)
from process_atoms.models.processatom import ProcessAtom


def create_variant_log(log, activity_key=XES_NAME):
    variant_log = []
    seen = set()
    already_counted_loop = False
    for trace in log:
        trace_labels = tuple([x[activity_key] for x in trace if x[activity_key] != ""])
        if trace_labels not in seen:
            trace_cpy = []
            for event in trace:
                if event[activity_key] != "":
                    trace_cpy.append(event)
            variant_log.append(trace_cpy)
            seen.add(trace_labels)
            if (
                0 < len(trace_labels) == len(set(trace_labels))
                and not already_counted_loop
            ):
                already_counted_loop = True
    return variant_log


def aggregate_process_atoms(
    atoms: List[ProcessAtom], att="atom_str"
) -> List[ProcessAtom]:
    # group the atoms by their atom_str
    grouped_atoms = groupby(atoms, key=attrgetter(att))
    aggregated_atoms = []
    for _, group in grouped_atoms:
        group = list(group)
        # sum the support of the atoms in the group
        support = sum([atom.support for atom in group])
        # get the first atom in the group
        atom = group[0]
        # get all atom providers
        providers = list(
            set([provider for atom in group for provider in atom.providers])
        )
        # create a new atom with the aggregated support
        new_atom = ProcessAtom(
            id=atom.id,
            atom_type=atom.atom_type,
            atom_str=atom.atom_str,
            arity=atom.arity,
            level=atom.level,
            operands=atom.operands,
            signal_query=atom.signal_query,
            activation_conditions=atom.activation_conditions,
            target_conditions=atom.target_conditions,
            cardinality=atom.cardinality,
            support=support,
            provision_type=atom.provision_type,
            providers=providers,
            attributes=atom.attributes,
        )
        aggregated_atoms.append(new_atom)
    aggregated_atoms = remove_useless_atoms(aggregated_atoms)
    aggregated_atoms = reduce_redundancies(aggregated_atoms)
    return aggregated_atoms


def remove_useless_atoms(atoms: List[ProcessAtom]) -> List[ProcessAtom]:
    return [
        atom for atom in atoms if not any(op in USELESS_LABELS for op in atom.operands)
    ]


def reduce_redundancies(atoms: List[ProcessAtom]) -> List[ProcessAtom]:
    atom_ids_to_retain = []
    atoms_df = atoms_to_df(atoms)
    atoms_df = atoms_df.drop_duplicates(
        subset=["op_0", "op_1", "atom_type", "cardinality"]
    )
    # drop atoms that contain 'Optional' in the atom_str
    atoms_df = atoms_df[
        ~atoms_df["atom_str"].str.contains("Optional")
        & ~atoms_df["atom_str"].str.contains("This BPMN diagram")
    ]
    atoms_df["subsumption_hierarchy"] = atoms_df["atom_type"].apply(
        lambda x: subsumption_hierarchy[x] if x in subsumption_hierarchy else 1
    )
    atoms_df["op_set"] = atoms_df.apply(
        lambda x: frozenset([x["op_0"], x["op_1"]]), axis=1
    )
    # group by op_set and atom_type
    grouped = atoms_df.groupby(["atom_type", "op_set"])
    # if atom_type not in directed_strings, only keep one
    for group_name, group_df in grouped:
        if group_name[0] not in directed_strings:
            atom_ids_to_retain.append(group_df.iloc[0]["id"])
    # based on subsumption: if there is a stronger constraint with the same operands, remove the weaker ones
    # group by op_1 and op 2
    grouped = atoms_df.groupby(["op_0", "op_1"])

    for group_name, group_df in grouped:
        # check if the group contains a succession constraint if so, keep only that
        if Template.SUCCESSION.templ_str in group_df["atom_type"].values:
            # filter for ones that contain 'Succession' or 'Co-Existence' but not 'Not' and keep the one with the highest subsumption hierarchy level
            succession_constraints = group_df[
                ~group_df["atom_type"].str.contains("Not")
                & (
                    group_df["atom_type"].str.contains("Succession")
                    | group_df["atom_type"].str.contains("Co-Existence")
                )
            ]
            if len(succession_constraints) > 1:
                succession_constraints = succession_constraints.sort_values(
                    by="subsumption_hierarchy"
                )
                atom_ids_to_retain.append(succession_constraints.iloc[0]["id"])
            else:
                atom_ids_to_retain.extend(group_df["id"].values)
        else:
            # filter for constraints that contrain Precedence in the constraint type and keep the one with the highest subsumption hierarchy level
            precedence_constraints = group_df[
                group_df["atom_type"].str.contains("Precedence")
                | group_df["atom_type"].str.contains("Responded")
            ]
            if len(precedence_constraints) > 1:
                precedence_constraints = precedence_constraints.sort_values(
                    by="subsumption_hierarchy"
                )
                atom_ids_to_retain.append(precedence_constraints.iloc[0]["id"])
            else:
                atom_ids_to_retain.extend(group_df["id"].values)
            # filter for constraints that contrain Response in the constraint type and keep the one with the highest subsumption hierarchy level
            response_constraints = group_df[
                group_df["atom_type"].str.contains("Response")
            ]
            if len(response_constraints) > 1:
                response_constraints = response_constraints.sort_values(
                    by="subsumption_hierarchy"
                )
                atom_ids_to_retain.append(response_constraints.iloc[0]["id"])
            else:
                atom_ids_to_retain.extend(group_df["id"].values)

    atom_ids_to_retain = list(set(atom_ids_to_retain))
    return list(atoms_df[atoms_df["id"].isin(atom_ids_to_retain)]["atom"].values)


def atoms_to_df(atoms: List[ProcessAtom], sort=True) -> pd.DataFrame:
    records = [
        {
            "id": atom.id,
            "atom_type": atom.atom_type,
            "atom_str": atom.atom_str,
            "arity": atom.arity,
            "level": atom.level,
            "op_0": atom.operands[0] if len(atom.operands) > 0 else "",
            "op_1": atom.operands[1] if len(atom.operands) > 1 else "",
            "signal_query": atom.signal_query,
            "activation": atom.activation_conditions,
            "target": atom.target_conditions,
            "cardinality": atom.cardinality,
            "support": atom.support,
            "provision_type": atom.provision_type,
            "providers": atom.providers,
            "confidence": atom.attributes["confidence"]
            if "confidence" in atom.attributes
            else 0.0,
            "atom": atom,
        }
        for atom in atoms
    ]
    df = pd.DataFrame.from_records(records)
    if not sort:
        return df
    return df.sort_values(by="confidence", ascending=False)
