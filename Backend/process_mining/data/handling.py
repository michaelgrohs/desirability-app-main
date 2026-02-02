import os
import pm4py
import pandas as pd

from pm4py.objects.conversion.log import converter as log_converter
from pm4py.objects.conversion.bpmn import converter as bpmn_converter

 # Returns a path to the file selected by the user
# Input: The folder in which to look for the files - the default is the current folder
def ask_for_path(rel_path='', index = -1):
    #Crawl all files in the input folder
    print("The following files are available in the input folder:\n")
    count = 0
    file_list = os.listdir(os.getcwd() + rel_path)
    for file in file_list:
        print(str(count) + " - " + file)
        count+=1

    if(index == -1):
        #Ask for which of the files shall be transformed and select it.
        inp = input("Please choose from the list above which of the files shall be transformed by typing the corresponding number.")
    else:
        #Automatic iteration
        print('Automatic Iteration.')
        inp = index

    input_file = file_list[int(inp)]

    return (os.getcwd() + rel_path + input_file)

# this function converts a selected file in the path that is the input into a log
def transform_to_log(LOG_PATH):
    log = pd.read_csv(LOG_PATH, parse_dates=["Complete Timestamp"])
    log.columns = [col.replace("(case)", "case:") for col in log.columns]
    log['time:timestamp'] = pd.to_datetime(log['Complete Timestamp'])
    log['case:concept:name'] = log['Case ID']
    log['concept:name'] = log['Activity']
    log = log_converter.apply(log)
    return log

def transform_to_pn(MODEL_PATH):
    bpmn_graph = pm4py.read_bpmn(MODEL_PATH)
    net, initial_marking, final_marking = bpmn_converter.apply(bpmn_graph)
    pm4py.view_petri_net(net, initial_marking, final_marking)
    return net, initial_marking, final_marking

def generate_alignments_adjusted_tracecost_pkl(log, net, initial_marking, final_marking):
    from pm4py.algo.conformance.alignments.petri_net import algorithm as alignments
    from pm4py.algo.conformance.alignments.petri_net import variants
    from pm4py.objects.petri_net.utils import align_utils
    max_events=0
    for trace in log:
        counter=0
        for event in trace:
            counter+=1
        if counter > max_events:
            max_events=counter
    parameters={}
    parameters[alignments.Variants.VERSION_STATE_EQUATION_A_STAR.value.Parameters.PARAM_TRACE_COST_FUNCTION]=list(map(lambda i: align_utils.STD_MODEL_LOG_MOVE_COST-1*i, range(max_events*2)))
    parameters[alignments.Variants.VERSION_STATE_EQUATION_A_STAR.value.Parameters.PARAM_MODEL_COST_FUNCTION]=list(map(lambda i: align_utils.STD_MODEL_LOG_MOVE_COST-10*i, range(max_events*2)))
    aligned_traces = alignments.apply_log(log, net, initial_marking, final_marking, variant=variants.state_equation_a_star, parameters=parameters)
    i = 0
    dev = []
    for trace in log:
        no_moves = len(aligned_traces[i]['alignment'])
        for j in range(0, len(aligned_traces[i]['alignment'])):
            if aligned_traces[i]['alignment'][j][1] == None or aligned_traces[i]['alignment'][j][0] == \
                    aligned_traces[i]['alignment'][j][1]:
                next
            else:
                if not str(aligned_traces[i]['alignment'][j]) in dev:
                    dev.append(str(aligned_traces[i]['alignment'][j]))
                #trace.attributes[str(aligned_traces[i]['alignment'][j])]=1
        i += 1

    return aligned_traces