import pm4py
from pm4py.algo.analysis.woflan import algorithm as check_soundness  # Optional

def parse_bpmn(bpmn_path, check_wf=False):
    """Converts BPMN file to a Petri net and optionally checks soundness."""
    try:
        # Read BPMN
        bpmn_model = pm4py.read_bpmn(bpmn_path)
        
        # Convert to Petri net
        petri_net, im, fm = pm4py.convert_to_petri_net(bpmn_model)

        if not petri_net or not im or not fm:
            return {"error": "Failed to convert BPMN to Petri net"}

        # If check_wf is True, check soundness
        if check_wf:
            soundness_result = check_soundness.apply(petri_net, im, fm)
            if not soundness_result.get("sound", False):
                return {"error": "The BPMN model does not result in a sound Petri net"}

        return {
            "description": "BPMN model converted successfully",
            "num_places": len(petri_net.places),
            "num_transitions": len(petri_net.transitions),
            "num_arcs": len(petri_net.arcs),
            "soundness_checked": check_wf
        }

    except Exception as e:
        return {"error": str(e)}




