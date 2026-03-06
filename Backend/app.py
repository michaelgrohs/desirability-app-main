# app.py
import multiprocessing
try:
    multiprocessing.set_start_method('fork', force=True)
except RuntimeError:
    pass

import platform
import sys
print("PYTHON EXECUTABLE:", sys.executable)
print("ARCH:", platform.machine())

import networkx
print("networkx version:", networkx.__version__)

print(">>> BEFORE pm4py import")
import pm4py
print(">>> AFTER pm4py import")

print(">>> BEFORE dowhy import")
from dowhy import CausalModel
print(">>> AFTER dowhy import")

import json
import numpy as np
import pm4py

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask import send_from_directory
import os
import pandas as pd
from pm4py.objects.conversion.log import converter as log_converter

from process_mining.process_bpmn import parse_bpmn
from process_mining.process_xes import parse_xes
from process_mining.conformance_alignments import (
    calculate_alignments,
    get_fitness_per_trace,
    get_conformance_bins,
    get_outcome_distribution,
    get_conformance_by_role,
    get_conformance_by_event_attribute,
    get_unique_sequences_per_bin,
    get_requested_amount_vs_conformance,
    get_conformance_by_resource,
    get_trace_sequences,
    get_all_activities_from_bpmn,
    get_all_activities_from_model,
    build_trace_deviation_matrix_df
)

from process_mining.activity_deviations import get_activity_deviations
from pm4py.objects.log.importer.xes import importer as xes_importer


import traceback
from sklearn.tree import DecisionTreeClassifier, _tree

app = Flask(__name__)
CORS(app, supports_credentials=True)


def _layout_bpmn(bpmn_graph, h_spacing=220, v_spacing=130, node_w=120, node_h=60, event_size=36, gw_size=50):
    """Assign a simple left-to-right layered layout so bpmn-js can render it."""
    from collections import defaultdict, deque
    from pm4py.objects.bpmn.obj import BPMN

    nodes = list(bpmn_graph.get_nodes())
    flows = list(bpmn_graph.get_flows())
    if not nodes:
        return

    out_map = defaultdict(list)
    in_map = defaultdict(list)
    for f in flows:
        out_map[f.get_source()].append(f.get_target())
        in_map[f.get_target()].append(f.get_source())

    sources = [n for n in nodes if not in_map[n]]
    if not sources:
        sources = [nodes[0]]

    # BFS layering — visited set prevents infinite loops on cyclic BPMN graphs
    layer = {}
    visited = set()
    queue = deque()
    for s in sources:
        layer[s] = 0
        queue.append(s)
        visited.add(s)
    while queue:
        n = queue.popleft()
        for m in out_map[n]:
            if m not in visited:
                visited.add(m)
                layer[m] = layer[n] + 1
                queue.append(m)
    for n in nodes:
        if n not in layer:
            layer[n] = 0

    layer_nodes = defaultdict(list)
    for n, l in layer.items():
        layer_nodes[l].append(n)

    ly = bpmn_graph.get_layout()

    for l, lnodes in layer_nodes.items():
        count = len(lnodes)
        for i, n in enumerate(lnodes):
            nl = ly.get(n)
            if isinstance(n, (BPMN.StartEvent, BPMN.EndEvent,
                               BPMN.IntermediateCatchEvent, BPMN.IntermediateThrowEvent)):
                w, h = event_size, event_size
            elif isinstance(n, (BPMN.ExclusiveGateway, BPMN.ParallelGateway,
                                 BPMN.InclusiveGateway, BPMN.EventBasedGateway)):
                w, h = gw_size, gw_size
            else:
                w, h = node_w, node_h
            nl.set_x(l * h_spacing)
            nl.set_y(i * v_spacing - (count - 1) * v_spacing / 2 + 300)
            nl.set_width(w)
            nl.set_height(h)

    for f in flows:
        src_l = ly.get(f.get_source())
        tgt_l = ly.get(f.get_target())
        sx = src_l.get_x() + src_l.get_width()
        sy = src_l.get_y() + src_l.get_height() / 2
        tx = tgt_l.get_x()
        ty = tgt_l.get_y() + tgt_l.get_height() / 2
        el = ly.get(f)
        el.del_waypoints()
        el.add_waypoint((sx, sy))
        el.add_waypoint((tx, ty))

@app.errorhandler(Exception)
def handle_exception(e):
    tb = traceback.format_exc()
    print(tb)
    return jsonify({"error": str(e), "traceback": tb}), 500

UPLOAD_FOLDER = 'uploads'
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Store the filenames of the last uploaded files
last_uploaded_files = {
    "bpmn": None,
    "xes": None
}

last_uploaded_data = {
    "bpmn_path": None,
    "xes_path": None,
    "decl_path": None,
    "bpmn_model": None,
    "xes_log": None,
    "alignments": None,
    "deviation_matrix": None,
    "deviation_labels": None,
    "impact_matrix": None,
    "mode": "bpmn",
    "atoms": None,
    "atoms_df": None,
    "event_log_pa": None,
    "decl_constraint_info": None,
    "alignment_status": "idle",  # 'idle' | 'computing' | 'ready' | 'error'
    "alignment_error": None,
}

def reset_cache():
    last_uploaded_data["bpmn_model"] = None
    last_uploaded_data["xes_log"] = None
    last_uploaded_data["alignments"] = None
    last_uploaded_data["deviation_matrix"] = None
    last_uploaded_data["impact_matrix"] = None
    last_uploaded_data["mode"] = "bpmn"
    last_uploaded_data["atoms"] = None
    last_uploaded_data["atoms_df"] = None
    last_uploaded_data["event_log_pa"] = None
    last_uploaded_data["decl_path"] = None
    last_uploaded_data["decl_constraint_info"] = None
    last_uploaded_data["alignment_status"] = "idle"
    last_uploaded_data["alignment_error"] = None

def validate_xes_log(xes_log):
    """
    Check that the parsed pm4py EventLog has the required fields.
    Returns a list of human-readable error strings (empty = valid).
    Checks all traces/events (short-circuits after first failure per field).
    """
    errors = []
    missing_case_id = []
    missing_concept = []
    missing_timestamp = []

    for i, trace in enumerate(xes_log):
        if 'concept:name' not in trace.attributes:
            missing_case_id.append(i)
        for j, event in enumerate(trace):
            if 'concept:name' not in event:
                missing_concept.append((i, j))
            if 'time:timestamp' not in event:
                missing_timestamp.append((i, j))

    if missing_case_id:
        sample = missing_case_id[:3]
        errors.append(
            f"Missing 'case:concept:name' on {len(missing_case_id)} trace(s) "
            f"(e.g. trace indices {sample}). Every trace must have a case ID."
        )
    if missing_concept:
        sample = missing_concept[:3]
        errors.append(
            f"Missing 'concept:name' on {len(missing_concept)} event(s) "
            f"(e.g. {sample}). Every event must have an activity name."
        )
    if missing_timestamp:
        sample = missing_timestamp[:3]
        errors.append(
            f"Missing 'time:timestamp' on {len(missing_timestamp)} event(s) "
            f"(e.g. {sample}). Every event must have a timestamp."
        )
    return errors


