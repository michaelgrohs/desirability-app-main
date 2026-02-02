from typing import Callable, List

#import faiss
import numpy as np

from process_atoms.mine.declare.enums.mp_constants import Template, directed_strings
from process_atoms.models.processatom import FittedProcessAtom, ProcessAtom
from process_atoms.utils import aggregate_process_atoms, atoms_to_df


def get_embeddings(model, strs: List[str]):
    return model.encode(strs, convert_to_numpy=True)


def build_faiss_index(
    model, activities: list[str], atom_activitiy_emddings: np.ndarray = None
) -> dict[str, list[str]]:
    if atom_activitiy_emddings is None:
        atom_activitiy_emddings = get_embeddings(model, activities)
    d = atom_activitiy_emddings.shape[1]
    index = faiss.IndexFlatL2(d)
    index.add(atom_activitiy_emddings)
    return index


def match_activities_based_on_index(
    index, model, activities: list[str], log_activities: list[str], k=1
) -> dict[str, list[str]]:
    matches = {}
    for la in log_activities:
        _, indices = index.search(model.encode([la]), k)  # search
        matched_sentences = [activities[i] for i in indices[0] if i < len(activities)]
        for match in matched_sentences:
            if match in matches:
                matches[match].append(la)
            else:
                matches[match] = [la]
    return matches


def exact_match(str_1, str_2):
    """
    returns True if the two strings are equal, False otherwise
    """
    return str_1 == str_2


