from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Iterable, Iterator, Mapping, Union, overload
from typing import Dict, Type

import numpy as np
import pandas as pd
from pydantic import BaseModel, model_serializer, model_validator

from process_mining.process_atoms.models.column_types import (
    COLUMN_TYPES,
    CaseID,
    ColumnType,
    EventTime,
    EventType,
    _ColumnType,
)


class EventLogSchemaTypes(BaseModel):
    cases: Dict[str, Type[_ColumnType]]
    events: Dict[str, Type[_ColumnType]]

    """
    TODO: add validator that parses types from string to type using  `COLUMN_TYPES`
    @model_validator(mode='before')
    @classmethod
    def check_card_number_omitted(cls, data: Any) -> Any:
        if isinstance(data, dict):
            assert (
                'card_number' not in data
            ), 'card_number should not be included'
        return data
    """

    @model_validator(mode="after")
    def check_special_columns_exist(self) -> "EventLogSchemaTypes":
        # TODO: set values from string to type where necessary so that this model
        # can be deserialized. (Currently only serialization works).
        self.get_case_column(CaseID)
        self.get_event_column(CaseID)
        self.get_event_column(EventType)
        self.get_event_column(EventTime)
        return self

    @model_serializer
    def ser_model(self) -> Dict[str, Any]:
        """
        Before serializing to JSON, turn the subtypes of `ColumnType`s into
        strings from `ColumnTypeName`.
        """
        TYPE_TO_NAME = {v: k for (k, v) in COLUMN_TYPES.items()}
        return {
            "cases": {col: TYPE_TO_NAME[C] for (col, C) in self.cases.items()},
            "events": {col: TYPE_TO_NAME[C] for (col, C) in self.events.items()},
        }

    def get_case_column(self, C: Type[ColumnType]) -> str:
        """
        Return the name of the first case column of type `C`.

        Return `None` if no column has that `ColumnType`.
        """
        for col, T in self.cases.items():
            if issubclass(T, C):
                return col
        else:
            raise ValueError(f"No case column type of type `{C}`")

    def get_event_column(self, C: Type[ColumnType]) -> str:
        """
        Return the name of the first event column of type `C`.

        Return `None` if no column has that `ColumnType`.
        """
        for col, T in self.events.items():
            if issubclass(T, C):
                return col
        else:
            raise ValueError(f"No event column type of type `{C}`")


class EventLogSchema(BaseModel):
    """
    An event log schema contains information about the types of variables each column
    in the case and event attribute tables contains.

    Invariant: When creating an `EventLogSchema`, there must always be exactly one case
    attribute with type `CaseID` and one event attribute with type `CaseID`, `EventType`,
    and `EventTime` each.

    This class contains concrete instances of `ColumnType`s that can include event
    log-specific data. For example, an instance of column type `Categorical` includes
    the set of possible categories that this attribute's values can fall into.

    See `EventLogSchemaTypes` for a version of this class that does not include event
    log-specific data.

    See `ColumnType` and its subclasses for more information on possible column types.
    """

    model_config = {"arbitrary_types_allowed": True}

    cases: Dict[str, _ColumnType]
    events: Dict[str, _ColumnType]

    @model_validator(mode="after")
    def check_special_columns_exist(self) -> "EventLogSchema":
        self.get_case_column(CaseID)
        self.get_event_column(CaseID)
        self.get_event_column(EventType)
        self.get_event_column(EventTime)
        return self

    @classmethod
    def from_types(
        cls,
        schema_types: EventLogSchemaTypes,
        cases: pd.DataFrame,
        events: pd.DataFrame,
    ):
        case_cols = {
            name: ColumnType_.from_series(cases[name])
            for (name, ColumnType_) in schema_types.cases.items()
        }
        event_cols = {
            name: ColumnType_.from_series(events[name])
            for (name, ColumnType_) in schema_types.events.items()
        }
        return cls(cases=case_cols, events=event_cols)

    def get_case_column(self, C: Type[ColumnType]) -> str:
        """
        Return the name of the first event column of type `C`.

        Return `None` if no column has that `ColumnType`.
        """
        for col, coltype in self.cases.items():
            if isinstance(coltype, C):
                return col
        else:
            raise ValueError(f"No case column type of type `{C}`")

    def get_event_column(self, C: Type[ColumnType]) -> str:
        """
        Return the name of the first event column of type `C`.

        Return `None` if no column has that `ColumnType`.
        """
        for col, coltype in self.events.items():
            if isinstance(coltype, C):
                return col
        else:
            raise ValueError(f"No event column type of type `{C}`")

    def to_types(self) -> EventLogSchemaTypes:
        return EventLogSchemaTypes(
            cases={col: type(coltype) for (col, coltype) in self.cases.items()},
            events={col: type(coltype) for (col, coltype) in self.events.items()},
        )


