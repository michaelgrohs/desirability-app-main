from typing import Annotated, Literal, Union

import numpy as np
import pandas as pd
import sklearn
from pydantic import BaseModel, Field
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelBinarizer, OneHotEncoder, StandardScaler


class _ColumnType(BaseModel):
    type: Literal["abstractcolumntype"] = Field("abstractcolumntype", repr=False)
    # Whether the attribute has a special meaning, e.g. the case ID
    special: bool = Field(False, repr=False)

    """
    A column type defines what kinds of data a table column contains. For examples, see
    `Categorical` or `Continuous`. A `_ColumnType` defines methods that allow
    validating and transforming the corresponding event log data so that models can be
    trained.
    """

    @classmethod
    def from_series(cls, series: pd.Series):
        """
        If the column type needs information from the actual column data, it can access
        it here as a `pd.Series`.

        As an example, `Categorical` uses this method to find all the categories for
        categorical columns.
        """
        return cls()

    def is_valid(self, series: pd.Series) -> np.ndarray:
        """
        Return a boolean array of the same length as the column data `series` that
        indicates whether each entry is a valid instance of this column type.

        If not implemented, return an all-true array.
        """
        return np.ones_like(series.values, dtype=np.bool_)

    def sklearn_preprocessor(self) -> sklearn.base.BaseEstimator:
        """
        Return a `sklearn.Preprocessor` that can be used to encode data of this column
        type.
        """
        raise NotImplementedError(type(self).__name__)

    def trainable(self) -> bool:
        return True


class Categorical(_ColumnType):
    type: Literal["categorical"] = Field("categorical", repr=False)
    categories: list

    # Preprocessing: if a class makes up less than this fraction of samples, put it into
    # the "infrequent" category
    min_frequency: float = 0.03

    @classmethod
    def from_series(cls, series: pd.Series):
        return cls(categories=series.unique().tolist())

    def is_valid(self, series: pd.Series):
        return series.isin(set(self.categories))

    def sklearn_preprocessor(self):
        return OneHotEncoder(
            categories=[self.categories],
            min_frequency=self.min_frequency,
            handle_unknown="infrequent_if_exist",
        )


class Continuous(_ColumnType):
    type: Literal["continuous"] = Field("continuous", repr=False)

    def sklearn_preprocessor(self):
        return Pipeline(
            [
                # TODO: experiment with different imputation strategies
                ("imputer", SimpleImputer(strategy="constant", fill_value=0.0)),
                ("scaler", StandardScaler()),
            ]
        )


class Timestamp(_ColumnType):
    type: Literal["timestamp"] = Field("timestamp", repr=False)

    def trainable(self) -> bool:
        return False


class CaseID(_ColumnType):
    type: Literal["caseid"] = Field("caseid", repr=False)
    special: bool = Field(True, repr=False)

    def trainable(self) -> bool:
        return False


class EventID(_ColumnType):
    type: Literal["eventid"] = Field("eventid", repr=False)
    special: bool = Field(True, repr=False)


class EventType(Categorical):
    type: Literal["eventtype"] = Field("eventtype", repr=False)
    special: bool = Field(True, repr=False)


class EventTime(Timestamp):
    type: Literal["eventtime"] = Field("eventtime", repr=False)
    special: bool = Field(True, repr=False)


class CategoricalTarget(Categorical):
    type: Literal["categoricaltarget"] = Field("categoricaltarget", repr=False)
    categories: list

    def is_valid(self, series: pd.Series):
        return series.isin(set(self.categories))

    def sklearn_preprocessor(self):
        return LabelBinarizer()


def _subclasses(cls):
    return set(cls.__subclasses__()).union(
        [s for c in cls.__subclasses__() for s in _subclasses(c)]
    )


ColumnType = Annotated[
    Union[tuple(_subclasses(_ColumnType))], Field(discriminator="type")
]

ColumnTypeName = Literal[
    "caseid",
    "categorical",
    "continuous",
    "timestamp",
    "eventtype",
    "eventid",
    "eventtime",
    "categoricaltarget",
]

COLUMN_TYPES = {
    "caseid": CaseID,
    "categorical": Categorical,
    "continuous": Continuous,
    "timestamp": Timestamp,
    "eventtype": EventType,
    "eventid": EventID,
    "eventtime": EventTime,
    "categoricaltarget": CategoricalTarget,
}
