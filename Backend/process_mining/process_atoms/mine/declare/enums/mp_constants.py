from enum import Enum


class Template(str, Enum):
    def __new__(cls, *args, **kwds):
        value = len(cls.__members__) + 1
        obj = str.__new__(cls)
        obj._value_ = value
        return obj

    def __init__(
        self,
        templ_str: str,
        is_binary: bool,
        is_negative: bool,
        supports_cardinality: bool,
    ):
        self.templ_str = templ_str
        self.is_binary = is_binary
        self.is_negative = is_negative
        self.supports_cardinality = supports_cardinality

    EXISTENCE = "Existence", False, False, True
    ABSENCE = "Absence", False, False, True
    EXACTLY = "Exactly", False, False, True

    INIT = "Init", False, False, False
    END = "End", False, False, False

    CHOICE = "Choice", True, False, False
    EXCLUSIVE_CHOICE = "Exclusive Choice", True, False, False
    RESPONDED_EXISTENCE = "Responded Existence", True, False, False
    RESPONSE = "Response", True, False, False
    ALTERNATE_RESPONSE = "Alternate Response", True, False, False
    CHAIN_RESPONSE = "Chain Response", True, False, False
    PRECEDENCE = "Precedence", True, False, False
    ALTERNATE_PRECEDENCE = "Alternate Precedence", True, False, False
    CHAIN_PRECEDENCE = "Chain Precedence", True, False, False

    SUCCESSION = "Succession", True, False, False
    ALTERNATE_SUCCESSION = "Alternate Succession", True, False, False
    CHAIN_SUCCESSION = "Chain Succession", True, False, False
    CO_EXISTENCE = "Co-Existence", True, False, False

    NOT_CO_EXISTENCE = "Not Co-Existence", True, True, False
    NOT_RESPONDED_EXISTENCE = "Not Responded Existence", True, True, False
    NOT_RESPONSE = "Not Response", True, True, False
    NOT_CHAIN_RESPONSE = "Not Chain Response", True, True, False
    NOT_PRECEDENCE = "Not Precedence", True, True, False
    NOT_CHAIN_PRECEDENCE = "Not Chain Precedence", True, True, False

    NOT_SUCCESSION = "Not Succession", True, True, False
    NOT_ALTERNATE_SUCCESSION = "Not Alternate Succession", True, True, False
    NOT_CHAIN_SUCCESSION = "Not Chain Succession", True, True, False

    @classmethod
    def get_template_from_string(cls, template_str):
        return next(filter(lambda t: t.templ_str == template_str, Template), None)

    @classmethod
    def get_unary_templates(cls):
        return tuple(filter(lambda t: not t.is_binary, Template))

    @classmethod
    def get_binary_templates(cls):
        return tuple(filter(lambda t: t.is_binary, Template))

    @classmethod
    def get_positive_templates(cls):
        return tuple(filter(lambda t: not t.is_negative, Template))

    @classmethod
    def get_negative_templates(cls):
        return tuple(filter(lambda t: t.is_negative, Template))

    @classmethod
    def get_cardinality_templates(cls):
        return tuple(filter(lambda t: t.supports_cardinality, Template))


supports_cardinality = {
    Template.EXISTENCE.templ_str,
    Template.ABSENCE.templ_str,
    Template.EXACTLY.templ_str,
}

binary_strings = {
    Template.CHOICE.templ_str,
    Template.EXCLUSIVE_CHOICE.templ_str,
    Template.RESPONDED_EXISTENCE.templ_str,
    Template.RESPONSE.templ_str,
    Template.ALTERNATE_RESPONSE.templ_str,
    Template.CHAIN_RESPONSE.templ_str,
    Template.PRECEDENCE.templ_str,
    Template.ALTERNATE_PRECEDENCE.templ_str,
    Template.CHAIN_PRECEDENCE.templ_str,
    Template.SUCCESSION.templ_str,
    Template.ALTERNATE_SUCCESSION.templ_str,
    Template.CHAIN_SUCCESSION.templ_str,
    Template.CO_EXISTENCE.templ_str,
    Template.NOT_CO_EXISTENCE.templ_str,
    Template.NOT_RESPONDED_EXISTENCE.templ_str,
    Template.NOT_RESPONSE.templ_str,
    Template.NOT_CHAIN_RESPONSE.templ_str,
    Template.NOT_PRECEDENCE.templ_str,
    Template.NOT_CHAIN_PRECEDENCE.templ_str,
    Template.NOT_SUCCESSION.templ_str,
    Template.NOT_ALTERNATE_SUCCESSION.templ_str,
    Template.NOT_CHAIN_SUCCESSION.templ_str,
}

