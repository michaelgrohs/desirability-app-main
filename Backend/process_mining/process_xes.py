import pm4py
import os
import pandas as pd
from pm4py.objects.conversion.log import converter as log_converter

def parse_xes(xes_path):
    """Parses XES event log file into a process model."""
    filename, file_extension = os.path.splitext(xes_path)
    try:
        if file_extension == '.csv':
            log_csv = pd.read_csv(xes_path, sep=None, encoding='utf-8-sig')
            log = log_converter.apply(log_csv)

        elif file_extension == '.xes':
            log = pm4py.read_xes(xes_path)

        # Discover a Petri net from the event log (you can use alpha, inductive, etc.)
        net, initial_marking, final_marking = pm4py.discover_petri_net_inductive(log)

        return {
            "transitions": len(net.transitions),
            "places": len(net.places),
            "description": "XES event log processed successfully"
        }

    except Exception as e:
        return {"error": str(e)}

