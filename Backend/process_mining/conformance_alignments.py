import os
import pandas as pd
from pm4py.objects.conversion.log import converter as log_converter
import pm4py
import xml.etree.ElementTree as ET
from pm4py.objects.log.importer.xes import importer as xes_importer
from pm4py.algo.conformance.alignments.petri_net import algorithm as alignments
from collections import defaultdict


def calculate_alignments(bpmn_path: str, log):
    if not os.path.exists(bpmn_path):
        raise FileNotFoundError(f"BPMN file not found: {bpmn_path}")

    bpmn_model = pm4py.read_bpmn(bpmn_path)
    net, initial_marking, final_marking = pm4py.convert.convert_to_petri_net(bpmn_model)

    aligned_traces = alignments.apply_log(log, net, initial_marking, final_marking)

    return aligned_traces

def get_fitness_per_trace(aligned_traces):
    fitness_data = []
    for i, alignment in enumerate(aligned_traces):
        fitness = round(alignment.get("fitness", 0), 4)
        fitness_data.append({
            "trace": f"Trace {i + 1}",
            "conformance": fitness
        })
    return fitness_data

def get_conformance_bins(fitness_data):
    bins = [ { "averageConformance": 0, "traceCount": 0 } for _ in range(10) ]

    for item in fitness_data:
        conformance = item["conformance"]
        index = min(int(conformance * 10), 9)
        bins[index]["averageConformance"] += conformance
        bins[index]["traceCount"] += 1

    for bin in bins:
        if bin["traceCount"] > 0:
            bin["averageConformance"] /= bin["traceCount"]

    return bins

def get_visible_end_activities(net, final_marking):
    end_activities = set()

    def backtrack(place, visited):
        """Recursive search backwards from a place until we find visible transitions."""
        if place in visited:
            return
        visited.add(place)

        for arc in place.in_arcs:
            t = arc.source
            if t.label:  # visible
                end_activities.add(t.label)
            else:  # invisible
                for p2 in t.in_arcs:
                    backtrack(p2.source, visited)

    # Start from final places
    for place in final_marking:
        backtrack(place, set())

    return end_activities

def get_all_activities_from_bpmn(bpmn_path):
    tree = ET.parse(bpmn_path)
    root = tree.getroot()
    ns = {'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL'}

    activities = []
    for task in root.findall(".//bpmn:task", ns):
        if "name" in task.attrib:
            activities.append(task.attrib["name"])
    return sorted(set(activities))

def extract_desired_outcomes_from_bpmn(bpmn_path,
    user_activity=None,
    condition=None
):
    """
    Returns a list of desired outcomes.
    If user_activity and condition are provided, use them.
    Otherwise, fallback to default BPMN end-event logic.
    """
    if user_activity and condition:
        return []
    bpmn_model = pm4py.read_bpmn(bpmn_path)
    net, im, fm = pm4py.convert.convert_to_petri_net(bpmn_model)

    tree = ET.parse(bpmn_path)
    root = tree.getroot()
    ns = {'bpmn': 'http://www.omg.org/spec/BPMN/20100524/MODEL'}

    end_events = root.findall(".//bpmn:endEvent", ns)
    desired_outcomes = []

    for event in end_events:
        has_error_definition = event.find("bpmn:errorEventDefinition", ns) is not None
        if not has_error_definition:
            incoming = event.find("bpmn:incoming", ns)
            if incoming is not None:
                incoming_flow = incoming.text
                seq_flows = root.findall(".//bpmn:sequenceFlow", ns)
                for flow in seq_flows:
                    if flow.get("id") == incoming_flow:
                        source_ref = flow.get("sourceRef")
                        task = root.find(f".//bpmn:task[@id='{source_ref}']", ns)
                        if task is not None and "name" in task.attrib:
                            desired_outcomes.append(task.attrib["name"])
    if desired_outcomes!=[]:
        return list(set(desired_outcomes))
    else:
        ends = get_visible_end_activities(net, fm)
        return list(ends)

def get_outcome_distribution(bpmn_path, log, aligned_traces,
                             matching_mode=None, selected_activities=None):
    """
    If selected_activities is provided (non-empty), use that with matching_mode:
      - matching_mode == "contains" -> trace contains any selected activity
      - matching_mode == "end" or None -> trace ends with a selected activity
    Otherwise fallback to extract_desired_outcomes_from_bpmn(bpmn_path) (your original behavior).
    """

    # normalize inputs
    selected_activities = selected_activities or []



    # Decide desired_outcomes list (for UI/display) and how to determine "correct" per trace
    if selected_activities:
        # user-defined mode: the desiredOutcomes list is what the user selected
        desired_outcomes = list(selected_activities)
        user_mode = True
    else:
        # fallback mode: extract from BPMN like before
        desired_outcomes = extract_desired_outcomes_from_bpmn(bpmn_path)
        user_mode = False
        # matching_mode is irrelevant in fallback; we keep previous behavior (ending activity)
        if not matching_mode:
            matching_mode = "end"

    # prepare bins (same as before)
    bins = [
        {"range": [i / 10, (i + 1) / 10], "traceCount": 0, "correctCount": 0}
        for i in range(10)
    ]

    for i, alignment in enumerate(aligned_traces):
        fitness = alignment.get("fitness", 0)
        trace = log[i] if i < len(log) else None

        if not trace:
            continue

        # extract sequence of activity names for this trace
        activities_in_trace = [ev.get('concept:name') for ev in trace if 'concept:name' in ev]
        last_activity = activities_in_trace[-1] if activities_in_trace else None

        bin_index = min(int(fitness * 10), 9)
        bins[bin_index]["traceCount"] += 1

        # determine correctness based on mode:
        is_correct = False
        if user_mode:
            if matching_mode == "contains":
                # any selected activity appears in the trace
                is_correct = any(act in activities_in_trace for act in desired_outcomes)
            else:  # default treat as 'end'
                is_correct = (last_activity is not None and last_activity in desired_outcomes)
        else:
            # fallback: desired_outcomes came from BPMN default method (end activities)
            # preserve your original behavior (trace ends in one of desired_outcomes)
            is_correct = (last_activity is not None and last_activity in desired_outcomes)

        if is_correct:
            bins[bin_index]["correctCount"] += 1

    # finalize bins: compute percentages and remove correctCount
    for b in bins:
        if b["traceCount"] > 0:
            b["percentageEndingCorrectly"] = round((b["correctCount"] / b["traceCount"]) * 100, 2)
        else:
            b["percentageEndingCorrectly"] = 0.0
        del b["correctCount"]

    if matching_mode==None:
        matching_mode=''
    # Return the same shape the frontend expects
    return {
        "desiredOutcomes": desired_outcomes,
        "bins": bins,
        "matching_mode": matching_mode
    }