directed_strings = {
    Template.PRECEDENCE.templ_str,
    Template.ALTERNATE_PRECEDENCE.templ_str,
    Template.CHAIN_PRECEDENCE.templ_str,
    Template.SUCCESSION.templ_str,
    Template.ALTERNATE_SUCCESSION.templ_str,
    Template.CHAIN_SUCCESSION.templ_str,
    Template.RESPONSE.templ_str,
    Template.ALTERNATE_RESPONSE.templ_str,
    Template.CHAIN_RESPONSE.templ_str,
    Template.NOT_SUCCESSION.templ_str,
    Template.NOT_ALTERNATE_SUCCESSION.templ_str,
    Template.NOT_CHAIN_SUCCESSION.templ_str,
}

unary_strings = {
    Template.ABSENCE.templ_str,
    Template.EXISTENCE.templ_str,
    Template.EXACTLY.templ_str,
    Template.INIT.templ_str,
    Template.END.templ_str,
}


existence_based_on = {
    Template.ABSENCE.templ_str: None,
    Template.EXISTENCE.templ_str: None,
    Template.EXACTLY.templ_str: None,
    Template.INIT.templ_str: None,
    Template.END.templ_str: None,
}

relation_based_on = {
    Template.RESPONSE.templ_str: Template.RESPONDED_EXISTENCE.templ_str,
    Template.ALTERNATE_RESPONSE.templ_str: Template.RESPONSE.templ_str,
    Template.CHAIN_RESPONSE.templ_str: Template.ALTERNATE_RESPONSE.templ_str,
    Template.ALTERNATE_PRECEDENCE.templ_str: Template.PRECEDENCE.templ_str,
    Template.CHAIN_PRECEDENCE.templ_str: Template.ALTERNATE_PRECEDENCE.templ_str,
    Template.NOT_RESPONDED_EXISTENCE.templ_str: Template.NOT_SUCCESSION.templ_str,
    Template.NOT_RESPONSE.templ_str: Template.NOT_CHAIN_RESPONSE.templ_str,
    Template.NOT_PRECEDENCE.templ_str: Template.NOT_CHAIN_PRECEDENCE.templ_str,
    Template.NOT_SUCCESSION.templ_str: Template.NOT_ALTERNATE_SUCCESSION.templ_str,
    Template.NOT_ALTERNATE_SUCCESSION.templ_str: Template.NOT_CHAIN_SUCCESSION.templ_str,
}

subsumption_hierarchy = {
    Template.RESPONDED_EXISTENCE.templ_str: 4,
    Template.RESPONSE.templ_str: 3,
    Template.ALTERNATE_RESPONSE.templ_str: 2,
    Template.CHAIN_RESPONSE.templ_str: 1,
    Template.PRECEDENCE.templ_str: 3,
    Template.ALTERNATE_PRECEDENCE.templ_str: 2,
    Template.CHAIN_PRECEDENCE.templ_str: 1,
    Template.CO_EXISTENCE.templ_str: 4,
    Template.SUCCESSION.templ_str: 3,
    Template.ALTERNATE_SUCCESSION.templ_str: 2,
    Template.CHAIN_SUCCESSION.templ_str: 1,
    Template.NOT_CO_EXISTENCE.templ_str: 1,
    Template.NOT_CHAIN_SUCCESSION.templ_str: 2,
    Template.NOT_SUCCESSION.templ_str: 3,
}

opponent_constraint = {
    Template.NOT_CHAIN_PRECEDENCE.templ_str: Template.CHAIN_PRECEDENCE.templ_str,
    Template.NOT_PRECEDENCE.templ_str: Template.PRECEDENCE.templ_str,
    Template.NOT_RESPONSE.templ_str: Template.RESPONSE.templ_str,
    Template.NOT_CHAIN_RESPONSE.templ_str: Template.CHAIN_RESPONSE.templ_str,
    Template.NOT_RESPONDED_EXISTENCE.templ_str: Template.RESPONDED_EXISTENCE.templ_str,
    # Template.NOT_SUCCESSION: Template.SUCCESSION
}

