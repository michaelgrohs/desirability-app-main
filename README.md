# Tool for Deviation Desirability Assessment

## About
This repository contains the implementation of the deviation desirability framework, presented originally at the ICPM Workshops 2025 by Grohs, Monashev, and Rebmann.
It provides an interactive web-based tool for performing impact evaluation of process deviations on arbitrary event data, allowing users to engage with the idea of deviation desirability assessment.

The tool supports three conformance checking modes:
- **BPMN / Petri net** — alignment-based deviation detection from a BPMN or PNML model + XES log
- **Declarative (mine)** — automatically mines Declare constraints from the XES log using ProcessAtoms
- **Declarative (model)** — checks conformance against an uploaded `.decl` file using Declare4Py

### Built with

**Backend**
* ![python](https://img.shields.io/badge/python-3.10-blue?logo=python)
* [Flask](https://flask.palletsprojects.com/) — REST API server
* [pm4py](https://processintelligence.solutions/pm4py) — process log handling and conformance checking
* [DoWhy](https://py-why.github.io/dowhy/) — causal inference
* [scikit-learn](https://scikit-learn.org/) — decision-tree-based root cause investigation

**Frontend**
* ![typescript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
* [React](https://react.dev/) + [Material UI](https://mui.com/) — UI framework
* [bpmn-js](https://bpmn.io/toolkit/bpmn-js/) — BPMN diagram rendering
* [Recharts](https://recharts.org/) / [Plotly](https://plotly.com/javascript/) — charts and visualizations

## User Guide: Running the tool

### 1. Start the backend
```bash
cd Backend
pip install -r requirements.txt   # only once
python app.py
```
The backend runs on `http://localhost:1904`.

### 2. Start the frontend
```bash
cd Frontend
npm install   # only once
npm start
```
The frontend runs on `http://localhost:3000` and proxies API calls to the backend automatically.

### 3. Workflow
1. Upload an event log (XES) and a process model (BPMN, PNML, or `.decl`), or mine constraints directly from the log.
2. Review the computed deviation matrix and select deviations to investigate.
3. Configure impact dimensions (existing attributes, formula-based, or rule-based conditions).
4. Inspect the criticality matrix and prioritized deviation list.
5. Explore root cause analysis and correlation overviews in the Recommendations view.

Sample event log–process model pairs are provided in `Backend/uploads/`.
