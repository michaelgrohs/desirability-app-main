import os
import pm4py
from pm4py.objects.petri_net.obj import Marking
from pm4py.algo.analysis.woflan import algorithm as check_soundness  # Optional

def parse_bpmn(model_path, check_wf=False):
    """Converts a BPMN or PNML file to a Petri net and optionally checks soundness."""
    try:
        ext = os.path.splitext(model_path)[1].lower()

        if ext == '.pnml':
            petri_net, im, fm = pm4py.read_pnml(model_path)
            if fm is None:
                sink_places = [p for p in petri_net.places if len(p.out_arcs) == 0]
                fm = Marking({p: 1 for p in sink_places})
            if im is None:
                source_places = [p for p in petri_net.places if len(p.in_arcs) == 0]
                im = Marking({p: 1 for p in source_places})
        else:
            bpmn_model = pm4py.read_bpmn(model_path)
            petri_net, im, fm = pm4py.convert_to_petri_net(bpmn_model)

        if not petri_net or not im or not fm:
            return {"error": "Failed to load process model as Petri net"}

        # If check_wf is True, check soundness
        if check_wf:
            soundness_result = check_soundness.apply(petri_net, im, fm)
            if not soundness_result.get("sound", False):
                return {"error": "The model does not result in a sound Petri net"}

        return {
            "description": "Process model loaded successfully",
            "num_places": len(petri_net.places),
            "num_transitions": len(petri_net.transitions),
            "num_arcs": len(petri_net.arcs),
            "soundness_checked": check_wf
        }

    except Exception as e:
        return {"error": str(e)}




