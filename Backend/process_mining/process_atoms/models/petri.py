# TODO rebuild this for our purposes
import random
import time
from collections import Counter
from copy import copy, deepcopy
from typing import Collection, Optional, Set


class Marking(Counter):
    pass

    def __hash__(self):
        return frozenset(self).__hash__()

    def __eq__(self, other):
        if not self.keys() == other.keys():
            return False
        for p in self.keys():
            if other.get(p) != self.get(p):
                return False
        return True

    def __le__(self, other):
        if not self.keys() <= other.keys():
            return False
        for p in self.keys():
            if other.get(p) < self.get(p):
                return False
        return True

    def __add__(self, other):
        m = Marking()
        for p in self.items():
            m[p[0]] = p[1]
        for p in other.items():
            m[p[0]] += p[1]
        return m

    def __sub__(self, other):
        m = Marking()
        for p in self.items():
            m[p[0]] = p[1]
        for p in other.items():
            m[p[0]] -= p[1]
            if m[p[0]] == 0:
                del m[p[0]]
        return m

    def __repr__(self):
        return str(
            [
                str(p.name) + ":" + str(self.get(p))
                for p in sorted(list(self.keys()), key=lambda x: x.name)
            ]
        )

    def __str__(self):
        return self.__repr__()

    def __deepcopy__(self, memodict={}):
        marking = Marking()
        memodict[id(self)] = marking
        for place in self:
            place_occ = self[place]
            new_place = (
                memodict[id(place)] if id(place) in memodict else Place(place.name)
            )
            marking[new_place] = place_occ
        return marking


class Place(object):
    def __init__(self, name, label=None, in_arcs=None, out_arcs=None):
        self.name = name
        self.label = None if label is None else label
        self.in_arcs = set() if in_arcs is None else in_arcs
        self.out_arcs = set() if out_arcs is None else out_arcs

    def __repr__(self):
        return str(self.name)

    def __str__(self):
        return self.__repr__()

    def __eq__(self, other):
        # keep the ID for now in places
        return id(self) == id(other)

    def __hash__(self):
        # keep the ID for now in places
        return id(self)

    def __deepcopy__(self, memodict={}):
        if id(self) in memodict:
            return memodict[id(self)]
        new_place = PetriNet.Place(self.name, self.label)
        memodict[id(self)] = new_place
        for arc in self.in_arcs:
            new_arc = deepcopy(arc, memo=memodict)
            new_place.in_arcs.add(new_arc)
        for arc in self.out_arcs:
            new_arc = deepcopy(arc, memo=memodict)
            new_place.out_arcs.add(new_arc)
        return new_place


class Transition(object):
    def __init__(self, name, label=None, in_arcs=None, out_arcs=None):
        self.name = name
        self.label = None if label is None else label
        self.in_arcs = set() if in_arcs is None else in_arcs
        self.out_arcs = set() if out_arcs is None else out_arcs

    def __repr__(self):
        if self.label is None:
            return "(" + str(self.name) + ", None)"
        else:
            return "(" + str(self.name) + ", '" + str(self.label) + "')"

    def __str__(self):
        return self.__repr__()

    def __eq__(self, other):
        # keep the ID for now in transitions
        return id(self) == id(other)

    def __hash__(self):
        # keep the ID for now in transitions
        return id(self)

    def __deepcopy__(self, memodict={}):
        if id(self) in memodict:
            return memodict[id(self)]
        new_trans = Transition(self.name, self.label)
        memodict[id(self)] = new_trans
        for arc in self.in_arcs:
            new_arc = deepcopy(arc, memo=memodict)
            new_trans.in_arcs.add(new_arc)
        for arc in self.out_arcs:
            new_arc = deepcopy(arc, memo=memodict)
            new_trans.out_arcs.add(new_arc)
        return new_trans


class Arc(object):
    def __init__(self, source, target, weight=1):
        if type(source) is type(target):
            raise Exception("source and target must be different types")
        self.source = source
        self.target = target
        self.weight = weight

    def __repr__(self):
        source_rep = repr(self.source)
        target_rep = repr(self.target)
        return source_rep + "->" + target_rep

    def __str__(self):
        return self.__repr__()

    def __hash__(self):
        return id(self)

    def __eq__(self, other):
        return self.source == other.source and self.target == other.target

    def __deepcopy__(self, memodict={}):
        if id(self) in memodict:
            return memodict[id(self)]
        new_source = (
            memodict[id(self.source)]
            if id(self.source) in memodict
            else deepcopy(self.source, memo=memodict)
        )
        new_target = (
            memodict[id(self.target)]
            if id(self.target) in memodict
            else deepcopy(self.target, memo=memodict)
        )
        memodict[id(self.source)] = new_source
        memodict[id(self.target)] = new_target
        new_arc = PetriNet.Arc(new_source, new_target, weight=self.weight)
        memodict[id(self)] = new_arc
        return new_arc


class PetriNet(object):
    def __init__(
        self,
        name: str = None,
        places: Collection[Place] = None,
        transitions: Collection[Transition] = None,
        arcs: Collection[Arc] = None,
    ):
        self.name = "" if name is None else name
        self.places = set() if places is None else places
        self.transitions = set() if transitions is None else transitions
        self.arcs = set() if arcs is None else arcs

    def __hash__(self):
        ret = 0
        for p in self.places:
            ret += hash(p)
            ret = ret % 479001599
        for t in self.transitions:
            ret += hash(t)
            ret = ret % 479001599
        return ret

    def __eq__(self, other):
        # for the Petri net equality keep the ID for now
        return id(self) == id(other)

    def __repr__(self):
        ret = ["places: ["]
        places_rep = []
        for place in self.places:
            places_rep.append(repr(place))
        places_rep.sort()
        ret.append(" " + ", ".join(places_rep) + " ")
        ret.append("]\ntransitions: [")
        trans_rep = []
        for trans in self.transitions:
            trans_rep.append(repr(trans))
        trans_rep.sort()
        ret.append(" " + ", ".join(trans_rep) + " ")
        ret.append("]\narcs: [")
        arcs_rep = []
        for arc in self.arcs:
            arcs_rep.append(repr(arc))
        arcs_rep.sort()
        ret.append(" " + ", ".join(arcs_rep) + " ")
        ret.append("]")
        return "".join(ret)

    def __str__(self):
        return self.__repr__()


