import sys
import json
from pm4py.objects.log.importer.xes import importer as xes_importer
import os
import pm4py
from pm4py.objects.conversion.log import converter as log_converter
from pm4py.objects.conversion.bpmn import converter as bpmn_converter
from sklearn import tree
import numpy as np
import pandas as pd
import pickle
from pm4py.util import exec_utils
from enum import Enum
from pm4py.algo.discovery.footprints import algorithm as footprints_discovery
from pm4py.visualization.petri_net import visualizer as pn_viz
from pm4py.objects.process_tree.utils import generic as pt_util
from pm4py.objects.process_tree.utils.generic import tree_sort
from pm4py.util.variants_util import get_variant_from_trace
from pm4py.statistics.variants.log.get import get_variants_sorted_by_count
import docplex
import time
from docplex.mp.model import Model
from collections.abc import Iterable
from collections import defaultdict
class Parameters(Enum):
    DEBUG = "debug"
    FOLD = "fold"
# Returns a path to the file selected by the user
# Input: The folder in which to look for the files - the default is the current folder
from . import pattern_detect

import warnings
warnings.filterwarnings("ignore")
import tempfile
from pm4py.objects.bpmn.exporter import exporter as bpmn_exporter

def export_bpmn_to_string(bpmn_obj):
    # Create a NamedTemporaryFile but close it immediately so pm4py can write to it
    tmp_file = tempfile.NamedTemporaryFile(suffix=".bpmn", delete=False)
    tmp_file.close()  # Close immediately, so pm4py can write to this path

    try:
        bpmn_exporter.apply(bpmn_obj, target_path=tmp_file.name)
        with open(tmp_file.name, 'r', encoding='utf-8') as f:
            bpmn_xml_str = f.read()
    finally:
        import os
        os.unlink(tmp_file.name)  # Clean up temp file

    return bpmn_xml_str

