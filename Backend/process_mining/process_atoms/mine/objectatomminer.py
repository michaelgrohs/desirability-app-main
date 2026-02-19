from __future__ import annotations
from typing import Callable
from uuid import uuid4

from process_mining.process_atoms.mine.declare.enums.mp_constants import activation_based_on
from process_mining.process_atoms.models.processatom import ProcessAtom


def mine_object_based(
    self,
    activity_atoms: list[ProcessAtom],
    get_objects_from_label: Callable[[str], list[str]],
    get_actions_from_label: Callable[[str], list[str]],
) -> list[ProcessAtom]:
    atom_activities = list(
        {operand for atom in activity_atoms for operand in atom.operands}
    )
    activity_to_objects = {act: get_objects_from_label(act) for act in atom_activities}
    activity_to_actions = {act: get_actions_from_label(act) for act in atom_activities}
    inter_object_atoms = []
    intra_object_atoms = []
    for atom in activity_atoms:
        if atom.arity == 2:
            common_objects = activity_to_objects[atom.operand[0]].intersection(
                activity_to_objects[atom.operand[1]]
            )
            if len(common_objects) > 0:
                actions_1 = activity_to_actions[atom.operand[0]]
                actions_2 = activity_to_actions[atom.operand[1]]
                for action_1 in actions_1:
                    for action_2 in actions_2:
                        new_atom = ProcessAtom(
                            id=str(uuid4()),
                            atom_type=atom.atom_type,
                            atom_str=atom.atom_str,
                            arity=2,
                            level="IntraObject",
                            operands=[action_1, action_2],
                            signal_query="",  # TODO: Add signal query
                            activation_conditions=[
                                atom.operands[i]
                                for i in activation_based_on[atom.atom_type]
                            ],
                            target_conditions=[],
                            cardinality=atom.cardinality,
                            support=atom.support,
                            provision_type=atom.provision_type,
                            providers=[self.model_id],
                            attributes={
                                "operand_info": [
                                    self.model_elements[self.model_id + operand]
                                    for operand in common_objects
                                ],
                                "objects": common_objects,
                            },
                        )
                        intra_object_atoms.append(new_atom)
            for object_1 in activity_to_objects[atom.operand[0]]:
                for object_2 in activity_to_objects[atom.operand[1]]:
                    new_atom = ProcessAtom(
                        id=str(uuid4()),
                        atom_type=atom.atom_type,
                        atom_str=atom.atom_str,
                        arity=2,
                        level="InterObject",
                        operands=[object_1, object_2],
                        signal_query="",  # TODO: Add signal query
                        activation_conditions=[
                            atom.operands[i]
                            for i in activation_based_on[atom.atom_type]
                        ],
                        target_conditions=[],
                        cardinality=atom.cardinality,
                        support=atom.support,
                        provision_type=atom.provision_type,
                        providers=[self.model_id],
                        attributes={
                            "operand_info": [
                                self.model_elements[self.model_id + operand]
                                for operand in [object_1, object_2]
                            ]
                        },
                    )
                    inter_object_atoms.append(new_atom)