@app.route("/api/reset", methods=["POST"])
def api_reset():
    reset_cache()
    return jsonify({"message": "Cache reset successfully"})


@app.route("/health", methods=["GET"])
def health_check():
    return jsonify({"status": "ok"}), 200


@app.route('/upload', methods=['POST'])
def upload_files():
    print("\n==== UPLOAD CALLED ====")
    print("Request files:", request.files)
    print("Request form:", request.form)

    # Save files
    bpmn_file = request.files['bpmn']
    xes_file = request.files['xes']

    print("BPMN file:", bpmn_file)
    print("XES file:", xes_file)

    if not bpmn_file or not xes_file:
        return jsonify({"error": "Missing process model or event log file"}), 400

    if xes_file.filename == '':
        return jsonify({"error": "Empty XES filename"}), 400

    upload_folder = "uploads"
    os.makedirs(upload_folder, exist_ok=True)

    xes_path = os.path.join(upload_folder, xes_file.filename)
    bpmn_path = os.path.join(upload_folder, bpmn_file.filename)

    xes_file.save(xes_path)
    bpmn_file.save(bpmn_path)

    print("Saved XES to:", xes_path)
    print("Saved BPMN to:", bpmn_path)


    # Store paths and clear any previously cached results from prior uploads
    last_uploaded_data['bpmn_path'] = bpmn_path
    last_uploaded_data['xes_path'] = xes_path
    last_uploaded_data['deviation_matrix'] = None
    last_uploaded_data['impact_matrix'] = None
    last_uploaded_data['atoms'] = None
    last_uploaded_data['atoms_df'] = None
    last_uploaded_data['event_log_pa'] = None

    # Parse BPMN
    bpmn_model = parse_bpmn(bpmn_path)
    last_uploaded_data['bpmn_model'] = bpmn_model

    # Parse XES or CSV
    filename, file_extension = os.path.splitext(xes_path)
    print(file_extension)
    if file_extension == '.csv':
        log_csv = pd.read_csv(xes_path, encoding='utf-8-sig')
        log_csv['time:timestamp'] = pd.to_datetime(log_csv['time:timestamp'], utc=True)
        xes_log = log_converter.apply(log_csv)
    elif file_extension == '.xes':
        xes_log = xes_importer.apply(xes_path)
    else:
        return jsonify({"error": "Unsupported log format"}), 400

    xes_errors = validate_xes_log(xes_log)
    if xes_errors:
        return jsonify({"error": "Invalid XES log:\n" + "\n".join(xes_errors)}), 400

    last_uploaded_data['xes_log'] = xes_log

    alignments = calculate_alignments(bpmn_path, xes_log)
    last_uploaded_data['alignments'] = alignments
    last_uploaded_data['mode'] = 'bpmn'

    print("Alignments computed successfully")

    return jsonify({
        "message": "Files uploaded and alignments computed",
        "alignment_count": len(alignments)
    })


def _compute_alignments_background():
    """Run alignment computation in a background thread (called after mining is done)."""
    last_uploaded_data['alignment_status'] = 'computing'
    last_uploaded_data['alignment_error'] = None
    try:
        log = get_cached_xes_log()
        aligned_traces = calculate_alignments(
            last_uploaded_data['bpmn_path'], log
        )
        last_uploaded_data['alignments'] = aligned_traces
        last_uploaded_data['alignment_status'] = 'ready'
        print(f"Background alignments done: {len(aligned_traces)} traces")
    except Exception as e:
        last_uploaded_data['alignment_status'] = 'error'
        last_uploaded_data['alignment_error'] = str(e)
        print(f"Background alignment error: {e}")


def _mine_and_align_background(algorithm, noise_threshold, xes_path, upload_folder, log_stem):
    """Mine process model via subprocess (avoids fork-in-thread deadlock on macOS), then compute alignments."""
    import subprocess
    try:
        print(f"[bg] Mining model with algorithm={algorithm}, noise_threshold={noise_threshold}", flush=True)
        bpmn_path = os.path.join(upload_folder, f'{log_stem}_{algorithm}.bpmn')
        # Use abspath so the path is correct regardless of CWD
        worker_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'process_mining', 'mine_worker.py')
        args_json = json.dumps({
            'algorithm': algorithm,
            'noise_threshold': noise_threshold,
            'xes_path': os.path.abspath(xes_path),
            'bpmn_path': os.path.abspath(bpmn_path),
        })
        # Inherit parent stdout/stderr — no pipes, no deadlocks, output visible in Flask console
        proc = subprocess.Popen(
            [sys.executable, worker_script, args_json],
            stdin=subprocess.DEVNULL,
        )
        returncode = proc.wait(timeout=600)
        if returncode != 0:
            raise RuntimeError(f'Mining subprocess exited with code {returncode}')

        last_uploaded_data['bpmn_path'] = bpmn_path
        print(f"[bg] Mining done, starting alignments", flush=True)
        _compute_alignments_background()
    except Exception as e:
        last_uploaded_data['alignment_status'] = 'error'
        last_uploaded_data['alignment_error'] = str(e)
        print(f"[bg] Mining error: {e}", flush=True)


@app.route('/api/alignment-status', methods=['GET'])
def alignment_status_route():
    return jsonify({
        "status": last_uploaded_data.get('alignment_status', 'idle'),
        "error": last_uploaded_data.get('alignment_error'),
    })


@app.route('/upload-mine-model', methods=['POST'])
def upload_mine_model():
    """Mine a process model from the event log and compute trace alignments."""
    xes_file = request.files.get('xes')
    if not xes_file:
        return jsonify({"error": "Missing event log file"}), 400

    algorithm = request.form.get('algorithm', 'inductive_infrequent')
    noise_threshold = float(request.form.get('noise_threshold', '0.2'))

    upload_folder = 'uploads'
    os.makedirs(upload_folder, exist_ok=True)

    raw_name = os.path.basename(xes_file.filename)
    log_stem = raw_name.split('.')[0].replace(' ', '_')

    xes_path = os.path.join(upload_folder, xes_file.filename)
    xes_file.save(xes_path)

    # Parse XES / CSV / GZ
    _, ext = os.path.splitext(xes_path)
    if ext == '.csv':
        log_csv = pd.read_csv(xes_path, encoding='utf-8-sig')
        log_csv['time:timestamp'] = pd.to_datetime(log_csv['time:timestamp'], utc=True)
        xes_log = log_converter.apply(log_csv)
    elif ext in ('.xes', '.gz'):
        xes_log = xes_importer.apply(xes_path)
    else:
        return jsonify({"error": f"Unsupported log format: {ext}"}), 400

    xes_errors = validate_xes_log(xes_log)
    if xes_errors:
        return jsonify({"error": "Invalid XES log:\n" + "\n".join(xes_errors)}), 400

    # Store everything except bpmn_path (not known yet — mining is background)
    last_uploaded_data['bpmn_path'] = None
    last_uploaded_data['xes_path'] = xes_path
    last_uploaded_data['xes_log'] = xes_log
    last_uploaded_data['bpmn_model'] = None
    last_uploaded_data['deviation_matrix'] = None
    last_uploaded_data['impact_matrix'] = None
    last_uploaded_data['alignments'] = None
    last_uploaded_data['atoms'] = None
    last_uploaded_data['atoms_df'] = None
    last_uploaded_data['event_log_pa'] = None
    last_uploaded_data['mode'] = 'bpmn'
    last_uploaded_data['alignment_status'] = 'mining'
    last_uploaded_data['alignment_error'] = None

    import threading
    t = threading.Thread(
        target=_mine_and_align_background,
        args=(algorithm, noise_threshold, xes_path, upload_folder, log_stem),
        daemon=True,
    )
    t.start()

    return jsonify({
        "message": f"Mining started ({algorithm})",
        "algorithm": algorithm,
    })


