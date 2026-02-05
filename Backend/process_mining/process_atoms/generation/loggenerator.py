import json
import random
from copy import deepcopy

from process_atoms.mine.behavioral_profile import get_behavioral_profile_as_df
from process_atoms.mine.conversion.bpmnjsonanalyzer import parse_model_elements
from process_atoms.mine.conversion.variantgenerator import VariantGenerator


def _insert_event(trace: list, tasks: set):
    if len(trace) <= 1:
        return trace, []
    ins_index = random.randint(0, len(trace))
    task = random.choice(list(tasks))
    trace.insert(ins_index, task)
    return trace, [task]


def _swap_events(trace: list):
    if len(trace) < 2:
        return trace, []
    swap_index = random.randint(0, len(trace) - 2)
    trace2 = trace.copy()
    trace2[swap_index], trace2[swap_index + 1] = (
        trace2[swap_index + 1],
        trace2[swap_index],
    )
    return trace2, [trace2[swap_index], trace2[swap_index + 1]]


def _remove_event(trace: list):
    if len(trace) <= 1:
        return trace, []
    del_index = random.randint(0, len(trace) - 1)
    trace2 = list()
    deleted_event = None
    for i in range(0, len(trace)):
        if i != del_index:
            trace2.append(trace[i])
        else:
            deleted_event = trace[i]
    return trace2, [deleted_event]


def _get_event_classes(log):
    classes = set()
    for trace in log:
        for task in trace:
            classes.add(task)
    return classes


def is_missing(affected, trace, strict_order, reverse_strict_order, interleaving):
    res = False
    if affected[0] in trace:
        return False
    for trace_activity in trace:
        if (
            (trace_activity, affected[0]) in strict_order
            or (trace_activity, affected[0]) in reverse_strict_order
            or (trace_activity, affected[0]) in interleaving
        ):
            res = True
    return res


def is_superfluous(affected, trace, exclusive):
    res = False
    if affected[0] not in trace:
        return False
    for trace_activity in trace:
        if (trace_activity, affected[0]) in exclusive:
            res = True
    return res


def is_out_of_order(affected, trace, strict_order):
    if affected[0] not in trace or affected[1] not in trace:
        return False
    res = len(affected) > 1 and (affected[1], affected[0]) in strict_order
    return res


def is_true_anomaly(
    anomaly_type,
    affected,
    trace,
    strict_order,
    reverse_strict_order,
    exclusive,
    interleaving,
):
    if anomaly_type == 0:
        # if event2 never follows event1 in the original model, it is a true order anomaly
        return is_out_of_order(affected, trace, strict_order)
    if anomaly_type == 1:
        # if event1 excludes any each other event in the original model, it is a true superfluous anomaly
        return is_superfluous(affected, trace, exclusive)
    if anomaly_type == 2:
        # if event1 interleaves with any event in the trace or is in strict order relation in the original model, it is a true missing anomaly
        return is_missing(
            affected, trace, strict_order, reverse_strict_order, interleaving
        )
    return False


def check_and_add_anomaly(
    trace,
    affected,
    trace_idx_to_noise,
    idx,
    noise_type,
    strict_order,
    reverse_strict_order,
    exclusive,
    interleaving,
):
    if len(affected) >= 1 and is_true_anomaly(
        noise_type,
        affected,
        trace,
        strict_order,
        reverse_strict_order,
        exclusive,
        interleaving,
    ):
        trace_idx_to_noise[idx].append((noise_type, affected))
        # if an activity was added we need to check for out of order anomalies as well
        if noise_type == 1:
            indices = [i for i, x in enumerate(trace) if x == affected[0]]
            for i in indices:
                for j in range(i + 1, len(trace) - 1):
                    check_and_add_anomaly(
                        trace,
                        [trace[i], trace[j]],
                        trace_idx_to_noise,
                        idx,
                        0,
                        strict_order,
                        reverse_strict_order,
                        exclusive,
                        interleaving,
                    )
                for j in range(i - 1, 0, -1):
                    check_and_add_anomaly(
                        trace,
                        [trace[j], trace[i]],
                        trace_idx_to_noise,
                        idx,
                        0,
                        strict_order,
                        reverse_strict_order,
                        exclusive,
                        interleaving,
                    )

        # check if the other anomalies still hold for this trace after the noise was inserted
        for anomaly in trace_idx_to_noise[idx]:
            if not is_true_anomaly(
                anomaly[0],
                anomaly[1],
                trace,
                strict_order,
                reverse_strict_order,
                exclusive,
                interleaving,
            ):
                trace_idx_to_noise[idx].remove(anomaly)


