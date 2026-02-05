import pandas as pd

from process_atoms.mine.declare.enums.mp_constants import Template

LIKE_OBJ_1_ACT_1 = (
    " ((EVENT_NAME LIKE '%{OBJ_ARG}%') AND (EVENT_NAME LIKE '%{ARG_1}%')) "
)
LIKE_OBJ_1_ACT_2 = (
    " ((EVENT_NAME LIKE '%{OBJ_ARG}%') AND (EVENT_NAME LIKE '%{ARG_2}%')) "
)

NOT_LIKE_OBJ_1_ACT_1 = (
    " (NOT ((EVENT_NAME LIKE '%{OBJ_ARG}%') AND (EVENT_NAME LIKE '%{ARG_1}%'))) "
)
NOT_LIKE_OBJ_1_ACT_2 = (
    " (NOT ((EVENT_NAME LIKE '%{OBJ_ARG}%') AND (EVENT_NAME LIKE '%{ARG_2}%'))) "
)

# Placeholders for the query templates
ARG_1 = "{ARG_1}"
ARG_2 = "{ARG_2}"
ARG_3 = "{OBJ_ARG}"
PROCESS = "{PROCESS}"
M = "{M}"
N = "{N}"
LABEL = "{LABEL}"
CASE_ID = "{CASE_ID}"

EVENT_NAME = " EVENT_NAME "
WHERE = "\nWHERE "
WHERE_NOT = "\nWHERE NOT "
WHERE_BEHAVIOUR = "\nWHERE BEHAVIOUR "
MATCHES = "\nMATCHES\n"

A = " a "
B = " b "
C = " c "
D = " d "
NOT_A = " not_a "
NOT_B = " not_b "
NOT_C = " not_c "
NOT_D = " not_d "


OBJ_ACT_VARS = (
    LIKE_OBJ_1_ACT_1
    + "as"
    + A
    + ","
    + LIKE_OBJ_1_ACT_2
    + "as"
    + B
    + ","
    + NOT_LIKE_OBJ_1_ACT_1
    + "as"
    + NOT_A
    + ","
    + NOT_LIKE_OBJ_1_ACT_2
    + "as"
    + NOT_B
)

BASE_QUERY = 'SELECT (CASE_ID)\nFROM "' + PROCESS + '"'
COUNT_BASE_QUERY = 'SELECT COUNT(CASE_ID)\nFROM "' + PROCESS + '"'

event_name_query = 'SELECT DISTINCT EVENT_NAME\nFROM FLATTEN ("' + PROCESS + '")'

trace_query = (
    'SELECT (EVENT_NAME)\nFROM "' + PROCESS + "\" \nWHERE CASE_ID = '" + CASE_ID + "'"
)