def generate_diagnostics(log, net, initial_marking, final_marking):
    
    patterns,c, aligned_traces = pattern_detect.find_patterns(log, net, initial_marking, final_marking)

    # select only one trace per variant
    variants = pm4py.get_variants(log)
    variant_list = list(variants.keys())
    var_counts = dict(get_variants_sorted_by_count(variants))
    return_df=pd.DataFrame(columns=['activities','count','alignment','avg_cycle_time'], index=range(len(variant_list)))
    return_df['activities'] = variant_list
    return_df['count'] = return_df['activities'].apply(lambda x: var_counts[x])
    variant_alignment_map = {}

    # For each trace and its alignment
    for trace, alignment in zip(log, aligned_traces):
        variant = ','.join([event['concept:name'] for event in trace])
        if variant not in variant_alignment_map:
            variant_alignment_map[variant] = alignment  # Store the first alignment for each variant

    for i in range(len(return_df)):
        variant = ','.join([event for event in return_df.activities[i]])
        if variant in variant_alignment_map:
            return_df.at[i, 'alignment'] = variant_alignment_map[variant]
        else:
            return_df.at[i, 'alignment'] = None  # Handle cases where no alignment is found
    # Compute average cycle time per variant
    for variant in variant_list:
        traces = variants[variant]
        cycle_times = []
        for trace in traces:
            start_time = trace[0]['time:timestamp']
            end_time = trace[-1]['time:timestamp']
            cycle_time = (end_time - start_time).total_seconds()
            cycle_times.append(cycle_time)
        
        if cycle_times:
            avg_cycle_time = sum(cycle_times) / len(cycle_times)
            return_df.loc[return_df['activities'] == variant, 'avg_cycle_time'] = avg_cycle_time
    return_df['patterns']=None
    for i in range(len(return_df)):
        return_df['patterns'][i] = []
        inserted=[[]]
        missing=[[]]
        repeated=[[]]
        replaced=[[]]
        swapped=[[]]
        detections=[]
        for pld in range(c):
            if not patterns[str('pld_'+str(pld))][i]==0:
                if 'missing_' == patterns[str('pld_'+str(pld))][i][:8]:
                    if len(missing[0])==0:
                        run_mis=0
                    else:
                        missing.append([])
                    stri=patterns['pld_'+str(pld)][i][8:]
                    if 'x' == stri[:1]:
                        stri= stri[1:]
                        stri=stri.split('[')[1].split(']')[0].split(',')
                        missing[run_mis].append('XOR')
                        for s in stri:
                            if s[:1]==' ':
                                s = s[1:]
                            missing[run_mis].append(s)
                    else:
                        stri=stri.split(',')
                        for s in stri:
                            if s[:1]==' ':
                                s = s[1:]
                            missing[run_mis].append(s)
                    return_df['patterns'][i].append((1, missing[run_mis]))
                    run_mis+=1
                if 'repeated_' == patterns[str('pld_'+str(pld))][i][:9]:
                    if len(repeated[0])==0:
                        run_rep=0
                    else:
                        repeated.append([])
                    stri=patterns['pld_'+str(pld)][i][9:]
                    stri=stri.split(',')
                    for s in stri:
                        if s[:1]==' ':
                            s = s[1:]
                        repeated[run_rep].append(s)
                    return_df['patterns'][i].append((2, repeated[run_rep]))
                    run_rep+=1
                if 'replace_' == patterns[str('pld_'+str(pld))][i][:8]:
                    if len(replaced[0])==0:
                        run_repl=0
                    else:
                        replaced.append([])
                    replaced[run_repl]=[[],[]]
                    stri=patterns['pld_'+str(pld)][i][8:]
                    stri0=stri.split(' BY_ ')[0].split(',')
                    stri1=stri.split(' BY_ ')[1].split(',')
                    for s in stri0:
                        if s[:1]==' ':
                            s = s[1:]
                        replaced[run_repl][0].append(s)
                    for s in stri1:
                        if s[:1]==' ':
                            s = s[1:]
                        replaced[run_repl][1].append(s)
                    return_df['patterns'][i].append((3, replaced[run_repl]))
                    run_repl+=1
                if 'swap_' == patterns[str('pld_'+str(pld))][i][:5]:
                    if len(swapped[0])==0:
                        run_swa=0
                    else:
                        swapped.append([])
                    swapped[run_swa]=[[],[]]
                    stri=patterns['pld_'+str(pld)][i][5:]
                    stri0=stri.split(' && ')[0].split(',')
                    stri1=stri.split(' && ')[1].split(',')
                    for s in stri0:
                        if s[:1]==' ':
                            s = s[1:]
                        swapped[run_swa][0].append(s)
                    for s in stri1:
                        if s[:1]==' ':
                            s = s[1:]
                        swapped[run_swa][1].append(s)
                    return_df['patterns'][i].append((4, swapped[run_swa]))
                    run_swa+=1
    return_df['return_tuples']=None
    for j in range(len(return_df)):
        acts=return_df.activities[j]
        pats=return_df.patterns[j]
        ali=return_df.alignment[j]['alignment']
        return_tuples=[]
        for move in ali:
            if move[0] == '>>':
                ac=move[1]
                for pat in pats:
                    if pat[0] == 1:
                        if pat[1][0]=='XOR':
                            return_tuples.append((str('XOR ['+','.join(pat[1][1:])+']'), 'skip'))
                        else:
                            return_tuples.append((pat[1], 'skip'))
                    elif pat[0] == 3:
                        if ac in pat[1][0]:
                            return_tuples.append((ac, 'repl_miss'))
                    
            elif move[1] ==move[0]:
                mover=False
                ac=move[1]
                for pat in pats:
                    if pat[0] == 4:
                        if ac in pat[1][0]:
                            return_tuples.append((ac, 'swap_1'))
                            mover=True
                        elif ac in pat[1][1]:
                            return_tuples.append((ac, 'swap_1'))
                            mover=True
                if not mover:
                    return_tuples.append((ac, 'sync'))
            elif move[1] == '>>':
                ac=move[0]
                for pat in pats:
                    if pat[0] == 2:
                        if ac in pat[1]:
                            return_tuples.append((ac, 'repeat'))
                    elif pat[0] == 3:
                        if ac in pat[1][1]:
                            return_tuples.append((ac, 'repl_add'))
                    elif pat[0] == 4:
                        if ac in pat[1][0]:
                            return_tuples.append((ac, 'swap_2'))
                        if ac in pat[1][1]:
                            return_tuples.append((ac, 'swap_2'))
        return_df['return_tuples'][j] = return_tuples
    return_df['patterns_text'] = None

    for i, row in return_df.iterrows():
        patterns_text = []
        for dtype, acts in row["patterns"]:
            if dtype == 0:
                patterns_text.append(f"Insert: [{', '.join(acts)}]")
            elif dtype == 1:
                if acts[0] == 'XOR':
                    patterns_text.append(f"Skipped: XOR [{', '.join(acts[1:])}]")
                else:
                    patterns_text.append(f"Skipped: [{', '.join(acts)}]")
            elif dtype == 2:
                patterns_text.append(f"Repeated: [{', '.join(acts)}]")
            elif dtype == 3:
                patterns_text.append(f"Replaced: [{', '.join(acts[0])}] BY [{', '.join(acts[1])}]")
            elif dtype == 4:
                patterns_text.append(f"Swapped: [{', '.join(acts[0])}] WITH [{', '.join(acts[1])}]")
        
        if not patterns_text==[]:
            return_df.at[i, 'patterns_text'] = patterns_text
        else:
            return_df.at[i, 'patterns_text'] = 'Conform'
    
    return return_df




