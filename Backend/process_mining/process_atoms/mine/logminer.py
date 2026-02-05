from uuid import uuid4

from process_atoms.mine.declare.declare import Declare
from process_atoms.mine.declare.enums.mp_constants import activation_based_on
from process_atoms.mine.declare.parsers.decl_parser import parse_single_constraint
from process_atoms.mine.declare.regexchecker import RegexChecker
from process_atoms.models.event_log import EventLog
from process_atoms.models.processatom import ProcessAtom


class LogMiner:
    def __init__(self, process: str, log: EventLog):
        self.process = process
        self.log = log

    def mine(
        self,
        considered_templates: list[str] = None,
        min_support=0.0,
        local=False,
        d4py=False,
        consider_vacuity=True,
    ) -> list[ProcessAtom]:
        if local:
            if d4py:
                return self.mine_directly_from_log(
                    considered_templates,
                    min_support=min_support,
                    consider_vacuity=consider_vacuity,
                )
        return self.mine_using_regex(
            considered_templates,
            min_support=min_support,
            consider_vacuity=consider_vacuity,
        )

    def mine_directly_from_log(
        self,
        considered_templates: list[str] = None,
        min_support=0.0,
        consider_vacuity=True,
    ) -> list[ProcessAtom]:
        d4py = Declare(self.log)
        d4py.compute_frequent_itemsets(
            min_support=min_support, len_itemset=2, algorithm="apriori"
        )
        res = d4py.discovery(
            consider_vacuity=consider_vacuity,
            max_declare_cardinality=3,
            considered_templates=considered_templates,
        )
        atoms = []
        for constraint, _ in res.items():
            parsed = parse_single_constraint(constraint)
            template = parsed["template"].templ_str
            if parsed is None or (
                considered_templates is not None
                and template not in considered_templates
            ):
                continue
            if "[]" not in constraint and "[none]" not in constraint:
                ops = (
                    constraint.split("[")[1]
                    .replace("]", "")
                    .replace("|", "")
                    .split(",")
                )
                ops = [op.strip() for op in ops]
                new_atom = ProcessAtom(
                    id=str(uuid4()),
                    atom_type=template,
                    atom_str=constraint,
                    arity=len(ops),
                    level="Activity",
                    cardinality=parsed["n"] if "n" in parsed else 0,
                    operands=ops,
                    signal_query="",
                    activation_conditions=[
                        ops[i] for i in activation_based_on[template]
                    ],
                    target_conditions=[],
                    support=len(res[constraint]) / len(self.log),
                    provision_type="BPMN_MINED",
                    providers=[self.process],
                    attributes={},
                )
                atoms.append(new_atom)
        return atoms

    def mine_using_regex(
        self,
        considered_templates: list[str] = None,
        min_support=0.0,
        consider_vacuity=True,
    ) -> list[ProcessAtom]:
        checker = RegexChecker(self.process, self.log)
        return checker.run(
            considered_templates=considered_templates,
            min_support=min_support,
            consider_vacuity=consider_vacuity,
        )
