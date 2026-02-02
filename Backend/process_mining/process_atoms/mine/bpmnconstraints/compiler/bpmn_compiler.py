from itertools import combinations

from process_atoms.mine.bpmnconstraints.templates.declare_templates import Declare
from process_atoms.mine.bpmnconstraints.templates.matching_templates import Signal
from process_atoms.mine.bpmnconstraints.utils.constants import (
    ALLOWED_ACTIVITIES,
    ALLOWED_END_EVENTS,
    ALLOWED_GATEWAYS,
    ALLOWED_START_EVENTS,
    AND_GATEWAY,
    GATEWAY_NAMES,
    OR_GATEWAY,
    XOR_GATEWAY,
)


class Compiler:
    def __init__(self, sequence, transitivity, skip_named_gateways) -> None:
        self.sequence = sequence
        self.transitivity = transitivity
        self.declare = Declare()
        self.signal = Signal()
        self.concurrent = True
        self.compiled_sequence = []
        self.cfo = None
        self.skip_named_gateways = skip_named_gateways

    def run(self):
        if self.sequence:
            for cfo in self.sequence:
                self.cfo = cfo
                self.__compile()
        return self.compiled_sequence

    def __compile(self):
        if self.__cfo_is_start():
            self.__create_init_constraint()
        if self.__cfo_is_end():
            self.__create_end_constraint()

        if self.__is_activity():
            self.__create_succession_constraint()

        elif self.__is_gateway():
            if self.__cfo_is_splitting():
                self._create_gateway_constraints()
                self.__create_precedence_constraint()

            if self.__cfo_is_joining():
                if not self.__cfo_is_end():
                    self.__create_response_constraint()

    def _create_gateway_constraints(self):
        if self.__get_cfo_type() in XOR_GATEWAY:
            self.__create_exclusive_choice_constraint()

        if self.__get_cfo_type() == AND_GATEWAY:
            self.__create_parallel_gateway_constraint()
            self.concurrent = True

        if self.__get_cfo_type() == OR_GATEWAY:
            self.__create_inclusive_choice_constraint()

    def __create_succession_constraint(self):
        name = self.__get_cfo_name()
        id = self.__get_cfo_id()
        successors = self.__get_cfo_successors()
        for successor in successors:
            if self.__get_cfo_type(successor) in ALLOWED_GATEWAYS:
                if self.__get_cfo_gateway_successors(successor):
                    successors.extend(self.__get_cfo_gateway_successors(successor))
        if self.transitivity:
            try:
                transitivity = self.__get_cfo_transitivity()
                transitivity = [x for x in transitivity if not self.__is_gateway(x)]
                successors.extend(transitivity)
            except Exception:
                pass

        for successor in successors:
            if self.__get_cfo_type(successor) in ALLOWED_END_EVENTS:
                continue
            successor_name = self.__get_cfo_name(successor)
            successor_id = self.__get_cfo_id(successor)

            if successor_name in ALLOWED_GATEWAYS:
                continue

            if self.skip_named_gateways and successor["type"] in ALLOWED_GATEWAYS:
                continue

            if not self.__is_valid_name(successor_name) or not self.__is_valid_name(
                name
            ):
                continue

            if not successor.get("gateway successor"):
                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{name} leads to {successor_name}",
                        signal=self.signal.succession(name, successor_name),
                        declare=self.declare.succession(name, successor_name),
                        op_ids=[id, successor_id],
                    )
                )

                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{name} and {successor_name}",
                        signal=self.signal.co_existence(name, successor_name),
                        declare=self.declare.co_existence(name, successor_name),
                        op_ids=[id, successor_id],
                    )
                )

                if "is in gateway" not in self.cfo:
                    self.compiled_sequence.append(
                        self.__create_constraint_object(
                            description=f"{name} or {successor_name}",
                            signal=self.signal.choice(name, successor_name),
                            declare=self.declare.choice(name, successor_name),
                            op_ids=[id, successor_id],
                        )
                    )

                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{name} leads to (with loops) {successor_name}",
                        signal=self.signal.alternate_succession(name, successor_name),
                        declare=self.declare.alternate_succession(name, successor_name),
                        op_ids=[id, successor_id],
                    )
                )

    def __create_precedence_constraint(self):
        successors = self.__get_cfo_successors()
        predecessors = self.__get_cfo_predecessors()

        for successor in successors:
            if self.__get_cfo_type(successor) in ALLOWED_GATEWAYS:
                if self.__get_cfo_gateway_successors(successor):
                    successors.extend(self.__get_cfo_gateway_successors(successor))

        for successor in successors:
            successor_name = self.__get_cfo_name(successor)
            successor_id = self.__get_cfo_id(successor)
            if self.__get_cfo_type(successor) in ALLOWED_GATEWAYS:
                continue

            if not self.__is_valid_name(successor_name):
                continue

            for predecessor in predecessors:
                predecessor_name = self.__get_cfo_name(predecessor)
                predecessor_id = self.__get_cfo_id(predecessor)
                if self.__get_cfo_type(predecessor) in ALLOWED_GATEWAYS:
                    continue

                if not self.__is_valid_name(predecessor_name):
                    continue

                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{predecessor_name} precedes {successor_name}",
                        signal=self.signal.precedence(predecessor_name, successor_name),
                        declare=self.declare.precedence(
                            predecessor_name, successor_name
                        ),
                        op_ids=[predecessor_id, successor_id],
                    )
                )

                if self.concurrent:
                    self.compiled_sequence.append(
                        self.__create_constraint_object(
                            description=f"{predecessor_name} precedes {successor_name}",
                            signal=self.signal.alternate_precedence(
                                predecessor_name, successor_name
                            ),
                            declare=self.declare.alternate_precedence(
                                predecessor_name, successor_name
                            ),
                            op_ids=[predecessor_id, successor_id],
                        )
                    )

    def __is_valid_name(self, name):
        if name in ALLOWED_START_EVENTS:
            return False
        if name in ALLOWED_END_EVENTS:
            return False
        if name in ALLOWED_GATEWAYS:
            return False
        if name in GATEWAY_NAMES:
            return False
        return True

    def __cfo_is_start(self, cfo=None):
        if cfo:
            return cfo.get("is start")
        return self.cfo.get("is start")

    def __cfo_is_end(self, cfo=None):
        if cfo:
            return cfo.get("is end")
        return self.cfo.get("is end")

    def __cfo_is_splitting(self, cfo=None):
        if cfo:
            return cfo.get("splitting")
        return self.cfo.get("splitting")

    def __cfo_is_joining(self, cfo=None):
        if cfo:
            return cfo.get("joining")
        return self.cfo.get("joining")

    def __get_cfo_type(self, cfo=None):
        if cfo:
            return cfo.get("type")
        return self.cfo.get("type")

    def __get_cfo_successors(self, cfo=None):
        if cfo:
            return cfo.get("successor")
        return self.cfo.get("successor")

    def __get_cfo_predecessors(self, cfo=None):
        if cfo:
            return cfo.get("predecessor")
        return self.cfo.get("predecessor")

    def __get_cfo_transitivity(self, cfo=None):
        if cfo:
            return cfo.get("transitivity")
        return self.cfo.get("transitivity")

    def __get_cfo_gateway_successors(self, cfo=None):
        if cfo:
            return cfo.get("gateway successors")
        return self.cfo.get("gateway successors")

    def __create_response_constraint(self):
        successors = self.__get_cfo_successors()
        predecessors = self.__get_cfo_predecessors()

        for successor in successors:
            if self.__get_cfo_type(successor) in ALLOWED_GATEWAYS:
                if self.__get_cfo_gateway_successors(successor):
                    successors.extend(self.__get_cfo_gateway_successors(successor))

        for predecessor in predecessors:
            predecessor_name = self.__get_cfo_name(predecessor)
            predecessor_id = self.__get_cfo_id(predecessor)
            if not self.__is_valid_name(predecessor_name):
                continue

            if self.__get_cfo_type(predecessor) in ALLOWED_GATEWAYS:
                continue

            for successor in successors:
                successor_name = self.__get_cfo_name(successor)
                successor_id = self.__get_cfo_id(successor)
                if not self.__is_valid_name(successor_name):
                    continue

                if self.__get_cfo_type(successor) in ALLOWED_GATEWAYS:
                    continue

                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{predecessor_name} responds to {successor_name}",
                        signal=self.signal.response(predecessor_name, successor_name),
                        declare=self.declare.response(predecessor_name, successor_name),
                        op_ids=[predecessor_id, successor_id],
                    )
                )

                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{predecessor_name} responds to {successor_name}",
                        signal=self.signal.alternate_response(
                            predecessor_name, successor_name
                        ),
                        declare=self.declare.alternate_response(
                            predecessor_name, successor_name
                        ),
                        op_ids=[predecessor_id, successor_id],
                    )
                )

    def __create_init_constraint(self):
        if self.__is_gateway():
            self.cfo.update({"discard": True})

        name = self.__get_cfo_name()
        id = self.__get_cfo_id()
        self.compiled_sequence.append(
            self.__create_constraint_object(
                description=f"starts with {name}",
                signal=self.signal.init(name),
                declare=self.declare.init(name),
                op_ids=[id],
            )
        )

    def __create_end_constraint(self):
        name = self.__get_cfo_name()
        id = self.__get_cfo_id()

        if not self.__is_valid_name(name):
            return

        self.compiled_sequence.append(
            self.__create_constraint_object(
                description=f"ends with {name}",
                signal=self.signal.end(name),
                declare=self.declare.end(name),
                op_ids=[id],
            )
        )

    def __create_exclusive_choice_constraint(self):
        successors = self.__get_cfo_successors()
        for successor in successors:
            if self.__get_cfo_type(successor) in ALLOWED_GATEWAYS:
                if self.__get_cfo_gateway_successors(successor):
                    successors.extend(self.__get_cfo_gateway_successors(successor))

        if successors:
            successor_ids_to_names = [
                (self.__get_cfo_id(successor), self.__get_cfo_name(successor))
                for successor in successors
            ]
            successor_ids = [self.__get_cfo_id(successor) for successor in successors]
            successors = [self.__get_cfo_name(successor) for successor in successors]

            for split in combinations(successor_ids_to_names, 2):
                if not self.__is_valid_name(split[0][1]) or not self.__is_valid_name(
                    split[1][1]
                ):
                    continue
                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{split[0][1]} xor {split[1][1]}",
                        signal=self.signal.exclusive_choice(split[0][1], split[1][1]),
                        declare=self.declare.exclusive_choice(split[0][1], split[1][1]),
                        op_ids=[split[0][0], split[1][0]],
                    )
                )
                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{split[0][1]} or {split[1][1]}",
                        signal=self.signal.choice(split[0][1], split[1][1]),
                        declare=self.declare.choice(split[0][1], split[1][1]),
                        op_ids=[split[0][0], split[1][0]],
                    )
                )

                predecessors = self.__get_cfo_predecessors()
                if predecessors:
                    for predecessor in predecessors:
                        predecessor_name = self.__get_cfo_name(predecessor)
                        predecessor_id = self.__get_cfo_id(predecessor)
                        for i, successor in enumerate(successors):
                            if not self.__is_valid_name(
                                predecessor_name
                            ) or not self.__is_valid_name(successor):
                                continue
                            self.compiled_sequence.append(
                                self.__create_constraint_object(
                                    description=f"{predecessor_name} or {successor}",
                                    signal=self.signal.choice(
                                        predecessor_name, successor
                                    ),
                                    declare=self.declare.choice(
                                        predecessor_name, successor
                                    ),
                                    op_ids=[predecessor_id, successor_ids[i]],
                                )
                            )

    def __create_parallel_gateway_constraint(self):
        successors = self.__get_cfo_successors()
        for successor in successors:
            if self.__get_cfo_type(successor) in ALLOWED_GATEWAYS:
                if self.__get_cfo_gateway_successors(successor):
                    successors.extend(self.__get_cfo_gateway_successors(successor))

        if successors:
            successor_ids_to_names = [
                (self.__get_cfo_id(successor), self.__get_cfo_name(successor))
                for successor in successors
            ]
            successors = [self.__get_cfo_name(successor) for successor in successors]
            for split in combinations(successor_ids_to_names, 2):
                if not self.__is_valid_name(split[0][1]) or not self.__is_valid_name(
                    split[1][1]
                ):
                    continue
                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{split[0][1]} and {split[1][1]}",
                        signal=self.signal.co_existence(split[0][1], split[1][1]),
                        declare=self.declare.co_existence(split[0][1], split[1][1]),
                        op_ids=[split[0][0], split[1][0]],
                    )
                )

    def __create_inclusive_choice_constraint(self):
        successors = self.__get_cfo_successors()
        for successor in successors:
            if self.__get_cfo_type(successor) in ALLOWED_GATEWAYS:
                if self.__get_cfo_gateway_successors(successor):
                    successors.extend(self.__get_cfo_gateway_successors(successor))

        if successors:
            successor_ids_to_names = [
                (self.__get_cfo_id(successor), self.__get_cfo_name(successor))
                for successor in successors
            ]
            successor_ids = [self.__get_cfo_id(successor) for successor in successors]
            successors = [self.__get_cfo_name(successor) for successor in successors]
            for split in combinations(successor_ids_to_names, 2):
                if not self.__is_valid_name(split[0][1]) or not self.__is_valid_name(
                    split[1][1]
                ):
                    continue
                self.compiled_sequence.append(
                    self.__create_constraint_object(
                        description=f"{split[0][1]} or {split[1][1]}",
                        signal=self.signal.choice(split[0][1], split[1][1]),
                        declare=self.declare.choice(split[0][1], split[1][1]),
                        op_ids=[split[0][0], split[1][0]],
                    )
                )

            predecessors = self.__get_cfo_predecessors()
            if predecessors:
                for predecessor in predecessors:
                    predecessor_name = self.__get_cfo_name(predecessor)
                    predecessor_id = self.__get_cfo_id(predecessor)
                    for i, successor in enumerate(successors):
                        if not self.__is_valid_name(
                            predecessor_name
                        ) or not self.__is_valid_name(successor):
                            continue
                        self.compiled_sequence.append(
                            self.__create_constraint_object(
                                description=f"{predecessor_name} or {successor}",
                                signal=self.signal.choice(predecessor_name, successor),
                                declare=self.declare.choice(
                                    predecessor_name, successor
                                ),
                                op_ids=[predecessor_id, successor_ids[i]],
                            )
                        )

    def __get_cfo_id(self, cfo=None):
        if cfo:
            id = cfo.get("id")
        else:
            id = self.cfo.get("id")
        if not id:
            return self.__get_cfo_type(cfo)
        return id

    def __get_cfo_name(self, cfo=None):
        if cfo:
            name = cfo.get("name")
        else:
            name = self.cfo.get("name")

        if not name or name == " ":
            if cfo:
                return self.__get_cfo_type(cfo)
            return self.__get_cfo_type()
        return name

    def __is_activity(self, cfo=None):
        if cfo:
            cfo_type = cfo.get("type")
        else:
            cfo_type = self.__get_cfo_type()
        if cfo_type:
            return cfo_type in ALLOWED_ACTIVITIES
        return False

    def __is_gateway(self, cfo=None):
        if cfo:
            cfo_type = cfo.get("type")
        else:
            cfo_type = self.__get_cfo_type()
        if cfo_type:
            return cfo_type in ALLOWED_GATEWAYS
        return False

    def __create_constraint_object(self, description, signal, declare, op_ids=None):
        return {
            "description": description,
            "SIGNAL": signal,
            "DECLARE": declare,
            "OPERAND_IDS": op_ids,
        }
