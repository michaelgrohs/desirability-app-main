from __future__ import annotations
import json
from typing import Callable, List

from process_mining.process_atoms.match.matcher import Matcher
from process_mining.process_atoms.mine.conversion.bpmnjsonanalyzer import parse_model_elements
from process_mining.process_atoms.mine.conversion.variantgenerator import VariantGenerator
from process_mining.process_atoms.mine.declare.regexchecker import RegexChecker, regex_representations
from process_mining.process_atoms.mine.logminer import LogMiner
from process_mining.process_atoms.mine.modelminer import ModelMiner
from process_mining.process_atoms.models.event_log import EventLog, split_on_case_attribute
from process_mining.process_atoms.models.processatom import ProcessAtom
from process_mining.process_atoms.models.violation import Violation
from process_mining.process_atoms.signalquerybuilder import SignalQueryBuilder
from process_mining.process_atoms.utils import aggregate_process_atoms


class ProcessAtoms:
    def __init__(self):
        self.query_builder = SignalQueryBuilder()

    def get_model_variants(self, model_id: str, model_json: str) -> EventLog:
        model_obj = json.loads(model_json)
        model_elements, follows, labels = parse_model_elements(model_id, model_obj)
        variant_generator = VariantGenerator(
            model_id, model_obj, model_elements, follows, labels
        )
        return variant_generator.extract_variants()

    def get_available_templates(self) -> List[str]:
        """
        Returns a list of available templates.

        Returns:
            List[str]: A list of available templates.
        """
        return list(regex_representations.keys())

    def transform_bpmn_to_atoms(
        self, model_id: str, model_json: str, considered_templates: list[str] = None
    ) -> List[ProcessAtom]:
        """
        Transforms a BPMN model to process atoms.

        Args:
            model_id (str): The ID of the model.
            model_json (str): The JSON representation of the model.
            considered_templates: Templates to consider during mining (optional).

        Returns:
            List[ProcessAtom]: A list of process atoms.
        """
        self.transform_bpmn_to_atoms_with_petri(
            model_id=model_id,
            model_json=model_json,
            considered_templates=considered_templates,
        )

    def transform_bpmn_to_atoms_with_petri(
        self, model_id: str, model_json: str, considered_templates: list[str] = None
    ) -> List[ProcessAtom]:
        """
        Transforms a BPMN model to process atoms.

        Args:
            model_id (str): The ID of the model.
            model_json (str): The JSON representation of the model.
            considered_templates: Templates to consider during mining (optional).

        Returns:
            List[ProcessAtom]: A list of process atoms.
        """
        model_miner = ModelMiner(model_id=model_id, model_json=model_json)
        mined_atoms = model_miner.mine_with_petri(
            considered_templates=considered_templates
        )
        return mined_atoms

    def mine_atoms_from_log(
        self,
        process_id: str,
        log: EventLog,
        considered_templates: list[str] = None,
        min_support=0.0,
        local=False,
        d4py=False,
        consider_vacuity=True,
    ) -> List[ProcessAtom]:
        """
        Mines process atoms from a simple log (activity sequences).

        Args:
            model_id (str): The ID of the model.
            log: The EventLog abstraction from PINT.
            considered_templates: Templates to consider during mining (optional).

        Returns:
            List[ProcessAtom]: A list of mined process atoms.
        """
        log_miner = LogMiner(process=process_id, log=log)
        mined_atoms = log_miner.mine(
            considered_templates=considered_templates,
            min_support=min_support,
            local=local,
            d4py=d4py,
            consider_vacuity=consider_vacuity,
        )
        return aggregate_process_atoms(mined_atoms)

    def mine_behavioral_differences_from_log(
        self,
        process_id: str,
        log: EventLog,
        context_attribute: str,
        considered_templates: list[str] = None,
        min_support=0.0,
        local=False,
        d4py=False,
        consider_vacuity=True,
    ):
        print(log.schema[context_attribute])
        sub_logs = split_on_case_attribute(log, context_attribute)
        context_to_atoms = {}
        for sub_log in sub_logs:
            atoms = self.mine_atoms_from_log(
                process_id=process_id,
                log=sub_log,
                considered_templates=considered_templates,
                min_support=min_support,
                local=local,
                d4py=d4py,
                consider_vacuity=consider_vacuity,
            )
            context_to_atoms[sub_log.schema[context_attribute]] = atoms
        return context_to_atoms

    def aggregate_atoms(self, atoms: List[ProcessAtom]) -> List[ProcessAtom]:
        """
        Aggregates process atoms.

        Args:
            atoms (List[ProcessAtom]): The process atoms to aggregate.

        Returns:
            List[ProcessAtom]: A list of aggregated process atoms.
        """
        return aggregate_process_atoms(atoms)

    def fit_atoms_to_log(
        self,
        process,
        event_log: EventLog,
        process_atoms: List[ProcessAtom],
        matching_function: Callable[[str, str], bool],
        instantiate_for_log: bool = True,
        partial_instantiation: bool = False,
        aggregate: bool = False,
    ) -> List[ProcessAtom]:
        """
        Fits process atoms to a log.

        Args:
            process: The process ID to fit atoms to.
            event_log EventLog: The event log to fit atoms to.
            process_atoms (List[ProcessAtom]): The process atoms to be fitted.
            matching_function (Callable[[str, str], bool]): The matching function to use.

        Returns:
            List[ProcessAtom]: A list of fitted process atoms.
        """
        match = Matcher(process)
        log_components = event_log.unique_activities()
        atoms = match.match_based_on_activities(
            process_atoms=process_atoms,
            log_components=log_components,
            matching_function=matching_function,
            instantiate_for_log=instantiate_for_log,
            partial_instantiation=partial_instantiation,
            aggregate=aggregate,
        )
        return atoms

    def find_fitting_best_practices(
        self,
        process,
        event_log: EventLog,
        process_atoms: List[ProcessAtom],
        matching_function: Callable[[str, str], bool],
        instantiate_for_log: bool = True,
    ) -> List[ProcessAtom]:
        """
        Fits process atoms to a log.

        Args:
            process: The process ID to fit atoms to.
            event_log EventLog: The event log to fit atoms to.
            process_atoms (List[ProcessAtom]): The process atoms to be fitted.
            matching_function (Callable[[str, str], bool]): The matching function to use.

        Returns:
            List[ProcessAtom]: A list of fitted process atoms.
        """
        match = Matcher(process)
        log_components = event_log.unique_activities()
        atoms = match.match_based_on_start_and_end_activities(
            process_atoms=process_atoms,
            log_components=log_components,
            matching_function=matching_function,
            instantiate_for_log=instantiate_for_log,
            aggregate=True,
        )
        return atoms

    def find_based_on_most_frequent_matches(
        self,
        process,
        event_log: EventLog,
        process_atoms: List[ProcessAtom],
        matching_function: Callable[[str, str], bool],
        instantiate_for_log: bool = True,
    ) -> List[ProcessAtom]:
        """
        Fits process atoms to a log.

        Args:
            process: The process ID to fit atoms to.
            event_log EventLog: The event log to fit atoms to.
            process_atoms (List[ProcessAtom]): The process atoms to be fitted.
            matching_function (Callable[[str, str], bool]): The matching function to use.

        Returns:
            List[ProcessAtom]: A list of fitted process atoms.
        """
        match = Matcher(process)
        log_components = event_log.unique_activities()
        atoms = match.match_based_on_frequent_matches(
            process_atoms=process_atoms,
            log_components=log_components,
            matching_function=matching_function,
            instantiate_for_log=instantiate_for_log,
            aggregate=True,
        )
        return atoms

    def check_atom_violations(
        self,
        process: str,
        event_log: EventLog,
        process_atoms: List[ProcessAtom],
        event_hierarchy: dict = None,
    ) -> List[Violation]:
        """
        Checks for atom violations in an event log.

        Args:
            process: The process ID to check for violations.
            event_log EventLog: The event log to check for violations.
            process_atoms (List[ProcessAtom]): The (fitted) process atoms to check.

        Returns:
            List[Violation]: A list violations (atoms and cases that violate them).
        """
        checker = RegexChecker(
            process=process, event_log=event_log, event_hierarchy=event_hierarchy
        )
        return checker.check(process_atoms=process_atoms)