@app.route('/api/available-templates', methods=['GET'])
def available_templates():
    from process_mining.process_atoms.mine.declare.enums.mp_constants import Template
    templates = [t.templ_str for t in Template if t.is_binary]
    return jsonify({"templates": templates})


@app.route('/upload-declarative', methods=['POST'])
def upload_declarative():
    from process_mining.process_atoms.processatoms import ProcessAtoms
    from process_mining.process_atoms.mine.declare.regexchecker import RegexChecker
    from process_mining.process_atoms.models.event_log import EventLog, EventLogSchemaTypes
    from process_mining.process_atoms.models.column_types import (
        CaseID, Categorical, EventType, EventTime, Continuous,
    )

    print("\n==== UPLOAD DECLARATIVE CALLED ====")

    xes_file = request.files.get('xes')
    if not xes_file or xes_file.filename == '':
        return jsonify({"error": "Missing event log file"}), 400

    templates_json = request.form.get('templates', '[]')
    min_support_str = request.form.get('min_support', '0.1')

    considered_templates = json.loads(templates_json)
    min_support = float(min_support_str)

    upload_folder = "uploads"
    os.makedirs(upload_folder, exist_ok=True)
    xes_path = os.path.join(upload_folder, xes_file.filename)
    xes_file.save(xes_path)

    last_uploaded_data['xes_path'] = xes_path
    last_uploaded_data['bpmn_path'] = None
    last_uploaded_data['bpmn_model'] = None
    last_uploaded_data['alignments'] = None
    last_uploaded_data['deviation_matrix'] = None
    last_uploaded_data['impact_matrix'] = None

    # Parse log with pm4py (for downstream compatibility)
    filename_base, file_extension = os.path.splitext(xes_path)
    if file_extension == '.csv':
        log_csv = pd.read_csv(xes_path, encoding='utf-8-sig')
        log_csv['time:timestamp'] = pd.to_datetime(log_csv['time:timestamp'], utc=True)
        xes_log = log_converter.apply(log_csv)
    elif file_extension == '.xes':
        xes_log = xes_importer.apply(xes_path)
    else:
        return jsonify({"error": "Unsupported log format"}), 400

    xes_errors = validate_xes_log(xes_log)
    if xes_errors:
        return jsonify({"error": "Invalid XES log:\n" + "\n".join(xes_errors)}), 400

    last_uploaded_data['xes_log'] = xes_log

    # Build process_atoms EventLog from pm4py log
    log_df = pm4py.convert_to_dataframe(xes_log)

    # Auto-detect columns
    case_col = None
    activity_col = None
    timestamp_col = None
    for col in log_df.columns:
        cl = col.lower()
        if 'case' in cl and 'id' in cl:
            case_col = col
        elif cl in ('concept:name', 'activity'):
            activity_col = col
        elif 'timestamp' in cl or 'time' in cl:
            timestamp_col = col

    if not case_col:
        case_col = 'case:concept:name'
    if not activity_col:
        activity_col = 'concept:name'
    if not timestamp_col:
        timestamp_col = 'time:timestamp'

    # Build schema: case attributes + event attributes
    case_attrs = {}
    event_attrs = {}

    case_attrs[case_col] = CaseID
    event_attrs[case_col] = CaseID
    event_attrs[activity_col] = EventType
    event_attrs[timestamp_col] = EventTime

    # Add extra columns as Categorical or Continuous
    for col in log_df.columns:
        if col in (case_col, activity_col, timestamp_col):
            continue
        if col.startswith('(case)') or col.startswith('case:'):
            if pd.api.types.is_numeric_dtype(log_df[col]):
                case_attrs[col] = Continuous
            else:
                case_attrs[col] = Categorical
        else:
            if pd.api.types.is_numeric_dtype(log_df[col]):
                event_attrs[col] = Continuous
            else:
                event_attrs[col] = Categorical

    schema = EventLogSchemaTypes(cases=case_attrs, events=event_attrs)

    df_cases = log_df[list(case_attrs.keys())].drop_duplicates(subset=case_col)
    df_events = log_df[list(event_attrs.keys())]

    event_log = EventLog(df_cases, df_events, schema)
    last_uploaded_data['event_log_pa'] = event_log

    # Mine atoms
    process_id = "declarative_process"
    api = ProcessAtoms()
    atoms = api.mine_atoms_from_log(
        process_id,
        event_log,
        considered_templates,
        min_support=min_support,
        local=True,
        consider_vacuity=False,
    )

    last_uploaded_data['atoms'] = atoms

    # Build atoms_df
    records = []
    for atom in atoms:
        records.append({
            "type": atom.atom_type,
            "op_0": atom.operands[0],
            "op_1": atom.operands[1] if len(atom.operands) > 1 else "",
            "support": atom.support,
            "confidence": atom.attributes.get("confidence", 0.0),
        })
    atoms_df = pd.DataFrame.from_records(records)
    if len(atoms_df) > 0:
        atoms_df = atoms_df.sort_values(by="confidence", ascending=False).reset_index(drop=True)
    last_uploaded_data['atoms_df'] = atoms_df

    # Build constraint violation matrix
    dev_cols = []
    for i in range(len(atoms_df)):
        dev_cols.append(f"{atoms_df['type'][i]}_{atoms_df['op_0'][i]}_{atoms_df['op_1'][i]}")

    collect_data = pd.DataFrame(data=0, index=range(len(event_log)), columns=dev_cols)
    collect_data['case_id'] = None

    for i, d in enumerate(dev_cols):
        the_atom = None
        for atom in atoms:
            expected_ops = [atoms_df['op_0'][i]]
            if atoms_df['op_1'][i]:
                expected_ops.append(atoms_df['op_1'][i])
            if atom.atom_type == atoms_df['type'][i] and atom.operands == expected_ops:
                the_atom = atom
                break

        if the_atom is None:
            continue

        checker = RegexChecker(process_id, event_log)
        activities = checker.log.unique_activities()
        activity_map = checker._map_activities_to_letters(activities)
        variant_frame = checker.create_variant_frame_from_log(activity_map)
        variant_frame["sat"] = checker.compute_satisfaction(
            the_atom, variant_frame, activity_map, consider_vacuity=False
        )

        if i == 0:
            collect_data['case_id'] = list(
                val for cases in variant_frame["case_ids"].values for val in cases
            )

        for j in range(len(variant_frame)):
            for case_id in variant_frame["case_ids"][j]:
                ids = collect_data.index[collect_data['case_id'] == case_id]
                if variant_frame["sat"][j] == 1:
                    collect_data.loc[ids, d] = 0
                else:
                    collect_data.loc[ids, d] = 1

    # Compute trace duration per case
    if timestamp_col in log_df.columns:
        log_df[timestamp_col] = pd.to_datetime(log_df[timestamp_col])
        durations = log_df.groupby(case_col)[timestamp_col].agg(['min', 'max'])
        durations['duration'] = (durations['max'] - durations['min']).dt.total_seconds()
        duration_map = durations['duration'].to_dict()
        collect_data['trace_duration_seconds'] = collect_data['case_id'].map(duration_map).fillna(0)
    else:
        collect_data['trace_duration_seconds'] = 0.0

    # Rename case_id → trace_id to match BPMN matrix format
    collect_data = collect_data.rename(columns={'case_id': 'trace_id'})

    # Add trace-level attributes from df_cases (all columns except case_col itself)
    trace_attr_cols = [col for col in df_cases.columns if col != case_col]
    df_cases_indexed = df_cases.set_index(case_col)
    for col in trace_attr_cols:
        attr_map = df_cases_indexed[col].to_dict()
        collect_data[col] = collect_data['trace_id'].map(attr_map)

    # Add activities column: ordered list of activity names per trace
    if timestamp_col in log_df.columns:
        activities_per_case = (
            log_df.sort_values(timestamp_col)
            .groupby(case_col)[activity_col]
            .apply(list)
            .to_dict()
        )
    else:
        activities_per_case = log_df.groupby(case_col)[activity_col].apply(list).to_dict()
    collect_data['activities'] = collect_data['trace_id'].map(activities_per_case)

    # Reorder columns: trace_id, trace attributes, trace_duration_seconds, activities, violation columns
    ordered_cols = (
        ['trace_id']
        + trace_attr_cols
        + ['trace_duration_seconds', 'activities']
        + dev_cols
    )
    collect_data = collect_data[[c for c in ordered_cols if c in collect_data.columns]]

    last_uploaded_data['deviation_matrix'] = collect_data
    last_uploaded_data['mode'] = 'declarative'

    print(f"Mined {len(atoms)} constraints, matrix shape: {collect_data.shape}")

    atom_summary = atoms_df.to_dict(orient="records") if len(atoms_df) > 0 else []

    return jsonify({
        "message": "Declarative constraints mined successfully",
        "constraint_count": len(atoms),
        "atom_summary": atom_summary
    })