def insert_noise(log: list[list[dict[str, str]]], noisy_trace_prob, min_log_size=10):
    activity_sequences = [[event["concept:name"] for event in trace] for trace in log]
    if len(activity_sequences) == 0:
        return dict(), dict()
    (
        strict_order,
        reverse_strict_order,
        exclusive,
        interleaving,
    ) = get_behavioral_profile_as_df(activity_sequences)
    if len(activity_sequences) < min_log_size:
        # add additional traces until desired log size reached
        activity_sequences_cpy = deepcopy(activity_sequences)
        for i in range(0, min_log_size):
            activity_sequences_cpy.append(
                deepcopy(activity_sequences[i % len(activity_sequences)])
            )
            if len(activity_sequences_cpy) >= min_log_size:
                break
        activity_sequences = activity_sequences_cpy
    else:
        activity_sequences = deepcopy(activity_sequences)
    classes = _get_event_classes(activity_sequences)
    activity_sequences_new = dict()
    trace_idx_to_noise = dict()
    for idx, trace in enumerate(activity_sequences):
        trace_idx_to_noise[idx] = []
        if len(trace) > 1:
            trace_cpy = trace.copy()
            # check if trace makes random selection
            if random.random() <= noisy_trace_prob:
                insert_more_noise = True
                while insert_more_noise:
                    # randomly select which kind of noise to insert
                    noise_type = random.randint(0, 2)
                    if noise_type == 0:
                        trace_cpy, affected = _swap_events(trace_cpy)
                        for i in range(len(trace_cpy) - 1):
                            for j in range(i + 1, len(trace_cpy)):
                                if trace_cpy[i] != trace_cpy[j]:
                                    check_and_add_anomaly(
                                        trace_cpy,
                                        [trace_cpy[i], trace_cpy[j]],
                                        trace_idx_to_noise,
                                        idx,
                                        noise_type,
                                        strict_order,
                                        reverse_strict_order,
                                        exclusive,
                                        interleaving,
                                    )
                    elif noise_type == 1:
                        trace_cpy, affected = _insert_event(trace_cpy, classes)
                        check_and_add_anomaly(
                            trace_cpy,
                            affected,
                            trace_idx_to_noise,
                            idx,
                            noise_type,
                            strict_order,
                            reverse_strict_order,
                            exclusive,
                            interleaving,
                        )
                    elif noise_type == 2:
                        trace_cpy, affected = _remove_event(trace_cpy)
                        check_and_add_anomaly(
                            trace_cpy,
                            affected,
                            trace_idx_to_noise,
                            idx,
                            noise_type,
                            strict_order,
                            reverse_strict_order,
                            exclusive,
                            interleaving,
                        )
                    insert_more_noise = random.random() <= noisy_trace_prob
            if len(trace_cpy) > 1:
                activity_sequences_new[idx] = trace_cpy
    return activity_sequences_new, trace_idx_to_noise


class LogGenerator:
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

    def generate_noisy_log(self, noisy_trace_prob, min_log_size=10):
        variants_log = self.variant_generator.extract_variants(as_simple_log=True)
        return insert_noise(variants_log, noisy_trace_prob, min_log_size)[0]
