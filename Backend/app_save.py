# app.py

from flask import Flask, request, jsonify
from flask_cors import CORS
from flask import send_from_directory
import os

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
    get_all_activities_from_bpmn
)

from process_mining.activity_deviations import get_activity_deviations
from pm4py.objects.log.importer.xes import importer as xes_importer


app = Flask(__name__)
CORS(app)

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
    "alignments": None
}

def reset_cache():
    last_uploaded_data["bpmn_model"] = None
    last_uploaded_data["xes_log"] = None
    last_uploaded_data["alignments"] = None

@app.route('/upload', methods=['POST'])
def upload_files():
    if 'bpmn' not in request.files or 'xes' not in request.files:
        return jsonify({"error": "Both BPMN and XES files are required"}), 400

    bpmn_file = request.files['bpmn']
    xes_file = request.files['xes']

    bpmn_path = os.path.join(UPLOAD_FOLDER, bpmn_file.filename)
    xes_path = os.path.join(UPLOAD_FOLDER, xes_file.filename)

    bpmn_file.save(bpmn_path)
    xes_file.save(xes_path)

    last_uploaded_files['bpmn'] = bpmn_path
    last_uploaded_files['xes'] = xes_path

    to_be_process = parse_bpmn(bpmn_path)
    as_is_process = parse_xes(xes_path)

    return jsonify({
        "to_be_process": to_be_process,
        "as_is_process": as_is_process
    })

@app.route('/api/fitness', methods=['GET'])
def api_fitness():
    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = calculate_alignments(last_uploaded_files['bpmn'], last_uploaded_files['xes'])
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
    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = calculate_alignments(last_uploaded_files['bpmn'], last_uploaded_files['xes'])
    fitness_data = get_fitness_per_trace(aligned_traces)
    return jsonify(get_conformance_bins(fitness_data))

@app.route('/api/activity-deviations', methods=['GET'])
def api_activity_deviations():
    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "No files uploaded yet."}), 400

    result = get_activity_deviations(last_uploaded_files['bpmn'], last_uploaded_files['xes'])
    return jsonify(result)

    deviations = get_activity_deviations(last_uploaded_files['bpmn'], last_uploaded_files['xes'])
    return jsonify(deviations)
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

    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = calculate_alignments(last_uploaded_files['bpmn'], last_uploaded_files['xes'])

    result = get_outcome_distribution(
        bpmn_path=last_uploaded_files['bpmn'],
        xes_path=last_uploaded_files['xes'],
        aligned_traces=aligned_traces,
        matching_mode=matching_mode,
        selected_activities=selected_activities
    )
    return jsonify(result)

@app.route('/api/conformance-by-role', methods=['GET'])
def api_conformance_by_role():
    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = calculate_alignments(last_uploaded_files['bpmn'], last_uploaded_files['xes'])
    result = get_conformance_by_role(last_uploaded_files['xes'], aligned_traces)
    return jsonify(result)

@app.route('/api/conformance-by-event_attribute', methods=['GET'])
def api_conformance_by_event_attribute():
    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = calculate_alignments(last_uploaded_files['bpmn'], last_uploaded_files['xes'])
    result = get_conformance_by_event_attribute(last_uploaded_files['xes'], aligned_traces)
    return jsonify(result)

@app.route("/api/unique-sequences", methods=["GET"])
def unique_sequences():
    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "Files not uploaded yet"}), 400

    aligned_traces = calculate_alignments(last_uploaded_files['bpmn'], last_uploaded_files['xes'])
    result = get_unique_sequences_per_bin(last_uploaded_files['xes'], aligned_traces)
    return jsonify(result)

@app.route('/api/requested-amounts', methods=['GET'])
def api_requested_amounts():
    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = calculate_alignments(last_uploaded_files['bpmn'], last_uploaded_files['xes'])
    result = get_requested_amount_vs_conformance(last_uploaded_files['xes'], aligned_traces)
    return jsonify(result)

@app.route('/api/conformance-by-resource', methods=['GET'])
def api_conformance_by_resource():
    if not last_uploaded_files['bpmn'] or not last_uploaded_files['xes']:
        return jsonify({"error": "No files uploaded yet."}), 400

    aligned_traces = calculate_alignments(last_uploaded_files['bpmn'], last_uploaded_files['xes'])

    xes_log = xes_importer.apply(last_uploaded_files['xes'])

    result = get_conformance_by_resource(xes_log, aligned_traces)
    return jsonify(result)
@app.route('/api/trace-sequences', methods=['GET'])
def api_trace_sequences():
    if not last_uploaded_files['xes']:
        return jsonify({"error": "No XES file uploaded yet."}), 400

    result = get_trace_sequences(last_uploaded_files['xes'])
    return jsonify(result)

@app.route('/preload/<filename>', methods=['GET'])
def preload_file(filename):
    return send_from_directory(UPLOAD_FOLDER, filename)




if __name__ == '__main__':
    app.run(debug=True)