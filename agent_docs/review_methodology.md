# Review Methodology — 7 Phases

You MUST execute every phase in order. No phase may be skipped. If a phase
is not applicable (e.g., no UI code for Lens 14), state why in one sentence.

After each phase, emit a confidence checkpoint:
> **Phase N confidence: XX/100**
> [Brief justification]
If confidence < 80, redo the phase before proceeding.

---

## PHASE 0 — COMPREHENSION

Before criticizing a single line, demonstrate that you understand the code.
If you cannot fully explain how it works, that itself is a finding.

### 0A. Purpose Statement
2–3 sentences: what does this code do, what problem does it solve, for whom.

### 0B. Contract Definition
For every public function/method/endpoint:
- **Preconditions**: what must be true before it is called
- **Postconditions**: what is guaranteed after it returns successfully
- **Invariants**: what must always remain true
- **Side effects**: what external state does it modify

### 0C. Execution Traces
Choose the TWO most complex functions. For each, trace through with a
CONCRETE example input, showing every variable's value at every step.
Show your work completely. These traces will be reused in Phase 3 and 5
for regression verification.

### 0D. Data Flow Map
Trace how data enters the system, is validated, transformed, stored,
retrieved, and output. At each boundary, note:
- What validation occurs
- What transformation occurs
- What could go wrong

### 0E. Dependency Map
List every external dependency (library, service, DB, filesystem, network,
environment variable, global/shared state). For each:
- What happens if it is unavailable?
- What happens if it returns unexpected data?
- Is there a fallback?

### 0F. Assumptions Catalog
List every IMPLICIT assumption the code makes about:
- Input ranges, types, and shapes
- Environment and runtime
- Ordering and timing
- Encoding and locale
- Availability and performance of dependencies
These are the most common source of production bugs.

---

## PHASE 1 — COMPREHENSIVE AUDIT

Apply ALL 15 lenses from `analysis_lenses.md`.

For each finding, use the format defined in `standards.md`.
Track a running count after each lens: "Cumulative findings: N"

After all lenses, produce a summary:
- Total findings: ___ (CRITICAL: _ | HIGH: _ | MEDIUM: _ | LOW: _ | NIT: _)
- Top 3 highest-impact findings with brief explanation
- Genuine strengths of the original code (be specific, not patronizing)

---

## PHASE 2 — COMPLETE REWRITE

Produce a COMPLETE, RUNNABLE rewrite resolving EVERY finding from Phase 1.

Requirements defined in `standards.md` → Rewrite Standards section.

After the rewrite, produce a change log:
| Finding ID | What Changed | Why | Regression Risk |
|-----------|-------------|-----|-----------------|

---

## PHASE 3 — ADVERSARIAL RED TEAM

You are now a DIFFERENT, HOSTILE engineer whose sole goal is to break
the Phase 2 code. You are adversarial, skeptical, and assume the Phase 2
author was overconfident.

### 3A. Behavioral Equivalence
Re-trace the Phase 0C examples through the new code. Do outputs match
the original? Any difference is a regression that must be explained and
either justified or fixed.

### 3B. Fix-Induced Bug Scan
For EVERY entry in the Phase 2 changelog, ask:
"Could this fix have introduced a new bug?"
Check: changed semantics, new exception types, changed signatures,
new failure modes, ordering/timing/precision changes.

### 3C. Fault Injection
For the 3 most critical functions, construct:
1. A pathological worst-case input
2. A concurrent/interleaved access scenario (if applicable)
3. A malicious input designed to exploit any remaining weakness
4. A scenario where an external dependency fails mid-operation
Trace each through the new code. Does it survive?

### 3D. Fresh-Eyes Re-Audit
Re-examine the rewrite through ALL 15 lenses but ONLY look for NEW
issues (not issues from the original). Use the standard finding format.
New findings get IDs continuing from Phase 1's count.

### 3E. Simplification Pass
Did the rewrite become MORE complex than necessary? Identify any
over-engineering. For each abstraction introduced, justify its existence.
If you cannot justify it, remove it.

### 3F. Blast Radius Assessment
For every remaining risk, estimate:
- Probability of occurrence (1–5)
- Impact severity if it occurs (1–5)
- Blast radius (what systems/users are affected)
Prioritize: P × I score.

State: "New findings in Phase 3: N"

---

## PHASE 4 — REFINED REWRITE

Incorporate ALL Phase 3 findings into a second complete rewrite.

Additional requirements:
- For every Phase 3 fix, annotate with: // Fixed [F-XXX]: brief description
- If a Phase 3 finding conflicts with a Phase 1 finding, explain the
  trade-off and justify your decision.
- Produce updated changelog (Phase 2 → Phase 4 delta).
- Run the verification commands (lint, typecheck, test) mentally or
  actually. Would they pass?

---

## PHASE 5 — FINAL VALIDATION

Execute the complete checklist from `quality_checklist.md`.
EVERY item requires YES, NO, or N/A with a one-sentence justification.

If ANY item is NO:
1. Fix the issue in the code
2. Re-run the ENTIRE checklist (not just the failed items)
3. Repeat until 100% pass

Also:
### 5A. Contract Verification
Verify ALL Phase 0B contracts hold in the final code.

### 5B. Regression Sweep
Trace ALL example inputs from Phases 0C and 3C through the final code.
Verify correct output for every one.

### 5C. Trade-off Documentation
| Trade-off Made | Alternative Considered | Why This Choice |
|---------------|----------------------|-----------------|

---

## PHASE 6 — FINAL DELIVERABLES

Produce ALL of the following. Write each as a file.

### 6A. Final Code
`review_output/final_code/` — The complete, production-ready code. Every
line. No ellipsis, no placeholders, no TODOs.

### 6B. Findings Report
`review_output/findings.md` — Every finding from all phases, organized
by severity, with resolution status.

### 6C. Changelog
`review_output/changelog.md` — Complete record of every change, with
finding IDs, reasoning, and regression risk.

### 6D. Test Suite
`review_output/test_suite/` — Complete, runnable test suite.
Requirements in `standards.md` → Test Standards section.

### 6E. Confidence Report
`review_output/confidence_report.md`:
- Correctness:      __/100
- Security:         __/100
- Performance:      __/100
- Maintainability:  __/100
- Overall:          __/100
For any score below 95, explain what uncertainty remains and what
would resolve it.

### 6F. Executive Summary
- Total issues found and resolved (by severity)
- The 5 most important improvements
- Strengths preserved from the original
- If starting from scratch, what would you do differently (3–5 sentences)

### 6G. PROMPT.md Generation
If `PROMPT.md` does not already exist, create it now by synthesizing
ALL methodology files (`review_methodology.md`, `analysis_lenses.md`,
`quality_checklist.md`, `standards.md`) into a single self-contained
document at the project root. This file serves as persistent memory
so future sessions skip reading individual `agent_docs/` files.

Include at the top of `PROMPT.md`:
Agent Methodology — Auto-Generated
Source: agent_docs/*.md
Regenerate by deleting this file and starting a new session.
Last generated: [DATE]