def get_upload(log_file, bpmn_file):


    log = log_file
    net, initial_marking, final_marking = bpmn_converter.apply(bpmn_file)
    pm4py.view_petri_net(net, initial_marking, final_marking)
    return_df = generate_diagnostics(log, net, initial_marking, final_marking)

    result = []


    # Initialize summary dict
    deviation_summary = {
        "insert": {"count": 0, "entries": []},
        "miss": {"count": 0, "entries": []},
        "repeat": {"count": 0, "entries": []},
        "repl": {"count": 0, "entries": []},
        "swap": {"count": 0, "entries": []}
    }

    # Populate it
    for i, row in return_df.iterrows():
        variant_name = f"variant_{i + 1}"
        for act, dtype in row["return_tuples"]:
            if dtype in ["miss", "repeat", "insert"]:
                deviation_summary[dtype]["count"] += 1
                deviation_summary[dtype]["entries"].append({
                    "activity": act if isinstance(act, str) else ','.join(act),
                    "variant": variant_name
                })
            elif dtype.startswith("swap_"):
                deviation_summary["swap"]["count"] += 1
                deviation_summary["swap"]["entries"].append({
                    "activity": act,
                    "variant": variant_name
                })
            elif dtype.startswith("repl_"):
                deviation_summary["swap"]["count"] += 1
                deviation_summary["swap"]["entries"].append({
                    "activity": act,
                    "variant": variant_name
                })
    # Initialize summary dict
    deviation_summary = {
        "conform": {"count": 0},
        "deviating": {"count": 0},
        "insert": {"count": 0, "entries": []},
        "miss": {"count": 0, "entries": []},
        "repeat": {"count": 0, "entries": []},
        "repl": {"count": 0, "entries": []},
        "swap": {"count": 0, "entries": []}
    }

    map_dtypes={0:"insert",
        1:"miss",
        2:"repeat",
        3:"repl",
        4:"swap"}

    # Track seen (deviation_type, acts) as key
    seen_deviations = {}

    # Populate it
    for i, row in return_df.iterrows():
        variant_name = f"variant_{i + 1}"
        if row["patterns"] is None or row["patterns"] == []:
            deviation_summary["conform"]["count"] += 1
        else:
            deviation_summary["deviating"]["count"] += 1
        for dtype, acts in row["patterns"]:
            dtype_str = map_dtypes[dtype]
            deviation_summary[dtype_str]["count"] += 1
            key = (dtype_str, tuple(map(str, acts)) if isinstance(acts, list) else str(acts))
            
            if key not in seen_deviations:
                entry = {
                    "activity": acts,
                    "count": row["count"]
                }
                deviation_summary[dtype_str]["entries"].append(entry)
                seen_deviations[key] = entry
            else:
                seen_deviations[key]["count"] += row["count"]
    for e in deviation_summary['insert']['entries']:
        e['activity'] = f"Insert: [{', '.join(e['activity'])}]"
    for e in deviation_summary['miss']['entries']:
        if e['activity'][0] == 'XOR':
            e['activity'] = f"Skipped: XOR [{', '.join(e['activity'][1:])}]"
        else:
            e['activity'] = f"Skipped: [{', '.join(e['activity'])}]"
    for e in deviation_summary['repeat']['entries']:
        e['activity'] = f"Repeated: [{', '.join(e['activity'])}]" 

    for e in deviation_summary['repl']['entries']:
        e['activity'] = f"Replaced: [{', '.join(e['activity'][0])}] BY [{', '.join(e['activity'][1])}]" 
    for e in deviation_summary['swap']['entries']:
        e['activity'] = f"Swapped: [{', '.join(e['activity'][0])}] WITH [{', '.join(e['activity'][1])}]" 
    bpmn_xml_str = export_bpmn_to_string(bpmn_file)
    print(bpmn_xml_str)
            

    for i, row in return_df.iterrows():
        result.append({
            "variant": f"variant_{i + 1}",
            "activities": row["activities"],
            "count": int(row["count"]),
            "averageCycleTime": round(float(row["avg_cycle_time"]), 2),
            "alignment": row["return_tuples"],
            "pattern_text": row["patterns_text"]
        })
    
    return {
        "variants": result,
        "deviationSummary": deviation_summary,
        "bpmnXml": bpmn_xml_str
    }