def get_unique_sequences_per_bin(log, aligned_traces):


    bins = [set() for _ in range(10)]

    for i, trace in enumerate(log):
        fitness = aligned_traces[i].get("fitness", 0)
        bin_index = min(int(fitness * 10), 9)
        sequence = tuple(event["concept:name"] for event in trace if "concept:name" in event)
        bins[bin_index].add(sequence)

    return [
        {
            "bin": i,
            "uniqueSequences": len(bins[i]),
            "sequences": [list(seq) for seq in bins[i]]  # Convert tuple to list for JSON serialization
        }
        for i in range(10)
    ]


def get_conformance_by_event_attribute(log, aligned_traces):


    # Get all attributes from events
    event_attributes = pm4py.get_event_attributes(log)
    trace_attributes = pm4py.get_trace_attributes(log)
    event_attributes.remove('time:timestamp')
    event_attributes.remove('concept:name')
    print(event_attributes)


    # Dictionary to hold: {attribute: {value: [fitness_scores]}}
    attribute_conformance = defaultdict(lambda: defaultdict(list))

    for i, trace in enumerate(log):
        fitness = aligned_traces[i].get("fitness", 0)

        # ----- EVENT ATTRIBUTE PROCESSING -----
        seen_event_values = defaultdict(set)
        for event in trace:
            for attr in event_attributes:
                if attr in event:
                    seen_event_values[attr].add(event[attr])

        for attr, values in seen_event_values.items():
            for value in values:
                if value is not None:
                    attribute_conformance[f"event:{attr}"][value].append(fitness)

        # ----- TRACE ATTRIBUTE PROCESSING -----
        for attr in trace_attributes:
            if attr in trace.attributes:
                value = trace.attributes[attr]
                if value is not None:
                    attribute_conformance[f"trace:{attr}"][value].append(fitness)

    # Structure the results per attribute
    result = {}
    for attr, value_dict in attribute_conformance.items():
        result[attr] = []
        for value, scores in value_dict.items():
            avg_conformance = sum(scores) / len(scores)
            result[attr].append({
                "value": value,
                "averageConformance": round(avg_conformance, 4),
                "traceCount": len(scores)
            })

    return result

def get_conformance_by_role(log, aligned_traces):


    role_conformance = defaultdict(list)

    for i, trace in enumerate(log):
        fitness = aligned_traces[i].get("fitness", 0)
        roles_in_trace = {event.get("org:role") for event in trace if "org:role" in event}

        for role in roles_in_trace:
            if role:  # Avoid None
                role_conformance[role].append(fitness)

    result = []
    for role, scores in role_conformance.items():
        avg_conformance = sum(scores) / len(scores)
        result.append({
            "role": role,
            "averageConformance": round(avg_conformance, 4),
            "traceCount": len(scores)
        })

    return result

def get_requested_amount_vs_conformance(log, aligned_traces):

    result = []

    for i, trace in enumerate(log):
        trace_attrs = trace.attributes

        # Try both "RequestedAmount" and "Amount" as keys
        requested_amount = (
            trace_attrs.get("RequestedAmount") or
            trace_attrs.get("Amount")
        )

        # If neither exists, skip this trace
        if requested_amount is None:
            continue

        try:
            fitness = aligned_traces[i].get("fitness", 0)
            result.append({
                "conformance": round(fitness, 4),
                "requested_amount": float(requested_amount)
            })
        except Exception as e:
            print(f"Error processing trace {i}: {e}")
            continue

    return result

def get_conformance_by_resource(xes_log, aligned_traces):
    resource_conformance = defaultdict(list)

    for i, trace in enumerate(xes_log):
        fitness = aligned_traces[i].get("fitness", 0)
        for event in trace:
            resource = event.get("org:resource")
            if resource:
                resource_conformance[resource].append(fitness)

    result = []
    for resource, fitness_values in resource_conformance.items():
        avg_fitness = sum(fitness_values) / len(fitness_values)
        result.append({
            "resource": resource,
            "avg_conformance": round(avg_fitness, 4),
            "traceCount": len(fitness_values)  # ✅ fix
        })

    return result
def get_trace_sequences(log):
    result = []

    for i, trace in enumerate(log):
        sequence = [event["concept:name"] for event in trace if "concept:name" in event]
        result.append({
            "trace": f"Trace {i + 1}",
            "sequence": sequence
        })

    return result

