import json
from uuid import uuid4

from process_atoms.mine.bpmnconstraints.compiler.bpmn_compiler import Compiler
from process_atoms.mine.bpmnconstraints.parser.bpmn_parser import Parser
from process_atoms.mine.conversion.bpmnjsonanalyzer import parse_model_elements
from process_atoms.mine.conversion.variantgenerator import VariantGenerator
from process_atoms.mine.declare.enums.mp_constants import (
    Template,
    activation_based_on,
    binary_strings,
    unary_strings,
)
from process_atoms.mine.declare.parsers.decl_parser import parse_single_constraint
from process_atoms.mine.declare.regexchecker import RegexChecker
from process_atoms.models.processatom import ProcessAtom
from process_atoms.utils import reduce_redundancies, remove_useless_atoms

required_templates = {
    Template.CHAIN_RESPONSE.templ_str: (
        Template.CHAIN_PRECEDENCE.templ_str,
        Template.CHAIN_SUCCESSION.templ_str,
    ),
    Template.CHAIN_PRECEDENCE.templ_str: (
        Template.CHAIN_RESPONSE.templ_str,
        Template.CHAIN_SUCCESSION.templ_str,
    ),
    Template.ALTERNATE_RESPONSE.templ_str: (
        Template.ALTERNATE_PRECEDENCE.templ_str,
        Template.ALTERNATE_SUCCESSION.templ_str,
    ),
    Template.ALTERNATE_PRECEDENCE.templ_str: (
        Template.ALTERNATE_RESPONSE.templ_str,
        Template.ALTERNATE_SUCCESSION.templ_str,
    ),
    Template.RESPONSE.templ_str: (
        Template.PRECEDENCE.templ_str,
        Template.SUCCESSION.templ_str,
    ),
    Template.PRECEDENCE.templ_str: (
        Template.RESPONSE.templ_str,
        Template.SUCCESSION.templ_str,
    ),
}


class ModelMiner:
    def __init__(self, model_id: str, model_json: str):
        self.model_id = model_id
        self.model_json = model_json
        self.model_obj = json.loads(model_json)
        self.model_elements, self.follows, self.labels = parse_model_elements(
            self.model_id, self.model_obj
        )
        self.variant_generator = VariantGenerator(
            self.model_id,
            self.model_obj,
            self.model_elements,
            self.follows,
            self.labels,
        )

    def mine_with_petri(
        self, considered_templates: list[str] = None
    ) -> list[ProcessAtom]:
        variant_log = self.variant_generator.extract_variants()
        if variant_log is None:
            return []
        regex_checker = RegexChecker(self.model_id, variant_log)
        process_atoms = regex_checker.run(
            considered_templates=considered_templates, consider_vacuity=True
        )
        # only keep atoms with support of 1
        process_atoms = [
            atom
            for atom in process_atoms
            if atom.support == 1 and atom.attributes["confidence"] == 1
        ]
        if len(process_atoms) == 0:
            return []
        process_atoms = remove_useless_atoms(process_atoms)
        process_atoms = reduce_redundancies(process_atoms)
        # change the priveder type to model mined
        for atom in process_atoms:
            atom.provision_type = "BPMN_MINED"
            atom.providers = [self.model_id]
        return process_atoms

    def mine(self, considered_templates: list[str] = None) -> list[ProcessAtom]:
        res = Parser(
            bpmn=self.model_obj, is_file=False, transitivity=True, sanitize=True
        ).run()
        res = Compiler(sequence=res, transitivity=True, skip_named_gateways=True).run()
        atom_objects = []
        for constraint in res:
            declare = constraint["DECLARE"] + " | |"
            parsed = parse_single_constraint(declare)
            template = parsed["template"].templ_str
            if parsed is None or (
                considered_templates is not None
                and parsed["template"].templ_str not in considered_templates
            ):
                continue

            signal = constraint["SIGNAL"]
            if "[]" not in declare and "[none]" not in declare:
                ops = parsed["activities"]
                ops = [op.strip() for op in ops]
                if len(ops) != 1 and template in unary_strings:
                    continue
                if len(ops) != 2 and template in binary_strings:
                    continue
                new_atom = ProcessAtom(
                    id=str(uuid4()),
                    atom_type=template,
                    atom_str=declare,
                    arity=len(ops),
                    level="Activity",
                    cardinality=1,
                    operands=ops,
                    signal_query=signal,
                    activation_conditions=[
                        ops[i] for i in activation_based_on[template]
                    ],
                    target_conditions=[],
                    support=1,
                    provision_type="BPMN_MINED",
                    providers=[self.model_id],
                    attributes={
                        "operand_info": [
                            self.model_elements[self.model_id + operand]
                            for operand in constraint["OPERAND_IDS"]
                        ]
                    },
                )
                atom_objects.append(new_atom)
        atom_objects = remove_useless_atoms(atom_objects)
        atom_objects = reduce_redundancies(atom_objects)
        return atom_objects
