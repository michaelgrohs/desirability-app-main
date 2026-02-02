# app.py

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
    build_trace_deviation_matrix_df
)

from process_mining.activity_deviations import get_activity_deviations
from pm4py.objects.log.importer.xes import importer as xes_importer


app = Flask(__name__)
CORS(app, supports_credentials=True)

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
    "bpmn_model": None,
    "xes_log": None,
    "alignments": None,
    "deviation_matrix": None,
    "deviation_labels": None,
    "impact_matrix": None
}

def reset_cache():
    last_uploaded_data["bpmn_model"] = None
    last_uploaded_data["xes_log"] = None
    last_uploaded_data["alignments"] = None
    last_uploaded_data["deviation_matrix"] = None
    last_uploaded_data["impact_matrix"] = None

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
        return jsonify({"error": "Missing BPMN or XES file"}), 400

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


    # Store paths
    last_uploaded_data['bpmn_path'] = bpmn_path
    last_uploaded_data['xes_path'] = xes_path

    # Parse BPMN
    bpmn_model = parse_bpmn(bpmn_path)
    last_uploaded_data['bpmn_model'] = bpmn_model

    # Parse XES or CSV
    filename, file_extension = os.path.splitext(xes_path)
    print(file_extension)
    if file_extension == '.csv':
        log_csv = pd.read_csv(xes_path, encoding='utf-8-sig')
        log_csv['time:timestamp'] = pd.to_datetime(log_csv['time:timestamp'], format='mixed', utc=True)
        xes_log = log_converter.apply(log_csv)
    elif file_extension == '.xes':
        xes_log = xes_importer.apply(xes_path)
    else:
        return jsonify({"error": "Unsupported log format"}), 400

    last_uploaded_data['xes_log'] = xes_log

    alignments = calculate_alignments(bpmn_path, xes_log)
    last_uploaded_data['alignments'] = alignments

    print("Alignments computed successfully")

    return jsonify({
        "message": "Files uploaded and alignments computed",
        "alignment_count": len(alignments)
    })


def get_cached_impact_matrix():
    return last_uploaded_data.get("impact_matrix")

def get_cached_alignments():
    if last_uploaded_data['alignments'] is None:

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

@app.route("/api/configure-dimensions", methods=["POST"])
def configure_dimensions():

    data = request.json
    dimension_configs = data.get("dimensions", [])

    # ✅ get the already cached trace x deviation matrix
    df = get_cached_deviation_matrix().copy()

    for dim in dimension_configs:

        dimension = dim["dimension"]
        comp_type = dim["computationType"]
        config = dim["config"]

        if comp_type == "existing":
            column = config["column"]

            if column not in df.columns:
                return jsonify({"error": f"Column '{column}' not found"}), 400

            df[dimension] = df[column]

        elif comp_type == "formula":
            base = config["baseColumn"]

            if base not in df.columns:
                return jsonify({"error": f"Base column '{base}' not found"}), 400

            subtract = config.get("subtractConstant", 0)
            multiplier = config.get("multiplier", 1)

            df[dimension] = (df[base] - subtract) * multiplier

        elif comp_type == "rule":
            column = config["column"]

            if column not in df.columns:
                return jsonify({"error": f"Column '{column}' not found"}), 400

            value = config["value"]

            df[dimension] = (df[column] == value).astype(int)

    # ✅ store result inside your cache dict instead of global variable
    last_uploaded_data["impact_matrix"] = df

    return jsonify({
        "status": "success",
        "columns": list(df.columns)
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
        return jsonify({"error": "No BPMN file uploaded"}), 400
    bpmn_file = request.files['bpmn']
    file_path = os.path.join('/tmp', bpmn_file.filename)
    bpmn_file.save(file_path)
    last_uploaded_files['bpmn'] = file_path
    activities = get_all_activities_from_bpmn(file_path)
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




if __name__ == '__main__':
    print("🚀 Flask backend running at: http://localhost:1904")
    app.run(host="0.0.0.0", port=1904, debug=True)
    reset_cache()