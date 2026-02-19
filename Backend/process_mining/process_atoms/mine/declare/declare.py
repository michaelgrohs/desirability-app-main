from __future__ import annotations

import logging
import re
import warnings
from itertools import combinations, product
from typing import List

import pandas as pd
from mlxtend.frequent_patterns import apriori, fpgrowth
from mlxtend.preprocessing import TransactionEncoder
from tqdm import tqdm

from process_mining.process_atoms.mine.declare.enums.mp_constants import Template, TraceState
from process_mining.process_atoms.mine.declare.functions import (
    check_trace_conformance,
    discover_constraint,
    query_constraint,
)
from process_mining.process_atoms.mine.declare.models.checker_result import CheckerResult
from process_mining.process_atoms.models.event_log import EventLog

warnings.filterwarnings("ignore", category=DeprecationWarning)

_logger = logging.getLogger(__name__)


class Declare:
    """
    Wrapper that collects the input log and model, the supported templates, the output for the discovery, checking
    checking and query checking tasks. In addition, it contains the computed binary encoding and frequent items
    for the input log.

    Attributes
    ----------
    log : List[List[dict[str, str]]]
        the input event log
    model : DeclModel
        the input DECLARE model parsed from a decl file
    log_length : int
        the trace number of the input log
    supported_templates : tuple[str]
        tuple containing all the DECLARE templates supported by the Declare4Py library
    binary_encoded_log : DataFrame
        the binary encoded version of the input log
    frequent_item_sets : DataFrame
        list of the most frequent item sets found along the log traces, together with their support and length
    conformance_checking_results : int: dict[str: CheckerResult]]
        output dictionary of the conformance_checking() function. Each entry contains:
        key = trace_pos_inside_log
        val = dict[ constraint_string : CheckerResult ]
    query_checking_results : dict[str: dict[str: str]]
        output dictionary of the query_checking() function. Each entry contains:
        key = constraint_string
        val = dict[ constraint_elem_key : constraint_elem_val ]
    discovery_results : dict[str: dict[tuple[int, str]: CheckerResult]]
        output dictionary of the discovery() function. Each entry contains:
        key = constraint_string
        val = dict[trace_pos_inside_log : CheckerResult ]
    """

    def __init__(self, log: EventLog):
        self.log = log
        self.model = None
        self.log_length = None
        self.supported_templates = tuple(map(lambda c: c.templ_str, Template))
        self.binary_encoded_log = None
        self.frequent_item_sets = None
        self.conformance_checking_results = None
        self.query_checking_results = None
        self.discovery_results = None

    def log_encoding(self) -> pd.DataFrame:
        """
        Return the log binary encoding, i.e. the one-hot encoding stating whether an attribute is contained
        or not inside each trace of the log.

        Returns
        -------
        binary_encoded_log
            the one-hot encoding of the input log, made over activity names.
        """
        if self.log is None:
            raise RuntimeError("You must load a log before.")
        te = TransactionEncoder()
        activity_sequences = self.log.activity_sequences()
        te_ary = te.fit(activity_sequences).transform(activity_sequences)
        self.binary_encoded_log = pd.DataFrame(te_ary, columns=te.columns_)
        return self.binary_encoded_log

    def compute_frequent_itemsets(
        self, min_support: float, algorithm: str = "fpgrowth", len_itemset: int = None
    ) -> None:
        """
        Compute the most frequent item sets with a support greater or equal than 'min_support' with the given algorithm.

        Parameters
        ----------
        min_support: float
            the minimum support of the returned item sets.
        algorithm : str, optional
            the algorithm for extracting frequent itemsets, choose between 'fpgrowth' (default) and 'apriori'.
        len_itemset : int, optional
            the maximum length of the extracted itemsets.
        """
        if self.log is None:
            raise RuntimeError("You must load a log before.")
        if not 0 <= min_support <= 1:
            raise RuntimeError("Min. support must be in range [0, 1].")
        if min_support == 0:
            # Calculate all unique item sets up to length 2
            lst = list(self.log.unique_activities())
            unique_item_sets = set()
            for i in range(1, len_itemset + 1):  # range up to length
                for combo in combinations(lst, i):
                    unique_item_sets.add(frozenset(combo))
            # Convert set to list and create pandas Series
            series = pd.Series(list(unique_item_sets))
            self.frequent_item_sets = pd.DataFrame({"itemsets": series})
            self.frequent_item_sets["support"] = -1
            self.frequent_item_sets["length"] = self.frequent_item_sets[
                "itemsets"
            ].apply(lambda x: len(x))
            return
            # calculate all item sets up to the given length

        self.log_encoding()
        if algorithm == "fpgrowth":
            frequent_itemsets = fpgrowth(
                self.binary_encoded_log, min_support=min_support, use_colnames=True
            )
        elif algorithm == "apriori":
            frequent_itemsets = apriori(
                self.binary_encoded_log, min_support=min_support, use_colnames=True
            )
        else:
            raise RuntimeError(
                f"{algorithm} algorithm not supported. Choose between fpgrowth and apriori"
            )
        frequent_itemsets["length"] = frequent_itemsets["itemsets"].apply(
            lambda x: len(x)
        )
        if len_itemset is None:
            self.frequent_item_sets = frequent_itemsets
        else:
            self.frequent_item_sets = frequent_itemsets[
                (frequent_itemsets["length"] <= len_itemset)
            ]

    def conformance_checking(
        self, consider_vacuity: bool
    ) -> dict[tuple[int, str] : dict[str:CheckerResult]]:
        """
        Performs checking checking for the provided event log and DECLARE model.

        Parameters
        ----------
        consider_vacuity : bool
            True means that vacuously satisfied traces are considered as satisfied, violated otherwise.

        Returns
        -------
        conformance_checking_results
            dictionary where the key is a list containing trace position inside the log, the value is
            a dictionary with keys the names of the constraints and values a CheckerResult object containing
            the number of pendings, activations, violations, fulfilments and the truth value of the trace for that
            constraint.
        """
        _logger.debug("Checking ...")
        if self.log is None:
            raise RuntimeError("You must load the log before checking the model.")
        if self.model is None:
            raise RuntimeError(
                "You must load the DECLARE model before checking the model."
            )

        self.conformance_checking_results = {}
        # get unique traces from events data frame
        variants = self.log.trace_variants
        for variant, case_idxs in variants.items():
            trc_res = check_trace_conformance(variant, self.model, consider_vacuity)
            for case_idx in case_idxs:
                self.conformance_checking_results[case_idx] = {
                    const
                    for const, res in trc_res.items()
                    if res.state == TraceState.VIOLATED
                }
        return self.conformance_checking_results

    def discovery(
        self,
        consider_vacuity: bool,
        max_declare_cardinality: int = 3,
        considered_templates: list[str] = None,
        do_unary: bool = True,
    ) -> dict[str : dict[tuple[int, str] : CheckerResult]]:
        """
        Performs discovery of the supported DECLARE templates for the provided log by using the computed frequent item
        sets.

        Parameters
        ----------
        consider_vacuity : bool
            True means that vacuously satisfied traces are considered as satisfied, violated otherwise.

        max_declare_cardinality : int, optional
            the maximum cardinality that the algorithm checks for DECLARE templates supporting it (default 3).

        do_unary : bool, optional
            if True, unary constraints are considered (default True).

        Returns
        -------
        discovery_results
            dictionary containing the results indexed by discovered constraints. The value is a dictionary with keys
            the tuples containing id and name of traces that satisfy the constraint. The values of this inner dictionary
            is a CheckerResult object containing the number of pendings, activations, violations, fulfilments.
        """
        if self.log is None:
            raise RuntimeError("You must load a log before.")
        if self.frequent_item_sets is None:
            raise RuntimeError("You must discover frequent itemsets before.")
        if max_declare_cardinality <= 0:
            raise RuntimeError("Cardinality must be greater than 0.")
        if considered_templates is None:
            considered_templates = self.supported_templates
        self.discovery_results = {}
        for item_set in tqdm(self.frequent_item_sets["itemsets"]):
            length = len(item_set)
            if do_unary and length == 1:
                for templ in Template.get_unary_templates():
                    if templ.templ_str in considered_templates:
                        constraint = {
                            "template": templ,
                            "activities": list(item_set),
                            "condition": ("", ""),
                        }
                        if not templ.supports_cardinality:
                            self.discovery_results |= discover_constraint(
                                self.log, constraint, consider_vacuity
                            )
                        else:
                            for i in range(max_declare_cardinality):
                                constraint["n"] = i + 1
                                self.discovery_results |= discover_constraint(
                                    self.log, constraint, consider_vacuity
                                )

            elif length == 2:
                for templ in Template.get_binary_templates():
                    if templ.templ_str in considered_templates:
                        constraint = {
                            "template": templ,
                            "activities": list(item_set),
                            "condition": ("", "", ""),
                        }
                        self.discovery_results |= discover_constraint(
                            self.log, constraint, consider_vacuity
                        )

                        constraint["activities"] = list(reversed(list(item_set)))
                        self.discovery_results |= discover_constraint(
                            self.log, constraint, consider_vacuity
                        )

        return self.discovery_results

    def filter_discovery(
        self, min_support: float = 0
    ) -> dict[str : dict[tuple[int, str] : CheckerResult]]:
        """
        Filters discovery results by means of minimum support.

        Parameters
        ----------
        min_support : float, optional
            the minimum support that a discovered constraint needs to have to be included in the filtered result.


        Returns
        -------
        result
            dictionary containing the results indexed by discovered constraints. The value is a dictionary with keys
            the tuples containing id and name of traces that satisfy the constraint. The values of this inner dictionary
            is a CheckerResult object containing the number of pendings, activations, violations, fulfilments.

        Args:
            plain:
        """
        if self.log is None:
            raise RuntimeError("You must load a log before.")
        if self.discovery_results is None:
            raise RuntimeError("You must run a Discovery task before.")
        if not 0 <= min_support <= 1:
            raise RuntimeError("Min. support must be in range [0, 1].")

        result = {}
        for key, val in self.discovery_results.items():
            support = len(val) / len(self.log)
            if support >= min_support:
                result[key] = val

        return result

    def query_checking(
        self,
        consider_vacuity: bool,
        template_str: str = None,
        max_declare_cardinality: int = 1,
        activation: str = None,
        target: str = None,
        act_cond: str = None,
        trg_cond: str = None,
        time_cond: str = None,
        min_support: float = 1.0,
        return_first: bool = False,
    ) -> dict[str : dict[str:str]]:
        """
        Performs query checking for a (list of) template, activation activity and target activity. Optional
        activation, target and time conditions can be specified.

        Parameters
        ----------
        consider_vacuity : bool
            True means that vacuously satisfied traces are considered as satisfied, violated otherwise.

        template_str : str, optional
            if specified, the query checking is restricted on this DECLARE template. If not, the query checking is
            performed over the whole set of supported templates.

        max_declare_cardinality : int, optional
            the maximum cardinality that the algorithm checks for DECLARE templates supporting it (default 1).

        activation : str, optional
            if specified, the query checking is restricted on this activation activity. If not, the query checking
            considers in turn each activity of the log as activation.

        target : str, optional
            if specified, the query checking is restricted on this target activity. If not, the query checking
            considers in turn each activity of the log as target.

        act_cond : str, optional
            optional activation condition to evaluate. It has to be written by following the DECLARE standard format.

        trg_cond : str, optional
            optional target condition to evaluate. It has to be written by following the DECLARE standard format.

        time_cond : str, optional
            optional time condition to evaluate. It has to be written by following the DECLARE standard format.

        min_support : float, optional
            the minimum support that a constraint needs to have to be included in the result (default 1).

        return_first : bool, optional
            if True, the algorithm returns only the first queried constraint that is above the minimum support. If
            False, the algorithm returns all the constraints above the min. support (default False).

        Returns
        -------
        query_checking_results
            dictionary with keys the DECLARE constraints satisfying the assignments. The values are a structured
            representations of these constraints.
        """
        is_template_given = bool(template_str)
        is_activation_given = bool(activation)
        is_target_given = bool(target)
        if not act_cond:
            act_cond = ""
        if not trg_cond:
            trg_cond = ""
        if not time_cond:
            time_cond = ""

        if not is_template_given and not is_activation_given and not is_target_given:
            raise RuntimeError(
                "You must set at least one parameter among (template, activation, target)."
            )
        if is_template_given:
            template = Template.get_template_from_string(template_str)
            if template is None:
                raise RuntimeError("You must insert a supported DECLARE template.")
            if not template.is_binary and is_target_given:
                raise RuntimeError(
                    "You cannot specify a target activity for unary templates."
                )
        if not 0 <= min_support <= 1:
            raise RuntimeError("Min. support must be in range [0, 1].")
        if max_declare_cardinality <= 0:
            raise RuntimeError("Cardinality must be greater than 0.")
        if self.log is None:
            raise RuntimeError("You must load a log before.")

        templates_to_check = list()
        if is_template_given:
            templates_to_check.append(template_str)
        else:
            templates_to_check += list(
                map(lambda t: t.templ_str, Template.get_binary_templates())
            )
            if not is_target_given:
                for template in Template.get_unary_templates():
                    if template.supports_cardinality:
                        for card in range(max_declare_cardinality):
                            templates_to_check.append(
                                template.templ_str + str(card + 1)
                            )
                    else:
                        templates_to_check.append(template.templ_str)

        activations_to_check = (
            self.log.unique_activities() if activation is None else [activation]
        )
        targets_to_check = self.log.unique_activities() if target is None else [target]
        activity_combos = tuple(
            filter(
                lambda c: c[0] != c[1], product(activations_to_check, targets_to_check)
            )
        )

        self.query_checking_results = {}

        for template_str in templates_to_check:
            template_str, cardinality = re.search(
                r"(^.+?)(\d*$)", template_str
            ).groups()
            template = Template.get_template_from_string(template_str)

            constraint = {"template": template}
            if cardinality:
                constraint["n"] = int(cardinality)

            if template.is_binary:
                constraint["condition"] = (act_cond, trg_cond, time_cond)
                for couple in activity_combos:
                    constraint["activities"] = couple

                    constraint_str = query_constraint(
                        self.log, constraint, consider_vacuity, min_support
                    )
                    if constraint_str:
                        res_value = {
                            "template": template_str,
                            "activation": couple[0],
                            "target": couple[1],
                            "act_cond": act_cond,
                            "trg_cond": trg_cond,
                            "time_cond": time_cond,
                        }
                        self.query_checking_results[constraint_str] = res_value
                        if return_first:
                            return self.query_checking_results

            else:  # unary template
                constraint["condition"] = (act_cond, time_cond)
                for activity in activations_to_check:
                    constraint["activities"] = activity

                    constraint_str = query_constraint(
                        self.log, constraint, consider_vacuity, min_support
                    )
                    if constraint_str:
                        res_value = {
                            "template": template_str,
                            "activation": activity,
                            "act_cond": act_cond,
                            "time_cond": time_cond,
                        }
                        self.query_checking_results[constraint_str] = res_value
                        if return_first:
                            return self.query_checking_results

        return self.query_checking_results

    def filter_query_checking(self, queries) -> List[List[str]]:
        """
        The function outputs, for each constraint of the query checking result, only the elements of the constraint
        specified in the 'queries' list.

        Parameters
        ----------
        queries : list[str]
            elements of the constraint that the user want to retain from query checking result. Choose one (or more)
            elements among: 'template', 'activation', 'target'.

        Returns
        -------
        assignments
            list containing an entry for each constraint of query checking result. Each entry of the list is a list
            itself, containing the queried constraint elements.
        """
        if self.query_checking_results is None:
            raise RuntimeError("You must run a query checking task before.")
        if len(queries) == 0 or len(queries) > 3:
            raise RuntimeError(
                "The list of queries has to contain at least one query and three queries as maximum"
            )
        assignments = []
        for constraint in self.query_checking_results.keys():
            tmp_answer = []
            for query in queries:
                try:
                    tmp_answer.append(self.query_checking_results[constraint][query])
                except KeyError:
                    _logger.error(
                        f"{query} is not a valid query. Valid queries are template, activation, target."
                    )
            assignments.append(tmp_answer)
        return assignments