@app.route('/upload-declarative-model', methods=['POST'])
def upload_declarative_model():
    import re
    from Declare4Py.ProcessModels.DeclareModel import DeclareModel
    from Declare4Py.D4PyEventLog import D4PyEventLog
    from Declare4Py.ProcessMiningTasks.ConformanceChecking.MPDeclareAnalyzer import MPDeclareAnalyzer

    print("\n==== UPLOAD DECLARATIVE MODEL CALLED ====")

    xes_file = request.files.get('xes')
    decl_file = request.files.get('decl')

    if not xes_file or not xes_file.filename:
        return jsonify({"error": "Missing event log file"}), 400
    if not decl_file or not decl_file.filename:
        return jsonify({"error": "Missing .decl model file"}), 400

    upload_folder = "uploads"
    os.makedirs(upload_folder, exist_ok=True)

    xes_path = os.path.join(upload_folder, xes_file.filename)
    decl_path = os.path.join(upload_folder, decl_file.filename)

    xes_file.save(xes_path)
    decl_file.save(decl_path)

    # Reset cache
    last_uploaded_data['xes_path'] = xes_path
    last_uploaded_data['decl_path'] = decl_path
    last_uploaded_data['bpmn_path'] = None
    last_uploaded_data['bpmn_model'] = None
    last_uploaded_data['alignments'] = None
    last_uploaded_data['deviation_matrix'] = None
    last_uploaded_data['impact_matrix'] = None
    last_uploaded_data['atoms'] = None
    last_uploaded_data['atoms_df'] = None
    last_uploaded_data['event_log_pa'] = None
    last_uploaded_data['decl_constraint_info'] = None

    # Parse log with pm4py for downstream compatibility
    _, ext = os.path.splitext(xes_path)
    if xes_path.endswith('.xes.gz') or ext == '.xes':
        xes_log = xes_importer.apply(xes_path)
    elif ext == '.csv':
        log_csv = pd.read_csv(xes_path, encoding='utf-8-sig')
        log_csv['time:timestamp'] = pd.to_datetime(log_csv['time:timestamp'], utc=True)
        xes_log = log_converter.apply(log_csv)
    else:
        return jsonify({"error": "Unsupported log format"}), 400

    xes_errors = validate_xes_log(xes_log)
    if xes_errors:
        return jsonify({"error": "Invalid XES log:\n" + "\n".join(xes_errors)}), 400

    last_uploaded_data['xes_log'] = xes_log
    log_df = pm4py.convert_to_dataframe(xes_log)

    case_col = 'case:concept:name'
    activity_col = 'concept:name'
    timestamp_col = 'time:timestamp'

    # Ordered case IDs from pm4py log
    case_ids_ordered = list(dict.fromkeys(log_df[case_col].tolist()))

    # Parse with Declare4Py
    d4py_log = D4PyEventLog(case_name=case_col)
    d4py_log.parse_xes_log(xes_path)

    declare_model = DeclareModel().parse_from_file(decl_path)
    model_constraints = declare_model.get_decl_model_constraints()

    # Run conformance check
    basic_checker = MPDeclareAnalyzer(log=d4py_log, declare_model=declare_model, consider_vacuity=False)
    conf_check_res = basic_checker.run()

    # Get violation counts: rows = traces, columns = constraints
    violations_df = conf_check_res.get_metric(metric="num_violations")
    constraint_cols = list(violations_df.columns)

    # Get activation counts (0 activations → constraint never triggered, violations are vacuous)
    try:
        activations_df = conf_check_res.get_metric(metric="num_activations")
        activations_per_constraint = activations_df.fillna(0).sum(axis=0).to_dict()
    except Exception:
        activations_per_constraint = {}

    # Build a mapping serialized_constraint_str → constraint_dict for data conditions
    constraint_map = {
        declare_model.serialized_constraints[i]: declare_model.constraints[i]
        for i in range(len(declare_model.constraints))
        if i < len(declare_model.serialized_constraints)
    }

    # Build binary violation matrix aligned to case_ids_ordered
    violations_binary = (violations_df > 0).astype(int)

    if set(violations_df.index).issubset(set(case_ids_ordered)):
        # Index is case IDs — reindex to our ordered list
        violations_binary = violations_binary.reindex(case_ids_ordered).fillna(0).astype(int)
        violations_binary.index = case_ids_ordered
    else:
        # Index is numeric — align positionally
        n = min(len(violations_binary), len(case_ids_ordered))
        violations_binary = violations_binary.iloc[:n].copy()
        violations_binary.index = case_ids_ordered[:n]
        # Pad if needed
        if n < len(case_ids_ordered):
            pad = pd.DataFrame(0, index=case_ids_ordered[n:], columns=constraint_cols)
            violations_binary = pd.concat([violations_binary, pad])

    violations_binary.index.name = 'trace_id'
    collect_data = violations_binary.reset_index()

    # Add trace duration
    if timestamp_col in log_df.columns:
        log_df[timestamp_col] = pd.to_datetime(log_df[timestamp_col])
        durations = log_df.groupby(case_col)[timestamp_col].agg(['min', 'max'])
        durations['duration'] = (durations['max'] - durations['min']).dt.total_seconds()
        duration_map = durations['duration'].to_dict()
        collect_data['trace_duration_seconds'] = collect_data['trace_id'].map(duration_map).fillna(0)
    else:
        collect_data['trace_duration_seconds'] = 0.0

    # Add activities
    if timestamp_col in log_df.columns:
        activities_per_case = (
            log_df.sort_values(timestamp_col)
            .groupby(case_col)[activity_col]
            .apply(list)
            .to_dict()
        )
    else:
        activities_per_case = log_df.groupby(case_col)[activity_col].apply(list).to_dict()
    collect_data['activities'] = collect_data['trace_id'].map(activities_per_case)

    # Reorder columns
    ordered_cols = ['trace_id', 'trace_duration_seconds', 'activities'] + constraint_cols
    collect_data = collect_data[[c for c in ordered_cols if c in collect_data.columns]]

    last_uploaded_data['deviation_matrix'] = collect_data
    last_uploaded_data['mode'] = 'declarative-model'

    # Store parsed constraint info for API responses
    decl_constraint_info = []
    for col in constraint_cols:
        m = re.match(r'^([^\[]+)\[([^\]]*)\]', str(col).strip())
        if m:
            ctype = m.group(1).strip()
            ops = [op.strip() for op in m.group(2).split(',') if op.strip()]
        else:
            ctype = str(col)
            ops = []

        # Extract data conditions from the parsed constraint dict
        cdict = constraint_map.get(col, {})
        conditions = cdict.get('condition', [])
        is_binary = cdict.get('template') and getattr(cdict['template'], 'is_binary', False)

        activation_cond = conditions[0].strip() if len(conditions) > 0 else ""
        # For binary templates condition[1] is the correlation/target condition; for unary it doesn't exist
        if is_binary and len(conditions) > 2:
            correlation_cond = conditions[1].strip()
        else:
            correlation_cond = ""
        # Time condition: last element (may be a time range string like "92,14473,s")
        time_cond = conditions[-1].strip() if len(conditions) > 0 else ""

        total_activations = int(activations_per_constraint.get(col, 0))

        decl_constraint_info.append({
            'col_name': col,
            'type': ctype,
            'operands': ops,
            'activation_condition': activation_cond if activation_cond else None,
            'correlation_condition': correlation_cond if correlation_cond else None,
            'time_condition': time_cond if time_cond else None,
            'is_data_aware': bool(activation_cond or correlation_cond),
            'total_activations': total_activations,
        })
    last_uploaded_data['decl_constraint_info'] = decl_constraint_info

    print(f"Uploaded .decl model: {len(model_constraints)} constraints, {len(case_ids_ordered)} traces, matrix shape: {collect_data.shape}")

    return jsonify({
        "message": "Declarative model conformance check completed",
        "constraint_count": len(model_constraints),
        "trace_count": len(case_ids_ordered),
    })