@dataclass
class Case:
    # Case-level attributes
    attributes: Mapping[str, Any]
    # DataFrame of all the case's events.
    events: pd.DataFrame
    # schema
    schema: EventLogSchema

    def __repr__(self):
        return (
            f"Case(\n    attributes = {dict(self.attributes)},\n    events = (DataFrame with "
            "{len(self.events)} events and columns {self.events.columns.tolist()}),\n    "
            "schema = {self.schema}\n)"
        )

    def get_activity_sequence(self):
        return self.events[self.schema.get_event_column(EventType)].tolist()


def _get_first_column_of_type(
    coltypes: Dict[str, _ColumnType], C: Type[ColumnType], error=False
) -> str:
    for col, coltype in coltypes.items():
        if isinstance(coltype, C):
            return col
    else:
        if error:
            print(f"No column of type {type(C)} in ")
            raise ValueError(str(C))
        else:
            return None


@dataclass
class EventLog:
    """

    TODO: document invariants, e.g. events ordered by timestamp
    """

    cases: pd.DataFrame
    events: pd.DataFrame
    schema: EventLogSchema

    def __init__(
        self,
        cases: pd.DataFrame,
        events: pd.DataFrame,
        schema: Union[EventLogSchema, EventLogSchemaTypes],
    ):
        self.cases = cases
        self.events = events
        self._unique_activities = None
        self._activity_counts = None
        self._trace_variant_durations = None
        self._trace_variants = None

        # Use the data to instantiate the `ColumnType`s
        if isinstance(schema, EventLogSchemaTypes):
            self.schema: EventLogSchema = EventLogSchema.from_types(
                schema, cases, events
            )
        else:
            self.schema = schema

        # For performance reasons and so that code working with `EventLog` can make some
        # assumptions, we create a multi-level index on the events and also sort them by
        # time.
        # If an index with the correct name is already there, we assume we don't need to
        # reindex the event log
        if not self.events.index.names == ["case_id", "event_id"]:
            # Sort events by time before creating an index
            self.events = self.events.sort_values(
                self.schema.get_event_column(EventTime)
            )

            # Create integer IDs for cases and events. Using the (string) case and event IDs
            # is not performant, as building the index requires sorting values.
            case_id_col: str = self.schema.get_case_column(CaseID)
            case_ids_orig = self.cases[case_id_col]
            case_ids = np.arange(len(self.cases))
            event_ids = np.arange(len(self.events))
            id_to_i = {
                case_id: i for (case_id, i) in zip(case_ids_orig, range(1000000000))
            }
            case_ids_events = self.events[self.schema.get_event_column(CaseID)].map(
                id_to_i
            )

            # Set index for cases
            self.cases = self.cases.set_index(case_ids)
            self.cases.index.rename("case_id", inplace=True)

            # Set multi-level index on case ID and event ID. This allows efficiently
            # getting all events for a case.
            self.events = self.events.set_index([case_ids_events, event_ids])
            self.events.index.rename(["case_id", "event_id"], inplace=True)

        # Change name of case ID column to not conflict with index
        if "case_id" in self.cases.columns:
            self.cases.rename(columns={"case_id": "_case_id"}, inplace=True)
            self.schema.cases["_case_id"] = self.schema.cases["case_id"]
            del self.schema.cases["case_id"]
        if "case_id" in self.events.columns:
            self.events.rename(columns={"case_id": "_case_id"}, inplace=True)
            self.schema.events["_case_id"] = self.schema.events["case_id"]
            del self.schema.events["case_id"]
        if "event_id" in self.events.columns:
            self.events.rename(columns={"event_id": "_event_id"}, inplace=True)
            self.schema.events["_event_id"] = self.schema.events["event_id"]
            del self.schema.events["event_id"]
        # sanitize labels for Event Type
        self.events[self.schema.get_event_column(EventType)] = (
            self.events[self.schema.get_event_column(EventType)]
            .str.replace("[", "(")
            .str.replace("]", ")")
            .str.replace("|", " ")
        )
        # sort events by case id and event time
        self.events = self.events.sort_values(
            [
                self.schema.get_event_column(CaseID),
                self.schema.get_event_column(EventTime),
            ]
        )

    @overload
    def __getitem__(self, i: Union[int, str]) -> Case:
        ...

    @overload
    def __getitem__(
        self, i: Union[slice, np.ndarray, pd.Index, pd.Series]
    ) -> "EventLog":
        ...

    def __getitem__(
        self, i: Union[int, str, slice, np.ndarray, pd.Index, pd.Series]
    ) -> Union["EventLog", Case]:
        if isinstance(i, int):
            return Case(
                self.cases.iloc[i], self.events.loc[self.cases.index[i]], self.schema
            )
        elif isinstance(i, str):
            return Case(self.cases.loc[i], self.events.loc[i], self.schema)
        elif isinstance(i, slice):
            index = self.cases.index[i]
            return EventLog(
                self.cases.loc[index],
                self.events.loc[index, :],
                self.schema,
            )
        elif isinstance(i, pd.Index):
            return EventLog(
                self.cases.loc[i],
                self.events.loc[i, :],
                self.schema,
            )
        elif isinstance(i, pd.Series) and i.dtype == np.dtype("bool"):
            assert (
                len(i) == len(self.cases)
            ), "To index with boolean mask, it must have the same length as the case data frame!"
            index = self.cases.index[i]
            return EventLog(
                self.cases.loc[index],
                self.events.loc[index, :],
                self.schema,
            )
        elif isinstance(i, pd.Index):
            return EventLog(
                self.cases.loc[i],
                self.events.loc[i, :],
                self.schema,
            )
        elif isinstance(i, (pd.Series, np.ndarray)) and i.dtype == np.dtype("bool"):
            assert (
                len(i) == len(self.cases)
            ), "To index with boolean mask, it must have the same length as the case data frame!"
            index = self.cases.index[i]
            return EventLog(
                self.cases.loc[index],
                self.events.loc[index, :],
                self.schema,
            )
        else:
            raise ValueError(
                f"Invalid index `{i}` of type `{type(i)}`. `int` and `str` are valid index types."
            )

    def __len__(self):
        return len(self.cases)

    def __iter__(self):
        return _EventLogIterator(self)

    def __repr__(self):
        return (
            f"EventLog(\n    cases = (DataFrame with {len(self.cases)} cases)),\n    "
            f"events = (DataFrame with {len(self.events)} events)),\n    "
            "schema = EventLogSchema(...)\n)"
        )

    @classmethod
    def from_cases(cls, cases: Iterable[Case]):
        """
        Construct an `EventLog` from an iterable of `Case`s.

        Note: this method is inefficient and it should be avoided in favor of operating
        on complete data frames/event logs.
        """
        case_attributes: list[Case] = []
        events: list[pd.DataFrame] = []
        for case in cases:
            case_attributes.append(case.attributes)
            events.append(case.events)
        schema = case.schema
        return EventLog(pd.DataFrame(case_attributes), pd.concat(events), schema)

    def unique_activities(self):
        if self._unique_activities is not None:
            return self._unique_activities
        self._unique_activities = list(
            self.events[self.schema.get_event_column(EventType)].unique()
        )
        return self._unique_activities

    def activity_counts(self) -> Dict[str, int]:
        if self._activity_counts is not None:
            return self._activity_counts
        self._activity_counts = (
            self.events[self.schema.get_event_column(EventType)]
            .value_counts()
            .to_dict()
        )
        return (
            self.events[self.schema.get_event_column(EventType)]
            .value_counts()
            .to_dict()
        )

    def activity_sequences(self):
        cases = self.events[self.schema.get_event_column(CaseID)].to_numpy()
        activities = self.events[self.schema.get_event_column(EventType)].to_numpy()
        _, c_ind, c_counts = np.unique(cases, return_index=True, return_counts=True)
        activity_sequences = []
        for i in range(len(c_ind)):
            si = c_ind[i]
            ei = si + c_counts[i]
            acts = tuple(activities[si:ei])
            activity_sequences.append(acts)
        return activity_sequences

    @property
    def trace_variants(self):
        if self._trace_variants is not None:
            return self._trace_variants
        cases = self.events[self.schema.get_event_column(CaseID)].to_numpy()
        activities = self.events[self.schema.get_event_column(EventType)].to_numpy()

        c_unq, c_ind, c_counts = np.unique(cases, return_index=True, return_counts=True)
        variants = {}

        for i in range(len(c_ind)):
            si = c_ind[i]
            ei = si + c_counts[i]
            acts = tuple(activities[si:ei])
            if acts not in variants:
                variants[acts] = [c_unq[i]]
            else:
                variants[acts].append(c_unq[i])
        self._trace_variants = variants
        return variants

    @property
    def trace_variant_durations(self):
        if self._trace_variant_durations is not None:
            return self._trace_variant_durations
        cases = self.events[self.schema.get_event_column(CaseID)].to_numpy()
        activities = self.events[self.schema.get_event_column(EventType)].to_numpy()
        timestamps = self.events[self.schema.get_event_column(EventTime)].to_numpy()

        c_unq, c_ind, c_counts = np.unique(cases, return_index=True, return_counts=True)
        variants = {}

        for i in range(len(c_ind)):
            si = c_ind[i]
            ei = si + c_counts[i]
            acts = tuple(activities[si:ei])
            if acts not in variants:
                # add duration in seconds
                variants[acts] = [int(timestamps[ei - 1] - timestamps[si])]
            else:
                variants[acts].append(int(timestamps[ei - 1] - timestamps[si]))
        self._trace_variant_durations = variants
        return variants

    def get_inter_activity_duration(self, case_id, a, b):
        this_case = self.events[
            self.events[self.schema.get_event_column(CaseID)] == case_id
        ][self.schema.get_event_column(CaseID)].to_numpy()
        activities = self.events[
            self.events[self.schema.get_event_column(CaseID)] == case_id
        ][self.schema.get_event_column(EventType)].to_numpy()
        timestamps = self.events[
            self.events[self.schema.get_event_column(CaseID)] == case_id
        ][self.schema.get_event_column(EventTime)].to_numpy()
        c_unq, c_ind, c_counts = np.unique(
            this_case, return_index=True, return_counts=True
        )
        if len(c_ind) == 0:
            print(f"Case {case_id} not found. {len(c_ind)}")
            return 0
        si = c_ind[0]
        ei = si + c_counts[0]
        acts = tuple(activities[si:ei])
        # get index of activity a
        a_ind = [i for i, act in enumerate(acts) if act == a]
        # get index of activity b
        b_ind = [i for i, act in enumerate(acts) if act == b]
        # check if both activities are in the trace
        if len(a_ind) > 0 and len(b_ind) > 0:
            # get the first index of activity a
            a_ind = a_ind[0]
            # get the first index of activity b
            b_ind = b_ind[0]
            # check if activity b is after activity a
            if a_ind < b_ind:
                # get duration
                return int(timestamps[si + b_ind] - timestamps[si + a_ind])
            else:
                return int(timestamps[si + a_ind] - timestamps[si + b_ind])

    def activity_pair_durations(self, a, b):
        cases = self.events[self.schema.get_event_column(CaseID)].to_numpy()
        activities = self.events[self.schema.get_event_column(EventType)].to_numpy()
        timestamps = self.events[self.schema.get_event_column(EventTime)].to_numpy()

        c_unq, c_ind, c_counts = np.unique(cases, return_index=True, return_counts=True)
        durations = []

        for i in range(len(c_ind)):
            si = c_ind[i]
            ei = si + c_counts[i]
            acts = tuple(activities[si:ei])
            # get index of activity a
            a_ind = [i for i, act in enumerate(acts) if act == a]
            # get index of activity b
            b_ind = [i for i, act in enumerate(acts) if act == b]
            # check if both activities are in the trace
            if len(a_ind) > 0 and len(b_ind) > 0:
                # get the first index of activity a
                a_ind = a_ind[0]
                # get the first index of activity b
                b_ind = b_ind[0]
                # check if activity b is after activity a
                if a_ind < b_ind:
                    # add duration in seconds
                    durations.append(
                        int(timestamps[si + b_ind] - timestamps[si + a_ind])
                    )
                else:
                    durations.append(
                        int(timestamps[si + a_ind] - timestamps[si + b_ind])
                    )
        return durations

    def get_avg_duration(self) -> float:
        # group events by case id then get the difference between the first and last timestamp of each case, finally get the mean and return it as a float in seconds
        return (
            self.events.groupby(self.schema.get_event_column(CaseID))[
                self.schema.get_event_column(EventTime)
            ]
            .apply(lambda x: x.max() - x.min())
            .mean()
            .total_seconds()
        )


class _EventLogIterator(Iterator):
    def __init__(self, eventlog: EventLog):
        self.eventlog = eventlog
        self.index = 0

    def __next__(self):
        if self.index < len(self.eventlog):
            item = self.eventlog[self.index]
            self.index += 1
            return item
        else:
            raise StopIteration


def split_on_case_attribute(self, attribute: str) -> Dict[str, EventLog]:
    """
    Split the event log on a case attribute.

    Args:
        attribute (str): The case attribute to split on.

    Returns:
        dict[str, EventLog]: A dictionary mapping the unique values of the case attribute
        to the corresponding event logs.
    """
    unique_values = self.cases[attribute].unique()
    split_logs = {}
    for value in unique_values:
        mask = self.cases[attribute] == value
        cases = self.cases[mask]
        case_ids = cases[self.schema.get_case_column(CaseID)].values
        events = self.events.loc[
            self.events[self.schema.get_event_column(CaseID)].isin(case_ids)
        ]
        split_logs[value] = EventLog(
            cases=cases.copy(deep=True),
            events=events.copy(deep=True),
            schema=self.schema,
        )
    return split_logs