matches_regex = {
    Template.RESPONDED_EXISTENCE.templ_str: "(^NOT("
    + A
    + ")* (("
    + A
    + "ANY*"
    + B
    + "ANY*) | ("
    + B
    + "ANY*"
    + A
    + "ANY*))* NOT("
    + A
    + ")*$)",
    Template.CHOICE.templ_str: "((" + A + " | " + B + "))",
    Template.RESPONSE.templ_str: "(^NOT("
    + A
    + ")* ("
    + A
    + "ANY*"
    + B
    + ")*"
    + "NOT("
    + A
    + ")"
    + "*$)",
    Template.PRECEDENCE.templ_str: "(^NOT("
    + B
    + ")* ("
    + A
    + "ANY*"
    + B
    + ")*NOT("
    + B
    + ")*$)",
    Template.CO_EXISTENCE.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* (("
    + A
    + "ANY*"
    + B
    + "ANY*) | ("
    + B
    + "ANY*"
    + A
    + "ANY*))* NOT("
    + A
    + "|"
    + B
    + ")*$)",
    Template.EXCLUSIVE_CHOICE.templ_str: "( ^ (((NOT("
    + B
    + ")*) ("
    + A
    + "NOT("
    + B
    + ")*"
    + ")*) | (("
    + "NOT("
    + A
    + ")"
    + "*)"
    + "("
    + B
    + "NOT("
    + A
    + ")*"
    + ")*)) $)",
    Template.ALTERNATE_RESPONSE.templ_str: "(^NOT("
    + A
    + ")* ("
    + A
    + "NOT("
    + A
    + ")"
    + "*"
    + B
    + "NOT("
    + A
    + ")"
    + "*)*"
    + "NOT("
    + A
    + ")"
    + "*$)",
    Template.CHAIN_RESPONSE.templ_str: "(^NOT("
    + A
    + ")* ("
    + A
    + B
    + "NOT("
    + A
    + ")*"
    + ")*"
    + "NOT("
    + A
    + ")"
    + "*$)",
    Template.ALTERNATE_PRECEDENCE.templ_str: "(^NOT("
    + B
    + ")* ("
    + A
    + "NOT("
    + B
    + ")"
    + "*"
    + B
    + "NOT("
    + B
    + ")"
    + "*)*"
    + "NOT("
    + B
    + ")"
    + "*$)",
    Template.CHAIN_PRECEDENCE.templ_str: "(^NOT("
    + B
    + ")* ("
    + A
    + B
    + "NOT("
    + B
    + ")"
    + "*)*"
    + "NOT("
    + B
    + ")"
    + "*$)",
    Template.SUCCESSION.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* ("
    + A
    + "~>"
    + B
    + ")*"
    + "NOT("
    + A
    + "|"
    + B
    + ")* $)",
    Template.ALTERNATE_SUCCESSION.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* ("
    + A
    + "NOT("
    + A
    + "|"
    + B
    + ")*"
    + B
    + "NOT("
    + A
    + "|"
    + B
    + ")*)*"
    + "NOT("
    + A
    + "|"
    + B
    + ")* $)",
    Template.CHAIN_SUCCESSION.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* ("
    + A
    + B
    + "NOT("
    + A
    + "|"
    + B
    + ")*"
    + ")*"
    + "NOT("
    + A
    + "|"
    + B
    + ")* $)",
    Template.NOT_CO_EXISTENCE.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* (("
    + A
    + "NOT("
    + B
    + "))* | ("
    + B
    + "NOT("
    + A
    + ")))* $)",
    Template.NOT_SUCCESSION.templ_str: "( ^ NOT("
    + A
    + ")* ("
    + A
    + "NOT("
    + B
    + ")*)*"
    + "NOT("
    + A
    + "|"
    + B
    + ")* $)",
}


matches_regex_vac = {
    Template.RESPONDED_EXISTENCE.templ_str: "(^NOT("
    + A
    + ")* (("
    + A
    + "ANY*"
    + B
    + "ANY*) | ("
    + B
    + "ANY*"
    + A
    + "ANY*))* NOT("
    + A
    + ")*$)",
    Template.CHOICE.templ_str: "((" + A + " | " + B + "))",
    Template.RESPONSE.templ_str: "(^NOT("
    + A
    + ")* ("
    + A
    + "ANY*"
    + B
    + ")*"
    + "NOT("
    + A
    + ")"
    + "*$)",
    Template.PRECEDENCE.templ_str: "(^NOT("
    + B
    + ")* ("
    + A
    + "ANY*"
    + B
    + ")*NOT("
    + B
    + ")*$)",
    Template.CO_EXISTENCE.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* (("
    + A
    + "ANY*"
    + B
    + "ANY*) | ("
    + B
    + "ANY*"
    + A
    + "ANY*))* NOT("
    + A
    + "|"
    + B
    + ")*$)",
    Template.EXCLUSIVE_CHOICE.templ_str: "( ^ (((NOT("
    + B
    + ")*) ("
    + A
    + "NOT("
    + B
    + ")*"
    + ")*) | (("
    + "NOT("
    + A
    + ")"
    + "*)"
    + "("
    + B
    + "NOT("
    + A
    + ")*"
    + ")*)) $)",
    Template.ALTERNATE_RESPONSE.templ_str: "(^NOT("
    + A
    + ")* ("
    + A
    + "NOT("
    + A
    + ")"
    + "*"
    + B
    + "NOT("
    + A
    + ")"
    + "*)*"
    + "NOT("
    + A
    + ")"
    + "*$)",
    Template.CHAIN_RESPONSE.templ_str: "(^NOT("
    + A
    + ")* ("
    + A
    + B
    + "NOT("
    + A
    + ")*"
    + ")*"
    + "NOT("
    + A
    + ")"
    + "*$)",
    Template.ALTERNATE_PRECEDENCE.templ_str: "(^NOT("
    + B
    + ")* ("
    + A
    + "NOT("
    + B
    + ")"
    + "*"
    + B
    + "NOT("
    + B
    + ")"
    + "*)*"
    + "NOT("
    + B
    + ")"
    + "*$)",
    Template.CHAIN_PRECEDENCE.templ_str: "(^NOT("
    + B
    + ")* ("
    + A
    + B
    + "NOT("
    + B
    + ")"
    + "*)*"
    + "NOT("
    + B
    + ")"
    + "*$)",
    Template.SUCCESSION.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* ("
    + A
    + "~>"
    + B
    + ")*"
    + "NOT("
    + A
    + "|"
    + B
    + ")* $)",
    Template.ALTERNATE_SUCCESSION.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* ("
    + A
    + "NOT("
    + A
    + "|"
    + B
    + ")*"
    + B
    + "NOT("
    + A
    + "|"
    + B
    + ")*)*"
    + "NOT("
    + A
    + "|"
    + B
    + ")* $)",
    Template.CHAIN_SUCCESSION.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* ("
    + A
    + B
    + "NOT("
    + A
    + "|"
    + B
    + ")*"
    + ")*"
    + "NOT("
    + A
    + "|"
    + B
    + ")* $)",
    Template.NOT_CO_EXISTENCE.templ_str: "( ^ NOT("
    + A
    + "|"
    + B
    + ")* (("
    + A
    + "NOT("
    + B
    + "))* | ("
    + B
    + "NOT("
    + A
    + ")))* $)",
}

query_templates = {
    Template.ABSENCE.templ_str: WHERE
    + "(SELECT COUNT("
    + EVENT_NAME
    + ")"
    + WHERE
    + LIKE_OBJ_1_ACT_1
    + ") < "
    + M,
    Template.EXISTENCE.templ_str: WHERE
    + "(SELECT COUNT("
    + EVENT_NAME
    + ")"
    + WHERE
    + LIKE_OBJ_1_ACT_1
    + ") >= "
    + N,
    Template.EXACTLY.templ_str: WHERE
    + "(SELECT COUNT("
    + EVENT_NAME
    + ")"
    + WHERE
    + LIKE_OBJ_1_ACT_1
    + ") = "
    + N,
    Template.INIT.templ_str: WHERE_BEHAVIOUR
    + LIKE_OBJ_1_ACT_1
    + " as "
    + A
    + MATCHES
    + "(^"
    + A
    + ")",
    Template.END.templ_str: WHERE_BEHAVIOUR
    + LIKE_OBJ_1_ACT_1
    + " as "
    + A
    + MATCHES
    + "("
    + A
    + "$)",
    Template.RESPONDED_EXISTENCE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.RESPONDED_EXISTENCE.templ_str],
    Template.CHOICE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.CHOICE.templ_str],
    Template.RESPONSE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.RESPONSE.templ_str],
    Template.PRECEDENCE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.PRECEDENCE.templ_str],
    Template.CO_EXISTENCE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.CO_EXISTENCE.templ_str],
    Template.EXCLUSIVE_CHOICE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.EXCLUSIVE_CHOICE.templ_str],
    Template.ALTERNATE_RESPONSE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.ALTERNATE_RESPONSE.templ_str],
    Template.CHAIN_RESPONSE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.CHAIN_RESPONSE.templ_str],
    Template.ALTERNATE_PRECEDENCE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.ALTERNATE_PRECEDENCE.templ_str],
    Template.CHAIN_PRECEDENCE.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.CHAIN_PRECEDENCE.templ_str],
    Template.SUCCESSION.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.SUCCESSION.templ_str],
    Template.ALTERNATE_SUCCESSION.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.ALTERNATE_SUCCESSION.templ_str],
    Template.CHAIN_SUCCESSION.templ_str: WHERE_BEHAVIOUR
    + OBJ_ACT_VARS
    + MATCHES
    + matches_regex[Template.CHAIN_SUCCESSION.templ_str],
    Template.NOT_RESPONDED_EXISTENCE.templ_str: None,
    Template.NOT_CHAIN_PRECEDENCE.templ_str: None,
    Template.NOT_PRECEDENCE.templ_str: None,
    Template.NOT_RESPONSE.templ_str: None,
    Template.NOT_CHAIN_RESPONSE.templ_str: None,
    Template.NOT_SUCCESSION.templ_str: None,
    "": "",
}