class Matcher:
    def __init__(self, process: str) -> None:
        """
        Initializes the Matcher with a process and a log.

        Args:
            process (str): The process identifier.
        """
        self.process = process

    def instantiate_atom(self, atom: ProcessAtom, ops: List[str]) -> FittedProcessAtom:
        """
        Creates a fitted process atom by replacing operands in the atom string with actual operations.

        Args:
            atom (ProcessAtom): The process atom to be instantiated.
            ops (List[str]): The operations to replace in the atom string.

        Returns:
            FittedProcessAtom: The instantiated fitted process atom.
        """
        fitted_atom = FittedProcessAtom(
            **atom.model_dump(),
            matches={op: atom.operands[idx] for idx, op in enumerate(ops)},
            relevance=0.0,
            base_atom=atom,
            process=self.process,
        )
        fitted_atom.atom_str = fitted_atom.atom_str
        for idx, op in enumerate(ops):
            fitted_atom.atom_str = fitted_atom.atom_str.replace(
                fitted_atom.operands[idx], op
            )
            fitted_atom.id = fitted_atom.id + "_" + op
        fitted_atom.operands = ops
        return fitted_atom

    def match_based_on_frequent_matches(
        self,
        process_atoms: List[ProcessAtom],
        log_components: list[str],
        matching_function: Callable[[str, str], bool],
        instantiate_for_log: bool = True,
        aggregate: bool = False,
    ) -> List[ProcessAtom]:
        atom_activities = {
            operand for atom in process_atoms for operand in atom.operands
        }
        matches = {
            activity: [
                log_component
                for log_component in log_components
                if matching_function(log_component, activity)
            ]
            for activity in atom_activities
        }
        # group atoms by provider
        atoms_df = atoms_to_df(process_atoms)
        atoms_df["providers"] = atoms_df["providers"].apply(lambda x: x[0])
        provider_to_matches = {}
        for provider, group in atoms_df.groupby("providers"):
            provider_to_matches[provider] = group.apply(
                lambda x: len(matches[x["op_0"]]) > 0
                or x["op_1"] != ""
                and len(matches[x["op_1"]]) > 0,
                axis=1,
            ).sum()
        # get the provider with the maximum amount of matches
        max_provider = max(provider_to_matches, key=provider_to_matches.get)
        return [atom for atom in process_atoms if max_provider in atom.providers]

    def match_based_on_start_and_end_activities(
        self,
        process_atoms: List[ProcessAtom],
        log_components: list[str],
        matching_function: Callable[[str, str], bool],
        instantiate_for_log: bool = True,
        aggregate: bool = False,
    ) -> List[ProcessAtom]:
        atom_activities = {
            operand for atom in process_atoms for operand in atom.operands
        }
        matches = {
            activity: [
                log_component
                for log_component in log_components
                if matching_function(log_component, activity)
            ]
            for activity in atom_activities
        }
        # get init and end atoms of the best practices
        init_atoms = [
            atom for atom in process_atoms if atom.atom_type == Template.INIT.templ_str
        ]
        end_atoms = [
            atom for atom in process_atoms if atom.atom_type == Template.END.templ_str
        ]
        init_matches = []
        end_matches = []
        # check if there are any matches with the operand of the init and end atoms
        for init_atom in init_atoms:
            for _ in matches[init_atom.operands[0]]:
                init_matches.append(init_atom)
                break
        for end_atom in end_atoms:
            for _ in matches[end_atom.operands[0]]:
                end_matches.append(end_atom)
                break

        # init_matches = [match for init_atom in init_atoms for match in matches[init_atom.operands[0]]]
        # end_matches = [match for end_atom in end_atoms for match in matches[end_atom.operands[0]]]
        # get pairs of init and end atoms that have at least one provider in common
        providers = {}
        for init_match in init_matches:
            for end_match in end_matches:
                if init_match.operands != end_match.operands:
                    common_providers = set(init_match.providers).intersection(
                        set(end_match.providers)
                    )
                    for provider in common_providers:
                        providers[provider] = [
                            atom for atom in process_atoms if provider in atom.providers
                        ]
        # return all atoms assotiated with the providers
        return [atom for _, prov_atoms in providers.items() for atom in prov_atoms]

    def match_based_on_activities(
        self,
        process_atoms: List[ProcessAtom],
        log_components: list[str],
        matching_function: Callable[[str, str], bool],
        instantiate_for_log: bool = True,
        partial_instantiation: bool = False,
        aggregate: bool = False,
    ) -> List[FittedProcessAtom]:
        """
        Matches process atoms to log activities using the provided matching function.

        Args:
            process_atoms (List[ProcessAtom]): The process atoms to be matched.
            log_components (list[str]): The log activities to match against.
            matching_function (Callable[[str, str], bool]): The function to use for matching activities.
            instantiate_for_log (bool, optional): Whether to instantiate the atoms for the log. Defaults to True.
            partial_instantiation (bool, optional): Whether to partially instantiate the atoms for the log. Defaults to False.
            aggregate (bool, optional): Whether to aggregate the fitted atoms. Defaults to False.

        Returns:
            List[FittedProcessAtom]: A list of fitted process atoms.
        """
        fitted_atoms: List[FittedProcessAtom] = []

        # Precompute matches for each atom activity
        atom_activities = {
            operand for atom in process_atoms for operand in atom.operands
        }
        matches = {
            activity: [
                log_component
                for log_component in log_components
                if matching_function(log_component, activity)
            ]
            for activity in atom_activities
        }

        # Process atoms and instantiate them based on matches
        for atom in process_atoms:
            operands = atom.operands
            if len(operands) == 1:
                if instantiate_for_log:
                    fitted_atoms.extend(
                        self.instantiate_atom(atom=atom, ops=[match])
                        for match in matches[operands[0]]
                    )
                else:
                    if len(matches[operands[0]]) > 0:
                        fitted_atoms.append(
                            FittedProcessAtom(
                                **atom.model_dump(),
                                matches={},
                                relevance=0.0,
                                base_atom=atom,
                                process=self.process,
                            )
                        )
            elif len(operands) == 2:
                if instantiate_for_log:
                    operand_1_matches = matches[operands[0]]
                    operand_2_matches = matches[operands[1]]
                    fitted_atoms.extend(
                        self.instantiate_atom(atom=atom, ops=[match_1, match_2])
                        for match_1 in operand_1_matches
                        for match_2 in operand_2_matches
                        if match_1 != match_2
                    )
                    if partial_instantiation:
                        fitted_atoms.extend(
                            self.instantiate_atom(
                                atom=atom, ops=[match_1, atom.operands[1]]
                            )
                            for match_1 in operand_1_matches
                            if match_1 != atom.operands[1]
                        )
                        fitted_atoms.extend(
                            self.instantiate_atom(
                                atom=atom, ops=[atom.operands[0], match_2]
                            )
                            for match_2 in operand_2_matches
                            if match_2 != atom.operands[0]
                        )
                else:
                    if len(matches[operands[0]]) > 0:
                        fitted_atoms.append(
                            FittedProcessAtom(
                                **atom.model_dump(),
                                matches={
                                    match: operands[0] for match in matches[operands[0]]
                                },
                                relevance=0.0,
                                base_atom=atom,
                                process=self.process,
                            )
                        )
                    if len(matches[operands[1]]) > 0:
                        fitted_atoms.append(
                            FittedProcessAtom(
                                **atom.model_dump(),
                                matches={
                                    match: operands[1] for match in matches[operands[1]]
                                },
                                relevance=0.0,
                                base_atom=atom,
                                process=self.process,
                            )
                        )
            else:
                raise ValueError(f"Arity not supported. {atom.atom_str} {operands}")
        print("Done fitting.")
        # filter out obvious contradictions
        atom_strs = [atom.atom_str for atom in fitted_atoms]
        fitted_atoms = [
            atom
            for atom in fitted_atoms
            if not (
                atom.atom_type in directed_strings
                and atom.get_inverse_atom_str() in atom_strs
            )
        ]
        print("Done filtering.")
        if aggregate:
            fitted_atoms = aggregate_process_atoms(fitted_atoms)
        return fitted_atoms
