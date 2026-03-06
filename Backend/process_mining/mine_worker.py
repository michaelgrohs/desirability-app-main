"""
Standalone mining worker — invoked as a subprocess to avoid fork-in-thread
deadlocks on macOS when pm4py uses multiprocessing internally.

Usage:
    python mine_worker.py <json_args>

JSON args: { algorithm, noise_threshold, xes_path, bpmn_path }
Exits 0 on success, 1 on error (error message printed to stderr).
"""
import sys
import json
from collections import defaultdict, deque


def _layout_bpmn(bpmn_graph, h_spacing=220, v_spacing=130, node_w=120, node_h=60, event_size=36, gw_size=50):
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


def main():
    args = json.loads(sys.argv[1])
    algorithm = args['algorithm']
    noise_threshold = float(args['noise_threshold'])
    xes_path = args['xes_path']
    bpmn_path = args['bpmn_path']

    import pm4py
    from pm4py.objects.log.importer.xes import importer as xes_importer
    from pm4py.objects.conversion.log import converter as log_converter
    import pandas as pd
    import os

    _, ext = os.path.splitext(xes_path)
    if ext == '.csv':
        log_csv = pd.read_csv(xes_path, encoding='utf-8-sig')
        log_csv['time:timestamp'] = pd.to_datetime(log_csv['time:timestamp'], utc=True)
        xes_log = log_converter.apply(log_csv)
    else:
        xes_log = xes_importer.apply(xes_path)

    print(f"[worker] Parsed log: {len(xes_log)} traces", flush=True)

    if algorithm == 'inductive_infrequent':
        tree = pm4py.discover_process_tree_inductive(xes_log, noise_threshold=noise_threshold, multi_processing=False)
        net, im, fm = pm4py.convert_to_petri_net(tree)
    elif algorithm == 'heuristics':
        heu_net = pm4py.discover_heuristics_net(xes_log)
        net, im, fm = pm4py.convert_to_petri_net(heu_net)
    elif algorithm == 'alpha':
        net, im, fm = pm4py.discover_petri_net_alpha(xes_log)
    else:
        print(f"Unknown algorithm: {algorithm}", file=sys.stderr)
        sys.exit(1)

    print(f"[worker] Mining done, writing BPMN to {bpmn_path}", flush=True)
    bpmn_graph = pm4py.convert_to_bpmn(net, im, fm)
    _layout_bpmn(bpmn_graph)
    pm4py.write_bpmn(bpmn_graph, bpmn_path)
    print("[worker] DONE", flush=True)


if __name__ == '__main__':
    main()