regex_representations = {
    Template.ABSENCE.templ_str: r"\[^a]*(a[^a]*){0,m}+[^a]*",
    Template.EXISTENCE.templ_str: r"[^a]*(a[^a]*){n,}+[^a]*",
    Template.EXACTLY.templ_str: r"[^a]*(a[^a]*)+[^a]*",
    Template.INIT.templ_str: r"a.*",
    Template.END.templ_str: r".*a",
    Template.CHOICE.templ_str: r"",
    Template.EXCLUSIVE_CHOICE.templ_str: r"[^ab]*((a[^b]*)|(b[^a]*))?",
    Template.RESPONDED_EXISTENCE.templ_str: r"[^a]*((a.*b.*)|(b.*a.*))*[^a]*",
    Template.RESPONSE.templ_str: r"[^a]*(a.*b)*[^a]*",
    Template.ALTERNATE_RESPONSE.templ_str: r"[^a]*(a[^a]*b[^a]*)*[^a]*",
    Template.CHAIN_RESPONSE.templ_str: r"[^a]*(ab[^a]*)*[^a]*",
    Template.PRECEDENCE.templ_str: r"[^b]*(a.*b)*[^b]*",
    Template.ALTERNATE_PRECEDENCE.templ_str: r"[^b]*(a[^b]*b[^b]*)*[^b]*",
    Template.CHAIN_PRECEDENCE.templ_str: r"[^b]*(ab[^b]*)*[^b]*",
    Template.SUCCESSION.templ_str: r"[^ab]*(a.*b)*[^ab]*",
    Template.ALTERNATE_SUCCESSION.templ_str: r"[^ab]*(a[^ab]*b[^ab]*)*[^ab]*",
    Template.CHAIN_SUCCESSION.templ_str: r"[^ab]*(ab[^ab]*)*[^ab]*",
    Template.CO_EXISTENCE.templ_str: r"[^ab]*((a.*b.*)|(b.*a.*))*[^ab]*",
    Template.NOT_RESPONDED_EXISTENCE.templ_str: r"",
    Template.NOT_CHAIN_PRECEDENCE.templ_str: r"",
    Template.NOT_PRECEDENCE.templ_str: r"",
    Template.NOT_RESPONSE.templ_str: r"",
    Template.NOT_CHAIN_RESPONSE.templ_str: r"",
    Template.NOT_SUCCESSION.templ_str: r"[^a]*(a[^b]*)*[^ab]*",
    Template.NOT_CO_EXISTENCE.templ_str: r"",
    "": "",
}

"""
Mapping of the templates to the operator index that activates them (pending other activitation conditions).
"""
activation_based_on = {
    Template.ABSENCE.templ_str: [],
    Template.EXISTENCE.templ_str: [],
    Template.EXACTLY.templ_str: [],
    Template.INIT.templ_str: [],
    Template.END.templ_str: [],
    Template.CHOICE.templ_str: [0, 1],
    Template.EXCLUSIVE_CHOICE.templ_str: [0, 1],
    Template.RESPONDED_EXISTENCE.templ_str: [0],
    Template.RESPONSE.templ_str: [0],
    Template.ALTERNATE_RESPONSE.templ_str: [0],
    Template.CHAIN_RESPONSE.templ_str: [0],
    Template.PRECEDENCE.templ_str: [1],
    Template.ALTERNATE_PRECEDENCE.templ_str: [1],
    Template.CHAIN_PRECEDENCE.templ_str: [1],
    Template.SUCCESSION.templ_str: [0, 1],
    Template.ALTERNATE_SUCCESSION.templ_str: [0, 1],
    Template.CHAIN_SUCCESSION.templ_str: [0, 1],
    Template.CO_EXISTENCE.templ_str: [0, 1],
    Template.NOT_RESPONDED_EXISTENCE.templ_str: [0],
    Template.NOT_RESPONSE.templ_str: [0],
    Template.NOT_CHAIN_RESPONSE.templ_str: [0],
    Template.NOT_PRECEDENCE.templ_str: [1],
    Template.NOT_CHAIN_PRECEDENCE.templ_str: [1],
    Template.NOT_SUCCESSION.templ_str: [0, 1],
    Template.NOT_ALTERNATE_SUCCESSION.templ_str: [0, 1],
    Template.NOT_CHAIN_SUCCESSION.templ_str: [0, 1],
    Template.NOT_CO_EXISTENCE.templ_str: [0, 1],
}


class TraceState(str, Enum):
    VIOLATED = "Violated"
    SATISFIED = "Satisfied"
    POSSIBLY_VIOLATED = "Possibly Violated"
    POSSIBLY_SATISFIED = "Possibly Satisfied"