def get_cached_impact_matrix():
    return last_uploaded_data.get("impact_matrix")

def get_cached_alignments():
    import time
    # Wait for background computation if it is in progress
    while last_uploaded_data.get('alignment_status') == 'computing':
        time.sleep(0.5)
    if last_uploaded_data['alignments'] is None:
        # Fallback: compute synchronously (e.g. direct BPMN-upload mode)
        last_uploaded_data['alignments'] = calculate_alignments(
            last_uploaded_data['bpmn_path'],
            get_cached_xes_log()
        )
        print('alignments computed')
    return last_uploaded_data['alignments']

def get_cached_xes_log():
    if last_uploaded_data['xes_log'] is None and last_uploaded_data['xes_path']:
        last_uploaded_data['xes_log'] = xes_importer.apply(last_uploaded_data['xes_path'])
    return last_uploaded_data['xes_log']

def get_cached_deviation_matrix():
    if last_uploaded_data["deviation_matrix"] is None:

        # Declarative matrices can only be built during upload — cannot reconstruct here
        if last_uploaded_data.get("mode") in ("declarative", "declarative-model"):
            return pd.DataFrame()

        print("⚙️ Building deviation matrix...")

        log = get_cached_xes_log()
        aligned_traces = get_cached_alignments()

        df, labels = build_trace_deviation_matrix_df(log, aligned_traces)

        last_uploaded_data["deviation_matrix"] = df
        last_uploaded_data["deviation_labels"] = labels

        print("✅ Deviation matrix cached.")
        print("Shape:", df.shape)

    return last_uploaded_data["deviation_matrix"]


@app.route("/api/preview-matrix", methods=["GET"])
def api_preview_matrix():

    df = get_cached_deviation_matrix()

    # return small sample to avoid huge payload
    sample_df = df.head(500)
    #sample_df = df.copy()

    return jsonify({
        "columns": list(sample_df.columns),
        "rows": sample_df.to_dict(orient="records")
    })



@app.route('/api/deviation-overview', methods=['GET'])
def deviation_overview():
    mode = last_uploaded_data.get('mode', 'bpmn')

    if mode == 'declarative-model':
        decl_constraint_info = last_uploaded_data.get('decl_constraint_info', [])
        if not decl_constraint_info:
            return jsonify({"error": "No .decl model loaded yet"}), 400
        df = last_uploaded_data.get('deviation_matrix')
        constraints = []
        for info in decl_constraint_info:
            col_name = info['col_name']
            violation_count = int(df[col_name].sum()) if df is not None and col_name in df.columns else 0
            constraints.append({
                "constraint": col_name,
                "type": info['type'],
                "operands": info['operands'],
                "violation_count": violation_count,
                "activation_condition": info.get('activation_condition'),
                "correlation_condition": info.get('correlation_condition'),
                "time_condition": info.get('time_condition'),
                "is_data_aware": info.get('is_data_aware', False),
                "total_activations": info.get('total_activations', 0),
            })
        return jsonify({"constraints": constraints})

    if mode == 'declarative':
        atoms_df = last_uploaded_data.get('atoms_df')
        if atoms_df is None or len(atoms_df) == 0:
            return jsonify({"error": "No constraints mined yet"}), 400

        df = last_uploaded_data.get('deviation_matrix')
        constraints = []
        for i in range(len(atoms_df)):
            col_name = f"{atoms_df['type'][i]}_{atoms_df['op_0'][i]}_{atoms_df['op_1'][i]}"
            violation_count = int(df[col_name].sum()) if df is not None and col_name in df.columns else 0
            constraints.append({
                "constraint": col_name,
                "type": atoms_df['type'][i],
                "operands": [atoms_df['op_0'][i], atoms_df['op_1'][i]],
                "violation_count": violation_count,
                "support": float(atoms_df['support'][i]),
                "confidence": float(atoms_df['confidence'][i]),
            })

        return jsonify({"constraints": constraints})

    # BPMN mode
    if not last_uploaded_data['alignments']:
        return jsonify({"error": "Alignments not computed yet"}), 400

    alignments = last_uploaded_data['alignments']

    skip_counts = {}
    insertion_counts = {}

    for trace in alignments:
        for move in trace['alignment']:
            log_move, model_move = move

            # Skip (model move)
            if log_move == '>>' and model_move not in (None, '>>'):
                skip_counts[model_move] = skip_counts.get(model_move, 0) + 1

            # Insertion (log move)
            elif model_move == '>>' and log_move not in (None, '>>'):
                insertion_counts[log_move] = insertion_counts.get(log_move, 0) + 1

    return jsonify({
        "skips": [
            {"activity": k, "count": v}
            for k, v in sorted(skip_counts.items(), key=lambda x: -x[1])
        ],
        "insertions": [
            {"activity": k, "count": v}
            for k, v in sorted(insertion_counts.items(), key=lambda x: -x[1])
        ]
    })


