from __future__ import annotations
import string
from typing import List
from uuid import uuid4
import re
from pandas import DataFrame
from tqdm import tqdm

from process_mining.process_atoms.mine.declare.declare import Declare
from process_mining.process_atoms.mine.declare.enums.mp_constants import (
    Template,
    activation_based_on,
    binary_strings,
    supports_cardinality,
    unary_strings,
)
from process_mining.process_atoms.models.event_log import EventLog
from process_mining.process_atoms.models.processatom import ProcessAtom
from process_mining.process_atoms.models.violation import Violation
from process_mining.process_atoms.signalquerybuilder import SignalQueryBuilder

time_factors = {
    "s": 1 * 10**9,
    "m": 60 * 10**9,
    "h": 3600 * 10**9,
    "d": 86400 * 10**9,
    "w": 604800 * 10**9,
    "M": 2629746 * 10**9,
    "y": 31556952 * 10**9,
}

regex_representations = {
    Template.ABSENCE.templ_str: "^[^a]*(a[^a]*){0,m}[^a]*$",
    Template.EXISTENCE.templ_str: "^[^a]*(a[^a]*){n,}[^a]*$",
    Template.EXACTLY.templ_str: "^[^a]*(a[^a]*)+[^a]*$",
    Template.INIT.templ_str: "^a.*$",
    Template.END.templ_str: "^.*a$",
    Template.CHOICE.templ_str: "^[^ab]*(a|b).*$",
    Template.EXCLUSIVE_CHOICE.templ_str: "^[^ab]*((a[^b]*)|(b[^a]*))?$",
    Template.RESPONDED_EXISTENCE.templ_str: "^[^a]*((a.*b.*)|(b.*a.*))*[^a]*$",
    Template.RESPONSE.templ_str: "^[^a]*(a.*b)*[^a]*$",
    Template.ALTERNATE_RESPONSE.templ_str: "^[^a]*(a[^a]*b[^a]*)*[^a]*$",
    Template.CHAIN_RESPONSE.templ_str: "^[^a]*(ab[^a]*)*[^a]*$",
    Template.PRECEDENCE.templ_str: "^[^b]*(a.*b)*[^b]*$",
    Template.ALTERNATE_PRECEDENCE.templ_str: "^[^b]*(a[^b]*b[^b]*)*[^b]*$",
    Template.CHAIN_PRECEDENCE.templ_str: "^[^b]*(ab[^b]*)*[^b]*$",
    Template.SUCCESSION.templ_str: "^[^ab]*(a.*b)*[^ab]*$",
    Template.ALTERNATE_SUCCESSION.templ_str: "^[^ab]*(a[^ab]*b[^ab]*)*[^ab]*$",
    Template.CHAIN_SUCCESSION.templ_str: "^[^ab]*(ab[^ab]*)*[^ab]*$",
    Template.CO_EXISTENCE.templ_str: "^[^ab]*((a.*b.*)|(b.*a.*))*[^ab]*$",
    Template.NOT_SUCCESSION.templ_str: "^[^a]*(a[^b]*)*[^ab]*$",
    Template.NOT_CO_EXISTENCE.templ_str: "^[^ab]*((a[^b]*)|(b[^a]*))?$",
    Template.NOT_RESPONDED_EXISTENCE.templ_str: "^[^ab]*((a[^b]*)|(b[^a]*))?$",
    Template.NOT_RESPONSE.templ_str: "^[^a]*(a[^b]*)*[^ab]*$",
    Template.NOT_CHAIN_RESPONSE.templ_str: "^([^a]|a[^b])*$",
    Template.NOT_PRECEDENCE.templ_str: "^[^b]*(b[^a]*)*[^ab]*$",
    Template.NOT_CHAIN_PRECEDENCE.templ_str: "^([^a]|a[^b])*$",
    Template.NOT_ALTERNATE_SUCCESSION.templ_str: "^[^a]*(a[^b]*)*[^ab]*$",
    Template.NOT_CHAIN_SUCCESSION.templ_str: "^([^a]|a[^b])*$",
}


def is_activated(templ_str, a, b, string: str):
    if activation_based_on[templ_str] == [0]:
        act = string.find(a) != -1
        return act
    elif activation_based_on[templ_str] == [1]:
        return string.find(b) != -1
    elif activation_based_on[templ_str] == [0, 1]:
        return string.find(a) != -1 or string.find(b) != -1
    return True


def instantiate_unary_regex(templ_str, a: str, m, n):
    return (
        regex_representations[templ_str]
        .replace("a", a)
        .replace("m", str(m))
        .replace("n", str(n))
    )


def instantiate_binary_regex(templ_str, a: str, b: str):
    res = regex_representations[templ_str].replace("a", a).replace("b", b)
    return res


