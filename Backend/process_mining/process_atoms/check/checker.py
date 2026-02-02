from typing import List
from uuid import uuid4

from process_atoms.mine.declare.declare import Declare
from process_atoms.mine.declare.parsers.decl_parser import parse_decl
from process_atoms.models.event_log import EventLog
from process_atoms.models.processatom import ProcessAtom
from process_atoms.models.violation import Violation


class Checker:
    def __init__(self, process: str, event_log: EventLog) -> None:
        self.process = process
        self.event_log = event_log
        self.declare_checker = Declare(event_log)

    def get_violations_to_cases(self, violations):
        violation_to_cases = {}
        for case, case_violations in violations.items():
            if len(case_violations) > 0:
                for violation in case_violations:
                    if violation not in violation_to_cases:
                        violation_to_cases[violation] = []
                    violation_to_cases[violation].append(str(case))
        return violation_to_cases

    def check_and_add_violations(self, atom_string_to_atom):
        violations = []
        self.declare_checker.model = parse_decl(atom_string_to_atom.keys())
        res = self.declare_checker.conformance_checking(consider_vacuity=True)
        violations_to_cases = self.get_violations_to_cases(res)
        for key, val in violations_to_cases.items():
            violations.append(
                Violation(
                    id=str(uuid4()),
                    log=self.process,
                    atom=atom_string_to_atom[key],
                    cases=val,
                    frequency=len(val),
                    attributes={},
                )
            )
        return violations

    def check_activity_level_constraints(self, process_atoms: List[ProcessAtom]):
        atom_string_to_atom = {atom.atom_str: atom for atom in process_atoms}
        return self.check_and_add_violations(atom_string_to_atom)

    def check(self, process_atoms: List[ProcessAtom]) -> List[Violation]:
        """
        Checks the event log against the process atoms.

        Args:
            event_log (EventLog): The event log to check.
            process_atoms (List[ProcessAtom]): The process atoms to check against.

        Returns:
            List[Violation]: A list of violations.
        """
        return self.check_activity_level_constraints(process_atoms)