@app.route("/api/deviation-matrix", methods=["GET"])
def api_deviation_matrix_preview(preview=False):

    df = get_cached_deviation_matrix()

    if preview:
        preview_size = 50  # only return first 50 rows
        preview_df = df.head(preview_size)
    else:
        preview_df = df.copy()

    return jsonify({
        "columns": list(preview_df.columns),
        "rows": preview_df.to_dict(orient="records"),
        "total_rows": df.shape[0],
        "total_columns": df.shape[1]
    })


from flask import request, jsonify
import pandas as pd

@app.route("/api/current-impact-matrix", methods=["GET"])
def get_current_impact_matrix():

    if last_uploaded_data.get("impact_matrix") is not None:
        df = last_uploaded_data["impact_matrix"]
    else:
        df = get_cached_deviation_matrix()

    return jsonify({
        "columns": list(df.columns),
        "rows": df.to_dict(orient="records"),
        "total_rows": df.shape[0],
        "total_columns": df.shape[1]
    })

@app.route("/api/configure-dimensions", methods=["POST"])
def configure_dimensions():

    data = request.json
    dimension_configs = data.get("dimensions", [])
    if last_uploaded_data.get("xes_log") is None:
        raise ValueError("No XES log loaded.")

    if last_uploaded_data.get("mode") == "bpmn" and last_uploaded_data.get("bpmn_path") is None:
        raise ValueError("No BPMN model loaded.")
    # ✅ get the already cached trace x deviation matrix
    df = get_cached_deviation_matrix().copy()

    for dim in dimension_configs:

        dimension = dim["dimension"]
        comp_type = dim["computationType"]
        config = dim["config"]

        if comp_type == "existing":
            column = config.get("column")

            if not column:
                return jsonify({"error": f"No column selected for dimension '{dimension}'"}), 400

            if column not in df.columns:
                return jsonify({"error": f"Column '{column}' not found"}), 400

            df[dimension] = df[column]


        elif comp_type == "formula":

            expression = config.get("expression")

            if not expression:
                return jsonify({"error": "Missing formula expression"}), 400

            try:

                df[dimension] = df.eval(

                    expression,

                    engine="python",

                    local_dict={

                        "where": np.where,

                        "abs": np.abs,

                        "log": np.log,

                        "min": np.minimum,

                        "max": np.maximum,

                    }

                )

                # convert boolean result to int automatically

                if df[dimension].dtype == bool:
                    df[dimension] = df[dimension].astype(int)


            except Exception as e:

                return jsonify({"error": f"Invalid formula: {str(e)}"}), 400


        elif comp_type == "rule":

            def _evaluate_single_condition(df, column, operator, value):
                """Evaluate one condition and return a boolean Series."""
                if column not in df.columns:
                    raise ValueError(f"Column '{column}' not found")
                if operator == "equals":
                    return df[column] == value
                elif operator == "not_equals":
                    return df[column] != value
                elif operator == "contains":
                    return df[column].apply(
                        lambda x: any(str(value) in str(v) for v in x) if isinstance(x, list) else str(value) in str(x)
                    )
                elif operator == "starts_with":
                    return df[column].apply(
                        lambda x: any(str(v).startswith(str(value)) for v in x) if isinstance(x, list) else str(x).startswith(str(value))
                    )
                elif operator == "ends_with":
                    return df[column].apply(
                        lambda x: any(str(v).endswith(str(value)) for v in x) if isinstance(x, list) else str(x).endswith(str(value))
                    )
                elif operator == "greater":
                    return df[column] > float(value)
                elif operator == "less":
                    return df[column] < float(value)
                elif operator == "greater_equal":
                    return df[column] >= float(value)
                elif operator == "less_equal":
                    return df[column] <= float(value)
                else:
                    raise ValueError(f"Unsupported operator: {operator}")

            try:
                # Support both legacy single-condition format and new compound conditions array
                conditions = config.get("conditions")
                if conditions and isinstance(conditions, list) and len(conditions) > 0:
                    # New compound format: list of {column, operator, value, connector?}
                    combined = None
                    for cond in conditions:
                        col = cond.get("column", "")
                        op = cond.get("operator", "")
                        val = cond.get("value", "")
                        connector = cond.get("connector", "AND")  # first condition has no connector
                        negate = cond.get("negate", False)
                        single = _evaluate_single_condition(df, col, op, val)
                        if negate:
                            single = ~single
                        if combined is None:
                            combined = single
                        elif connector == "OR":
                            combined = combined | single
                        else:  # AND (default)
                            combined = combined & single
                    result = combined if combined is not None else pd.Series(False, index=df.index)
                else:
                    # Legacy single condition format
                    column = config["column"]
                    operator = config.get("operator")
                    value = config.get("value")
                    result = _evaluate_single_condition(df, column, operator, value)

                df[dimension] = result.astype(int)

            except Exception as e:

                return jsonify({"error": f"Invalid rule: {str(e)}"}), 400

    # ✅ store result inside your cache dict instead of global variable
    last_uploaded_data["impact_matrix"] = df

    return jsonify({
        "status": "success",
        "columns": list(df.columns)
    })


from dowhy import CausalModel as dowhymodel

@app.route("/api/compute-causal-effects", methods=["POST"])
def compute_causal_effects():

    payload = request.json
    selected_deviations = payload.get("deviations", [])
    selected_dimensions = payload.get("dimensions", [])

    if last_uploaded_data.get("impact_matrix") is None:
        return jsonify({"error": "Impact matrix not available"}), 400

    df = last_uploaded_data["impact_matrix"].copy()

    print("Received deviations:", selected_deviations)
    print("Received dimensions:", selected_dimensions)
    print("Impact matrix shape:", df.shape)
    print("Columns:", df.columns.tolist())

    results = []

    for dim in selected_dimensions:
        for dev in selected_deviations:

            # Skip if columns missing
            if dev not in df.columns or dim not in df.columns:
                continue

            graph = f'digraph {{ "{dev}" -> "{dim}" }}'

            try:
                model = dowhymodel(
                    data=df,
                    treatment=dev,
                    outcome=dim,
                    graph=graph
                )

                identified_estimand = model.identify_effect(
                    proceed_when_unidentifiable=True
                )

                estimate = model.estimate_effect(
                    identified_estimand,
                    method_name="backdoor.linear_regression",
                    test_significance=True
                )

                significance = estimate.test_stat_significance()

                results.append({
                    "deviation": dev,
                    "dimension": dim,
                    "ate": float(estimate.value),
                    "p_value": float(significance["p_value"]) if significance else None
                })


            except Exception as e:
                results.append({
                    "deviation": dev,
                    "dimension": dim,
                    "error": f"[{dim} × {dev}] {type(e).__name__}: {str(e)}"
                })
    print(results)
    last_uploaded_data["causal_results"] = results
    if not results:
        return jsonify({
            "error": "No valid deviation-dimension combinations found",
            "available_columns": df.columns.tolist()
        }), 400

    return jsonify({
        "results": results
    })