def pre_set(elem) -> Set:
    pre = set()
    for a in elem.in_arcs:
        pre.add(a.source)
    return pre


def post_set(elem) -> Set:
    post = set()
    for a in elem.out_arcs:
        post.add(a.target)
    return post


def remove_transition(net: PetriNet, trans: Transition) -> PetriNet:
    if trans in net.transitions:
        in_arcs = trans.in_arcs
        for arc in in_arcs:
            place = arc.source
            place.out_arcs.remove(arc)
            net.arcs.remove(arc)
        out_arcs = trans.out_arcs
        for arc in out_arcs:
            place = arc.target
            place.in_arcs.remove(arc)
            net.arcs.remove(arc)
        net.transitions.remove(trans)
    return net


def add_place(net: PetriNet, name=None) -> Place:
    name = (
        name
        if name is not None
        else "p_"
        + str(len(net.places))
        + "_"
        + str(time.time())
        + str(random.randint(0, 10000))
    )
    p = PetriNet.Place(name=name)
    net.places.add(p)
    return p


def add_transition(net: PetriNet, name=None, label=None) -> Transition:
    name = (
        name
        if name is not None
        else "t_"
        + str(len(net.transitions))
        + "_"
        + str(time.time())
        + str(random.randint(0, 10000))
    )
    t = PetriNet.Transition(name=name, label=label)
    net.transitions.add(t)
    return t


def merge(trgt: Optional[PetriNet] = None, nets=None) -> PetriNet:
    trgt = trgt if trgt is not None else PetriNet()
    nets = nets if nets is not None else list()
    for net in nets:
        trgt.transitions.update(net.transitions)
        trgt.places.update(net.places)
        trgt.arcs.update(net.arcs)
    return trgt


def remove_place(net: PetriNet, place: Place) -> PetriNet:
    if place in net.places:
        in_arcs = place.in_arcs
        for arc in in_arcs:
            trans = arc.source
            trans.out_arcs.remove(arc)
            net.arcs.remove(arc)
        out_arcs = place.out_arcs
        for arc in out_arcs:
            trans = arc.target
            trans.in_arcs.remove(arc)
            net.arcs.remove(arc)
        net.places.remove(place)
    return net


def add_arc_from_to(fr, to, net: PetriNet, weight=1) -> Arc:
    a = Arc(fr, to, weight)
    net.arcs.add(a)
    fr.out_arcs.add(a)
    to.in_arcs.add(a)

    return a


def net_variants(net, initial_marking, final_marking, time_out=1, max_loop=3):
    """
    Given a WF net, initial and final marking extracts a set of variants (in the form of traces).

    Parameters
    ----------
    :param net: A workflow net
    :param initial_marking: The initial marking of the net.
    :param final_marking: The final marking of the net.
    :param time_out: The maximum time to execute the algorithm (in case of loops ensures termination).

    Returns
    -------
    :return: variants: :class:`list` Set of variants - in the form of Trace objects - obtainable executing the net

    """
    active = {(initial_marking, (), ())}
    variants = set()
    start_time = time.time()
    while active:
        curr_marking, curr_partial_trace, current_ids = active.pop()
        curr_triple = (curr_marking, curr_partial_trace, current_ids)
        enabled_transitions = get_enabled_transitions(net, curr_marking)
        for transition in enabled_transitions:
            counter_ids = Counter(current_ids)

            if counter_ids[transition.name] >= max_loop:
                continue

            next_marking = execute(transition, net, curr_marking)
            if transition.label is not None:
                next_partial_trace = curr_partial_trace + (transition.label,)
            else:
                next_partial_trace = curr_partial_trace
            next_ids = current_ids + (transition.name,)
            next_triple = (next_marking, next_partial_trace, next_ids)

            if next_marking == final_marking:
                variants.add(next_partial_trace)
            else:
                # if the next marking+partial trace is different from the current one+partial trace
                if curr_triple != next_triple:
                    active.add(next_triple)
        if time.time() - start_time > time_out:
            return variants
    return variants


def remove_arc(net: PetriNet, arc: Arc) -> PetriNet:
    net.arcs.remove(arc)
    arc.source.out_arcs.remove(arc)
    arc.target.in_arcs.remove(arc)
    return net


def is_enabled(t, pn, m):
    if t not in pn.transitions:
        return False
    else:
        for a in t.in_arcs:
            if m[a.source] < a.weight:
                return False
    return True


def execute(t, pn, m):
    if not is_enabled(t, pn, m):
        return None

    m_out = copy(m)
    for a in t.in_arcs:
        m_out[a.source] -= a.weight
        if m_out[a.source] == 0:
            del m_out[a.source]

    for a in t.out_arcs:
        m_out[a.target] += a.weight
    return m_out


def get_enabled_transitions(pn, m):
    enabled = set()
    for t in pn.transitions:
        if is_enabled(t, pn, m):
            enabled.add(t)
    return enabled