query_templates_label = {
    Template.ABSENCE.templ_str: WHERE
    + "(SELECT COUNT("
    + EVENT_NAME
    + ")"
    + WHERE
    + EVENT_NAME
    + " = "
    + A
    + ") < "
    + M,
    Template.EXISTENCE.templ_str: WHERE
    + "(SELECT COUNT("
    + EVENT_NAME
    + ")"
    + WHERE
    + EVENT_NAME
    + " = "
    + A
    + ") >= "
    + N,
    Template.EXACTLY.templ_str: WHERE
    + "(SELECT COUNT("
    + EVENT_NAME
    + ")"
    + WHERE
    + EVENT_NAME
    + " = "
    + A
    + ") = "
    + N,
    Template.INIT.templ_str: WHERE + EVENT_NAME + MATCHES + "(^" + A + ")",
    Template.END.templ_str: WHERE + EVENT_NAME + MATCHES + "(" + A + "$)",
    Template.RESPONDED_EXISTENCE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.RESPONDED_EXISTENCE.templ_str],
    Template.CHOICE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.CHOICE.templ_str],
    Template.RESPONSE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.RESPONSE.templ_str],
    Template.PRECEDENCE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.PRECEDENCE.templ_str],
    Template.CO_EXISTENCE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.CO_EXISTENCE.templ_str],
    Template.EXCLUSIVE_CHOICE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.EXCLUSIVE_CHOICE.templ_str],
    Template.ALTERNATE_RESPONSE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.ALTERNATE_RESPONSE.templ_str],
    Template.CHAIN_RESPONSE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.CHAIN_RESPONSE.templ_str],
    Template.ALTERNATE_PRECEDENCE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.ALTERNATE_PRECEDENCE.templ_str],
    Template.CHAIN_PRECEDENCE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.CHAIN_PRECEDENCE.templ_str],
    Template.SUCCESSION.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.SUCCESSION.templ_str],
    Template.ALTERNATE_SUCCESSION.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.ALTERNATE_SUCCESSION.templ_str],
    Template.CHAIN_SUCCESSION.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.CHAIN_SUCCESSION.templ_str],
    Template.NOT_CO_EXISTENCE.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.NOT_CO_EXISTENCE.templ_str],
    Template.NOT_RESPONDED_EXISTENCE.templ_str: None,
    Template.NOT_CHAIN_PRECEDENCE.templ_str: None,
    Template.NOT_PRECEDENCE.templ_str: None,
    Template.NOT_RESPONSE.templ_str: None,
    Template.NOT_CHAIN_RESPONSE.templ_str: None,
    Template.NOT_SUCCESSION.templ_str: WHERE
    + EVENT_NAME
    + MATCHES
    + matches_regex[Template.NOT_SUCCESSION.templ_str],
    "": "",
}