@app.route('/api/save-timing', methods=['POST'])
def save_timing():
    data = request.get_json()
    elapsed_ms = data.get("elapsedMs")

    if elapsed_ms is None:
        return jsonify({"error": "Timing is required"}), 400

    # Get XES file name without extension
    if not last_uploaded_data.get("xes_path"):
        return jsonify({"error": "No XES file uploaded yet"}), 400

    xes_filename = os.path.basename(last_uploaded_data["xes_path"])
    base_name, _ = os.path.splitext(xes_filename)

    # Create /timing subfolder next to app.py
    timing_folder = os.path.join(os.path.dirname(__file__), 'timing')
    os.makedirs(timing_folder, exist_ok=True)

    # File path (append .txt)
    timing_file_path = os.path.join(timing_folder, f"{base_name}.txt")

    # Append with timestamp
    from datetime import datetime
    with open(timing_file_path, 'a') as f:
        f.write(f"{datetime.now().isoformat()} - {elapsed_ms:.2f} ms\n")

    return jsonify({"message": "Timing saved", "elapsedMs": elapsed_ms, "file": timing_file_path})



@app.route('/api/fitness', methods=['GET'])
def api_fitness():
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()
    return jsonify(get_fitness_per_trace(aligned_traces))

@app.route('/api/bpmn-activities', methods=['POST'])
def api_bpmn_activities():
    if 'bpmn' not in request.files:
        return jsonify({"error": "No process model file uploaded"}), 400
    bpmn_file = request.files['bpmn']
    file_path = os.path.join('/tmp', bpmn_file.filename)
    bpmn_file.save(file_path)
    last_uploaded_files['bpmn'] = file_path
    activities = get_all_activities_from_model(file_path)
    return jsonify({"activities": activities})

@app.route('/api/conformance-bins', methods=['GET'])
def api_conformance_bins():
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()
    fitness_data = get_fitness_per_trace(aligned_traces)
    return jsonify(get_conformance_bins(fitness_data))

@app.route('/api/activity-deviations', methods=['GET'])
def api_activity_deviations():
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()

    xes_log = get_cached_xes_log()
    result = get_activity_deviations(last_uploaded_files['bpmn'], xes_log, aligned_traces)
    return jsonify(result)
@app.route("/api/outcome-distribution", methods=["POST"])
def api_outcome_distribution():
    data = request.get_json() or {}
    matching_mode = data.get('matchingMode')             # 'end' or 'contains' or None
    selected_activities = data.get('selectedActivities') # array or maybe empty

    # normalize: make sure selected_activities is a list (or empty list)
    if isinstance(selected_activities, str):
        selected_activities = [selected_activities]
    if selected_activities is None:
        selected_activities = []

    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()
    xes_log = get_cached_xes_log()

    result = get_outcome_distribution(
        bpmn_path=last_uploaded_files['bpmn'],
        log=xes_log,
        aligned_traces=aligned_traces,
        matching_mode=matching_mode,
        selected_activities=selected_activities
    )
    return jsonify(result)

@app.route('/api/conformance-by-role', methods=['GET'])
def api_conformance_by_role():
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()
    xes_log = get_cached_xes_log()
    result = get_conformance_by_role(xes_log, aligned_traces)
    return jsonify(result)

@app.route('/api/conformance-by-event_attribute', methods=['GET'])
def api_conformance_by_event_attribute():
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()
    result = get_conformance_by_event_attribute(get_cached_xes_log(), aligned_traces)
    return jsonify(result)

@app.route("/api/unique-sequences", methods=["GET"])
def unique_sequences():
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()
    result = get_unique_sequences_per_bin(get_cached_xes_log(), aligned_traces)
    return jsonify(result)

@app.route('/api/requested-amounts', methods=['GET'])
def api_requested_amounts():
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()
    result = get_requested_amount_vs_conformance(get_cached_xes_log(), aligned_traces)
    return jsonify(result)

@app.route('/api/conformance-by-resource', methods=['GET'])
def api_conformance_by_resource():
    if not last_uploaded_data['bpmn_path'] or not last_uploaded_data['xes_path']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = get_cached_alignments()

    xes_log = get_cached_xes_log()

    result = get_conformance_by_resource(xes_log, aligned_traces)
    return jsonify(result)
@app.route('/api/trace-sequences', methods=['GET'])
def api_trace_sequences():


    result = get_trace_sequences(get_cached_xes_log())
    return jsonify(result)

@app.route('/preload/<filename>', methods=['GET'])
def preload_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route('/api/model-content', methods=['GET'])
def api_model_content():
    """Return the uploaded model content. For BPMN: raw XML. For PNML: SVG. For declarative: constraint list."""
    mode = last_uploaded_data.get('mode', 'bpmn')

    if mode == 'declarative-model':
        decl_constraint_info = last_uploaded_data.get('decl_constraint_info', [])
        if not decl_constraint_info:
            return jsonify({"error": "No .decl model loaded yet"}), 400
        constraints_out = [
            {
                "type": c['type'],
                "op_0": c['operands'][0] if c['operands'] else "",
                "op_1": c['operands'][1] if len(c['operands']) > 1 else "",
                "activation_condition": c.get('activation_condition'),
                "correlation_condition": c.get('correlation_condition'),
                "time_condition": c.get('time_condition'),
                "is_data_aware": c.get('is_data_aware', False),
                "total_activations": c.get('total_activations', 0),
            }
            for c in decl_constraint_info
        ]
        return jsonify({"type": "declarative-model", "constraints": constraints_out})

    if mode == 'declarative':
        atoms_df = last_uploaded_data.get('atoms_df')
        if atoms_df is None or len(atoms_df) == 0:
            return jsonify({"error": "No constraints mined yet"}), 400
        constraints = atoms_df.to_dict(orient="records")
        return jsonify({"type": "declarative", "constraints": constraints})

    model_path = last_uploaded_data.get('bpmn_path')
    if not model_path:
        return jsonify({"error": "No model uploaded yet"}), 400

    ext = os.path.splitext(model_path)[1].lower()

    if ext == '.bpmn':
        with open(model_path, 'r', encoding='utf-8') as f:
            content = f.read()
        return jsonify({"type": "bpmn", "content": content})
    elif ext == '.pnml':
        from process_mining.conformance_alignments import read_model_as_petri_net
        net, im, fm = read_model_as_petri_net(model_path)
        try:
            from pm4py.visualization.petri_net import visualizer as pn_visualizer
            gviz = pn_visualizer.apply(net, im, fm,
                                       parameters={pn_visualizer.Variants.WO_DECORATION.value.Parameters.FORMAT: "svg"})
            svg_content = pn_visualizer.serialize(gviz).decode('utf-8')
            return jsonify({"type": "pnml", "content": svg_content})
        except Exception as viz_err:
            print(f"Petri net visualization failed ({viz_err}), falling back to info")
            activities = sorted(set(t.label for t in net.transitions if t.label))
            return jsonify({
                "type": "pnml_info",
                "activities": activities,
                "n_places": len(net.places),
                "n_transitions": len(net.transitions),
                "n_arcs": len(net.arcs),
            })
    else:
        return jsonify({"error": f"Unsupported model type: {ext}"}), 400


