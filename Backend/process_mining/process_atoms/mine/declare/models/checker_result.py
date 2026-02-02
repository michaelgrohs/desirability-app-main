class CheckerResult:
    def __init__(
        self, num_fulfillments, num_violations, num_pendings, num_activations, state
    ):
        self.num_fulfillments = num_fulfillments
        self.num_violations = num_violations
        self.num_pendings = num_pendings
        self.num_activations = num_activations
        self.state = state

    def __repr__(self):
        return (
            str(self.num_fulfillments)
            + " "
            + str(self.num_violations)
            + " "
            + str(self.num_pendings)
            + " "
            + str(self.num_activations)
            + " "
            + self.state
        )