class SignalQueryBuilder:
    def __init__(self):
        pass

    def get_event_name_query(self, process):
        return event_name_query.replace(PROCESS, process)

    def get_trace_query(self, process, c_id):
        return trace_query.replace(PROCESS, process).replace(CASE_ID, c_id)

    def get_base_query(self, process, count=False):
        return (
            COUNT_BASE_QUERY.replace(PROCESS, process)
            if count
            else BASE_QUERY.replace(PROCESS, process)
        )

    def get_behavioral_query(
        self,
        process,
        templ_str,
        arg_1,
        arg_2=None,
        obj_arg=None,
        m=None,
        n=None,
        count=False,
    ):
        # query_templates = signal_representations_violation if violation else signal_representations_actual
        if query_templates[templ_str] is None:
            return ""
        query = self.get_base_query(process, count) + query_templates[templ_str]
        query = query.replace(ARG_1, arg_1)
        if arg_2 is not None and not pd.isna(arg_2) and arg_2 != "":
            query = query.replace(ARG_2, arg_2)
        if obj_arg is not None and not pd.isna(obj_arg) and obj_arg != "":
            query = query.replace(ARG_3, obj_arg)
        if m is not None:
            query = query.replace(M, str(m))
        if n is not None:
            query = query.replace(N, str(n))
        return query

    def get_declare_query(
        self,
        process,
        templ_str,
        arg_1,
        arg_2=None,
        m=None,
        n=None,
        count=False,
        consider_vacuity=True,
    ):
        # query_templates = signal_representations_violation if violation else signal_representations_actual
        if query_templates_label[templ_str] is None:
            return None
        if not consider_vacuity:
            query = (
                self.get_base_query(process, count=count)
                + query_templates_label[templ_str]
            )
        else:
            query = (
                self.get_base_query(process, count=count)
                + query_templates_label[templ_str]
            )
        query = query.replace(A, " '" + str(arg_1) + "' ")
        if arg_2 is not None:
            query = query.replace(B, " '" + str(arg_2) + "' ")
        if m is not None:
            query = query.replace(M, str(m))
        if n is not None:
            query = query.replace(N, str(n))
        return query

    def get_complement_declare_query(
        self, process, templ_str, arg_1, arg_2=None, m=None, n=None, count=False
    ):
        query = self.get_declare_query(process, templ_str, arg_1, arg_2, m, n, count)
        if "(SELECT COUNT(" + EVENT_NAME + ")" + WHERE in query:
            if "=<" in query:
                query = query.replace("=<", ">")
            elif ">=" in query:
                query = query.replace(">=", "<")
            elif "<" in query:
                query = query.replace("<", ">=")
            elif "=" in query:
                query = "<>".join(query.rsplit("=", 1))
                # query = query.replace("=", "<>")
            elif ">" in query:
                query = query.replace(">", "<=")
        elif WHERE in query:
            query = query.replace(WHERE, WHERE_NOT)
        return query

    def get_complement_behavioral_query(
        self,
        process,
        templ_str,
        arg_1,
        arg_2=None,
        obj_arg=None,
        m=None,
        n=None,
        count=False,
    ):
        query = self.get_behavioral_query(
            process, templ_str, arg_1, arg_2, obj_arg, m, n, count
        )
        if "(SELECT COUNT(" + EVENT_NAME + ")" + WHERE in query:
            if "=<" in query:
                query = query.replace("=<", ">")
            elif ">=" in query:
                query = query.replace(">=", "<")
            elif "<" in query:
                query = query.replace("<", ">=")
            elif "=" in query:
                query = query.replace("=", "<>")
            elif ">" in query:
                query = query.replace(">", "<=")
        elif WHERE in query:
            query = query.replace(WHERE, WHERE_NOT)
        return query