@app.route('/api/deviation-rules', methods=['GET'])
def api_deviation_rules():
    deviation = request.args.get('deviation', '')
    df = last_uploaded_data.get('deviation_matrix')

    empty = {"rules": [], "feature_importance": [], "total_traces": 0, "deviation_rate": 0.0, "n_features": 0}

    if df is None or deviation not in df.columns:
        return jsonify(empty)

    target = df[deviation].dropna()
    if target.nunique() < 2:
        return jsonify(empty)

    # Detect other deviation columns (binary 0/1 only, excluding target)
    other_dev_cols = set()
    for col in df.columns:
        if col == deviation:
            continue
        vals = df[col].dropna()
        if len(vals) > 0 and set(vals.astype(float).unique()).issubset({0.0, 1.0}):
            other_dev_cols.add(col)

    exclude = {'trace_id', 'activities', deviation} | other_dev_cols
    feature_cols = [c for c in df.columns if c not in exclude]

    feature_dfs = []
    for col in feature_cols:
        col_data = df[col]
        if pd.api.types.is_numeric_dtype(col_data):
            median_val = col_data.median()
            filled = col_data.fillna(median_val if pd.notna(median_val) else 0)
            feature_dfs.append(filled.to_frame(name=col))
        elif col_data.dtype == object or hasattr(col_data, 'cat'):
            cardinality = col_data.nunique()
            if 2 <= cardinality <= 20:
                filled = col_data.fillna('unknown')
                dummies = pd.get_dummies(filled, prefix=col, drop_first=False)
                feature_dfs.append(dummies)

    if not feature_dfs:
        return jsonify(empty)

    X = pd.concat(feature_dfs, axis=1)
    y = df[deviation].fillna(0).astype(int)

    common_idx = X.index.intersection(y.index)
    X = X.loc[common_idx]
    y = y.loc[common_idx]
    n = len(y)

    if n < 10 or y.nunique() < 2:
        return jsonify(empty)

    clf = DecisionTreeClassifier(
        max_depth=3,
        min_samples_leaf=max(5, int(0.05 * n)),
        class_weight='balanced',
        random_state=42
    )
    clf.fit(X, y)

    tree_ = clf.tree_
    col_names = X.columns.tolist()

    def extract_rules(node, conditions):
        if tree_.feature[node] == _tree.TREE_UNDEFINED:
            prediction = int(np.argmax(tree_.value[node][0]))
            support = int(tree_.n_node_samples[node])
            n_pos = int(tree_.value[node][0][1]) if len(tree_.value[node][0]) > 1 else 0
            precision = n_pos / support if support > 0 else 0.0
            coverage = support / n
            return [{"conditions": list(conditions), "prediction": prediction,
                     "support": support, "precision": round(precision, 4), "coverage": round(coverage, 4)}]
        feature_name = col_names[tree_.feature[node]]
        threshold = float(tree_.threshold[node])
        left_cond = conditions + [{"feature": feature_name, "op": "<=", "value": round(threshold, 4)}]
        right_cond = conditions + [{"feature": feature_name, "op": ">", "value": round(threshold, 4)}]
        rules = []
        rules.extend(extract_rules(tree_.children_left[node], left_cond))
        rules.extend(extract_rules(tree_.children_right[node], right_cond))
        return rules

    all_rules = extract_rules(0, [])
    deviation_rules = sorted(
        [r for r in all_rules if r["prediction"] == 1],
        key=lambda r: r["precision"], reverse=True
    )

    importances = clf.feature_importances_
    importance_list = sorted(
        [{"feature": col_names[i], "importance": round(float(importances[i]), 4)}
         for i in range(len(col_names)) if importances[i] > 0],
        key=lambda x: x["importance"], reverse=True
    )

    return jsonify({
        "rules": deviation_rules,
        "feature_importance": importance_list,
        "total_traces": n,
        "deviation_rate": round(float(y.mean()), 4),
        "n_features": len(col_names)
    })


@app.route('/api/ollama/models', methods=['GET'])
def api_ollama_models():
    import urllib.request
    try:
        req = urllib.request.Request("http://localhost:11434/api/tags", method="GET")
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        models = [m["name"] for m in data.get("models", [])]
        return jsonify({"models": models, "online": True})
    except Exception as e:
        return jsonify({"models": [], "online": False, "error": str(e)})


@app.route('/api/ollama/pull', methods=['POST'])
def api_ollama_pull():
    import urllib.request
    data = request.get_json(force=True)
    model = data.get('model', 'llama3.2')
    payload = json.dumps({"name": model, "stream": False}).encode("utf-8")
    try:
        req = urllib.request.Request(
            "http://localhost:11434/api/pull",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=600) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        return jsonify({"status": result.get("status", "success")})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/llm-suggestion', methods=['POST'])
def api_llm_suggestion():
    import urllib.request
    data = request.get_json(force=True)
    deviation = data.get('deviation', '')
    direction = data.get('direction', 'neutral')  # 'positive', 'negative', 'neutral'
    causal_effects = data.get('causal_effects', [])  # [{dimension, ate, criticality}]
    top_rule = data.get('top_rule', None)  # e.g. "age > 50 AND resource = nurse"
    model = data.get('model', 'llama3.2')

    # Build a compact prompt
    effects_lines = "\n".join(
        f"  - {e['dimension']}: CATE={e['ate']:.3f} ({e['criticality']})"
        for e in causal_effects if e.get('ate') is not None
    )
    rule_line = f"\nKey predictive pattern: {top_rule}" if top_rule else ""

    if direction == 'negative':
        action = "avoid or reduce this deviation"
    elif direction == 'positive':
        action = "encourage or institutionalize this deviation as a standard practice"
    else:
        action = "monitor this deviation without urgent intervention"

    prompt = f"""You are a process improvement consultant analyzing a business process.

A process deviation called "{deviation}" has been detected.
Overall impact direction: {direction}.
Causal effects on process dimensions:
{effects_lines}{rule_line}

Give 3 concise, actionable recommendations to {action}.
Be specific and practical. Use bullet points. Do not repeat the input data."""

    payload = json.dumps({
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {"num_predict": 300, "temperature": 0.7}
    }).encode("utf-8")

    try:
        req = urllib.request.Request(
            "http://localhost:11434/api/generate",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=60) as resp:
            result = json.loads(resp.read().decode("utf-8"))
        return jsonify({"suggestion": result.get("response", "").strip()})
    except Exception as e:
        return jsonify({"error": f"Ollama error: {str(e)}"}), 500


if __name__ == '__main__':
    print("🚀 Flask backend running at: http://localhost:1904")
    app.run(host="0.0.0.0", port=1904, debug=True, use_reloader=False, threaded=True)
    reset_cache()