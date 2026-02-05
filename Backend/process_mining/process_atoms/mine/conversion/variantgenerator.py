import pandas as pd

from process_atoms.constants import (
    DATA_OBJECT,
    ELEMENT_CATEGORY,
    ELEMENT_ID,
    LABEL,
    USELESS_LABELS,
    XES_NAME,
)
from process_atoms.mine.conversion.bpmnjsonanalyzer import (
    replace_multiple_substrings,
    sanitize_label_full,
)
from process_atoms.mine.conversion.jsontopetrinetconverter import (
    JsonToPetriNetConverter,
)
from process_atoms.models import petri
from process_atoms.models.column_types import CaseID, EventTime, EventType
from process_atoms.models.event_log import EventLog, EventLogSchemaTypes


class VariantGenerator:
    def __init__(
        self,
        model_id: str,
        model_obj: dict,
        model_elements: dict,
        follows: list[dict],
        labels: list[dict],
    ):
        self.model_id = model_id
        self.model_obj = model_obj
        self.model_elements = model_elements
        self.follows = follows
        self.labels = labels
        self.converter = JsonToPetriNetConverter()

    def extract_variants(self, as_simple_log=False):
        pn, im, fm = self.converter.convert_from_parsed(self.follows, self.labels)
        variant_set = petri.net_variants(pn, im, fm)
        simple_log = self.replace_attributes(variant_set)
        if as_simple_log:
            return simple_log
        # establish log in EventLog format
        cases = {"c_caseid": CaseID}
        events = {
            "c_caseid": CaseID,
            "c_eventname": EventType,
            "c_time": EventTime,
        }
        schema = EventLogSchemaTypes(
            # schema for case-level attributes
            cases=cases,
            events=events,
        )
        cases_df = pd.DataFrame.from_records(
            [{"c_caseid": str(i)} for i in range(len(simple_log))]
        )

        events_df = pd.DataFrame.from_records(
            [
                {
                    "c_caseid": str(i),
                    "c_eventname": str(e[XES_NAME]),
                    "c_time": pd.Timestamp.now(),
                }
                for i, variant in enumerate(simple_log)
                for e in variant
                if e[XES_NAME] is not None
            ]
        )
        if len(events_df) == 0:
            return None
        events_df["c_time"] = pd.to_datetime(events_df["c_time"], unit="ms")
        event_log = EventLog(cases_df, events_df, schema)
        return event_log

    def replace_attributes(self, variant_set):
        played_out_log = list([{XES_NAME: e} for e in var] for var in variant_set)
        for trace in played_out_log:
            for event in trace:
                e_id = event[XES_NAME]
                event[DATA_OBJECT] = self.model_elements[e_id][DATA_OBJECT]
                event[ELEMENT_ID] = e_id
                event[XES_NAME] = self.model_elements[e_id][LABEL]
                event[ELEMENT_CATEGORY] = self.model_elements[e_id][ELEMENT_CATEGORY]
        played_out_log = [
            [
                event
                for event in trace
                if event[XES_NAME] not in USELESS_LABELS
                and not sanitize_label_full(
                    replace_multiple_substrings(event[XES_NAME], USELESS_LABELS, "")
                )
                == ""
                and "?" not in event[XES_NAME]
            ]
            for trace in played_out_log
        ]
        return played_out_log
