from process_atoms.models import petri


def playout_net(net, initial_marking, final_marking):
    log = petri.net_variants(net, initial_marking, final_marking)
    print(f"\tTraces computed: {len(log)}")
    log = filter_irrelevant_labels(log)
    case_id = 1
    for trace in log:
        trace.attributes["concept:name"] = "c" + str(case_id)
        case_id += 1
    return log


def filter_irrelevant_labels(log):
    cleaned_log = list()
    for trace in log:
        new_trace = list(
            [event for event in trace if is_relevant_label(event["concept:name"])]
        )
        if len(new_trace) > 0:
            cleaned_log.append(new_trace)
    return cleaned_log


def is_relevant_label(task_name):
    terms = {"Message"}
    if task_name is None:
        return False
    if task_name == "":
        return False
    if task_name.isnumeric():
        return False
    if task_name in terms:
        return False
    if "Gateway" in task_name:
        return False
    if task_name.startswith("EventSubprocess") or task_name.startswith("Subprocess"):
        return False
    return True