def replace_with_hierarchy(activity, string, event_hierarchy, activity_map):
    for low, high in event_hierarchy.items():
        if low in activity_map and high == activity:
            string = string.replace(activity_map[low], activity_map[high])
    return string


class RegexChecker:
    def __init__(self, process, event_log: EventLog, event_hierarchy: dict = None):
        self.process = process
        self.log = event_log
        self.d4py = Declare(self.log)
        self.event_hierarchy = event_hierarchy
        self.signal_query_builder = SignalQueryBuilder()

    def _map_activities_to_letters(self, activities):
        # List of single letters A-Z
        letters = list(string.ascii_uppercase) + list(string.ascii_lowercase[2:])

        # If there are more than 50 activities get all possible combinations of 4 letters
        if len(activities) > len(letters):
            letters = [
                f"{letters[idx1]}a{letters[idx2]}a{letters[idx3]}a{letters[idx4]}"
                for idx1 in range(len(letters))
                for idx2 in range(len(letters))
                for idx3 in range(len(letters))
                for idx4 in range(len(letters))
            ]

        # Create a mapping dictionary
        activity_to_letter = {
            activity: letters[i] for i, activity in enumerate(activities)
        }

        return activity_to_letter

    def create_variant_frame_with_duration(self, activity_map):
        variant_frame = self.create_variant_frame_from_log(activity_map)
        variant_frame["durations"] = variant_frame["variant tuple"].apply(
            lambda x: self.log.trace_variant_durations[x]
        )
        return variant_frame

    def create_variant_frame_from_log(self, activity_map):
        variants = self.log.trace_variants
        data = {"variant tuple": list(variants.keys())}
        variant_frame = DataFrame(data)
        variant_frame["enc_variant_string"] = variant_frame["variant tuple"].apply(
            lambda x: "".join([activity_map[activity] for activity in x])
        )
        variant_frame["variant_frequency"] = variant_frame["variant tuple"].apply(
            lambda x: len(variants[x])
        )
        variant_frame["case_ids"] = variant_frame["variant tuple"].apply(
            lambda x: variants[x]
        )
        return variant_frame

    def compute_satisfaction(
        self,
        process_atom: ProcessAtom,
        variant_frame: DataFrame,
        activity_map: dict,
        consider_vacuity: bool = True,
    ):
        variant_frame["tmp_enc_variant_string"] = variant_frame["enc_variant_string"]
        if process_atom.arity == 1:
            if (
                self.event_hierarchy is not None
                and process_atom.operands[0] in self.event_hierarchy.values()
            ):
                # print(process_atom.operands[0], self.event_hierarchy.values())
                variant_frame["tmp_enc_variant_string"] = variant_frame[
                    "enc_variant_string"
                ].apply(
                    lambda x: replace_with_hierarchy(
                        process_atom.operands[0], x, self.event_hierarchy, activity_map
                    )
                )
            return variant_frame["tmp_enc_variant_string"].apply(
                lambda x: self.check_unary_regex(
                    process_atom.atom_type,
                    activity_map[process_atom.operands[0]],
                    process_atom.cardinality,
                    process_atom.cardinality,
                    x,
                )
            )
        if process_atom.arity == 2:
            if (
                self.event_hierarchy is not None
                and process_atom.operands[0] in self.event_hierarchy.values()
            ):
                variant_frame["tmp_enc_variant_string"] = variant_frame[
                    "enc_variant_string"
                ].apply(
                    lambda x: replace_with_hierarchy(
                        process_atom.operands[0], x, self.event_hierarchy, activity_map
                    )
                )
            if (
                self.event_hierarchy is not None
                and process_atom.operands[1] in self.event_hierarchy.values()
            ):
                variant_frame["tmp_enc_variant_string"] = variant_frame[
                    "tmp_enc_variant_string"
                ].apply(
                    lambda x: replace_with_hierarchy(
                        process_atom.operands[1], x, self.event_hierarchy, activity_map
                    )
                )

            ds = variant_frame["tmp_enc_variant_string"].apply(
                lambda x: self.check_binary_regex(
                    process_atom.atom_type,
                    activity_map[process_atom.operands[0]],
                    activity_map[process_atom.operands[1]],
                    x,
                )
            )
            if not consider_vacuity:
                return ds & self.compute_activation(
                    process_atom, variant_frame, activity_map
                )
            return ds
        return None

    def compute_activation(
        self, process_atom: ProcessAtom, variant_frame: DataFrame, activity_map: dict
    ):
        if process_atom.arity == 1:
            return variant_frame["tmp_enc_variant_string"].apply(
                lambda x: is_activated(
                    process_atom.atom_type,
                    activity_map[process_atom.operands[0]],
                    None,
                    x,
                )
            )
        if process_atom.arity == 2:
            return variant_frame["tmp_enc_variant_string"].apply(
                lambda x: is_activated(
                    process_atom.atom_type,
                    activity_map[process_atom.operands[0]],
                    activity_map[process_atom.operands[1]],
                    x,
                )
            )
        return None

    def discover_binary(
        self,
        variant_frame: DataFrame,
        item_set: list[str],
        template: str,
        activity_map: dict[str, str],
        consider_vacuity: bool,
        min_support: float,
        atoms: list[ProcessAtom],
    ):
        variant_frame["activation"] = variant_frame["enc_variant_string"].apply(
            lambda x: is_activated(
                template, activity_map[item_set[0]], activity_map[item_set[1]], x
            )
        )
        variant_frame["satisfaction"] = variant_frame["enc_variant_string"].apply(
            lambda x: self.check_binary_regex(
                template, activity_map[item_set[0]], activity_map[item_set[1]], x
            )
        )
        variant_frame["satisfied_when_activated"] = (
            variant_frame["satisfaction"] & variant_frame["activation"]
        )
        if not consider_vacuity:
            variant_frame["satisfaction"] = variant_frame["satisfied_when_activated"]
        num_satisfactions = (
            variant_frame["variant_frequency"]
            .where(variant_frame["satisfaction"])
            .sum()
        )
        num_satisfactions_when_activated = (
            variant_frame["variant_frequency"]
            .where(variant_frame["satisfied_when_activated"])
            .sum()
        )
        support = num_satisfactions / len(self.log)
        num_activations = (
            variant_frame["variant_frequency"].where(variant_frame["activation"]).sum()
        )
        if (consider_vacuity and num_activations == 0) or num_satisfactions == 0:
            return
        confidence = (
            num_satisfactions_when_activated / num_activations
            if num_activations > 0
            else 0.0
        )
        if support >= min_support:
            ops = [item_set[0], item_set[1]]
            atom_str = f"{template}[{item_set[0]}, {item_set[1]}] | | |"
            new_atom = ProcessAtom(
                id=str(uuid4()),
                atom_type=template,
                atom_str=atom_str,
                arity=2,
                level="Activity",
                cardinality=0,
                operands=ops,
                object_type="",
                signal_query=self.signal_query_builder.get_declare_query(
                    self.process,
                    templ_str=template,
                    arg_1=item_set[0],
                    arg_2=item_set[1],
                    count=True,
                    consider_vacuity=consider_vacuity,
                ),
                activation_conditions=[ops[i] for i in activation_based_on[template]],
                target_conditions=[],
                support=support,
                provision_type="LOG_MINED",
                providers=[self.process],
                process=self.process,
                attributes={"confidence": confidence},
            )
            atoms.append(new_atom)

    def discover_unary(
        self,
        variant_frame: DataFrame,
        item_set: list[str],
        template: str,
        activity_map: dict[str, str],
        consider_vacuity: bool,
        min_support: float,
        atoms: list[ProcessAtom],
    ):
        for i in [1]:
            variant_frame["satisfaction"] = variant_frame["enc_variant_string"].apply(
                lambda x: self.check_unary_regex(
                    template, activity_map[item_set[0]], i, i, x
                )
            )
            variant_frame["activation"] = variant_frame["enc_variant_string"].apply(
                lambda x: is_activated(template, activity_map[item_set[0]], None, x)
            )
            num_satisfactions = (
                variant_frame["variant_frequency"]
                .where(variant_frame["satisfaction"])
                .sum()
            )
            if num_satisfactions == 0:
                continue
            support = num_satisfactions / len(self.log)
            num_activations = (
                variant_frame["variant_frequency"]
                .where(variant_frame["activation"])
                .sum()
            )
            confidence = (
                variant_frame["variant_frequency"]
                .where(variant_frame["satisfaction"])
                .sum()
                / num_activations
                if num_activations > 0
                else 0
            )
            if support >= min_support:
                ops = [item_set[0]]
                atom_str = f"{template}{i}[{item_set[0]}] | |"
                new_atom = ProcessAtom(
                    id=str(uuid4()),
                    atom_type=template,
                    atom_str=atom_str,
                    arity=1,
                    level="Activity",
                    cardinality=i,
                    operands=ops,
                    object_type="",
                    signal_query=self.signal_query_builder.get_declare_query(
                        self.process,
                        templ_str=template,
                        m=i,
                        n=i,
                        arg_1=item_set[0],
                        count=True,
                    ),
                    activation_conditions=[
                        ops[i] for i in activation_based_on[template]
                    ],
                    target_conditions=[],
                    support=support,
                    provision_type="LOG_MINED",
                    providers=[self.process],
                    process=self.process,
                    attributes={"confidence": confidence},
                )
                atoms.append(new_atom)
            if template not in supports_cardinality:
                break

    def run(
        self,
        considered_templates: list[str],
        min_support=0.0,
        consider_vacuity=True,
        get_result=False,
    ) -> list[ProcessAtom]:
        atoms = []
        if considered_templates is None:
            return atoms
        self.d4py.compute_frequent_itemsets(
            min_support=min_support, len_itemset=2, algorithm="apriori"
        )
        activities = self.log.unique_activities()
        activity_map = self._map_activities_to_letters(activities)
        variant_frame = self.create_variant_frame_from_log(activity_map)
        item_sets = self.d4py.frequent_item_sets["itemsets"]
        for item_set in tqdm(item_sets):
            item_set = list(item_set)
            atoms_per_item_set = []
            for template in considered_templates:
                if (
                    len(item_set) == 2
                    and template in binary_strings
                    and item_set[0] != item_set[1]
                ):
                    self.discover_binary(
                        variant_frame,
                        item_set,
                        template,
                        activity_map,
                        consider_vacuity,
                        min_support,
                        atoms_per_item_set,
                    )
                    self.discover_binary(
                        variant_frame,
                        item_set[::-1],
                        template,
                        activity_map,
                        consider_vacuity,
                        min_support,
                        atoms_per_item_set,
                    )

                if len(item_set) == 1 and template in unary_strings:
                    self.discover_unary(
                        variant_frame,
                        item_set,
                        template,
                        activity_map,
                        consider_vacuity,
                        min_support,
                        atoms_per_item_set,
                    )
            # TODO apply the pruning strategy based on
            # * number of activations
            # * hierarchy of the templates
            atoms.extend(atoms_per_item_set)
        return atoms

    @staticmethod
    def check_unary_regex(templ_str, a, m, n, string) -> bool:
        # unary constraints are always activated -> there is no need to check for activation here
        regx = instantiate_unary_regex(templ_str, a, m, n)
        match = re.search(regx, string) is not None
        if match:
            if match is True:
                return True
            return match.span() == (0, len(string))
        return False

    @staticmethod
    def check_binary_regex(templ_str, a, b, string) -> bool:
        regx = instantiate_binary_regex(templ_str, a, b)
        # print(regx, string)
        match = re.search(regx, string)
        if match:
            holds = match.span() == (0, len(string))
            return holds
        return False

    # TODO this is just temporay and should be natively intergrated in the atom itself
    def check_time_constraint_violation(
        self, case_id, atom: ProcessAtom, function, limit, unit
    ):
        """
        Check if the time constraint is satisfied for a given case.

        Args:
            case_id (str): The case ID.
            atom (ProcessAtom): The atom to check.
            function (str): The function to check (e.g., "min", "max").
            limit (int): The limit to check against.
            unit (str): The unit of the limit (e.g., "s", "m", "h").

        Returns:
            bool: 0 if the constraint is satisfied, the time difference otherwise.
        """
        dur = abs(
            self.log.get_inter_activity_duration(
                case_id, atom.operands[0], atom.operands[1]
            )
        )
        dur = dur / time_factors[unit] if unit in time_factors else dur
        if function == "min":
            return max(0, limit - dur)
        elif function == "max":
            return max(0, dur - limit)
        raise ValueError("Invalid function")

    def check(
        self, process_atoms: List[ProcessAtom], consider_vacuity=True
    ) -> List[Violation]:
        """
        Checks the event log against the process atoms.

        Args:
            event_log (EventLog): The event log to check.
            process_atoms (List[ProcessAtom]): The process atoms to check against.

        Returns:
            List[Violation]: A list of violations.
        """

        atom_activities = {
            operand for atom in process_atoms for operand in atom.operands
        }
        activities = list(set(self.log.unique_activities() + list(atom_activities)))
        activity_map = self._map_activities_to_letters(activities)
        variant_frame = self.create_variant_frame_from_log(activity_map)
        violations = []
        for atom in process_atoms:
            satisfaction = self.compute_satisfaction(
                atom, variant_frame, activity_map, consider_vacuity
            )
            if satisfaction is not None:
                atom_violations = variant_frame[~satisfaction]
                cases = []
                for _, row in atom_violations.iterrows():
                    cases.extend(row["case_ids"])
                # if len(cases) > 0:
                violations.append(
                    Violation(
                        id=str(uuid4()),
                        log=self.process,
                        atom=atom,
                        cases=cases,
                        frequency=len(cases),
                        attributes={},
                    )
                )
        return violations
