# Standards & Formats

---

## Finding Format

Every finding must follow this structure exactly:

> **[F-XXX] Severity: CRITICAL | HIGH | MEDIUM | LOW | NIT**
> **Category:** (which lens)
> **Location:** (file, function/method, line or region)
> **Issue:** (precise one-sentence description)
> **Evidence:** (code snippet, execution trace, or concrete input demonstrating the problem)
> **Impact:** (what goes wrong, for whom, under what conditions)
> **Blast radius:** LOW (single function) | MEDIUM (module/feature) | HIGH (system/users)
> **Fix:** (specific, concrete remediation — not "consider improving")

Numbering: F-001 through F-NNN, sequential across all phases.
Phase 3 findings continue the sequence from Phase 1.

Severity definitions:
- **CRITICAL**: Data loss, security breach, system crash, or correctness
  failure in normal operation. Must fix before any deployment.
- **HIGH**: Significant bug, performance problem, or security weakness
  that will manifest in production under realistic conditions.
- **MEDIUM**: Maintainability, design, or robustness issue that increases
  risk of future bugs or slows development.
- **LOW**: Code quality issue unlikely to cause problems but worth fixing.
- **NIT**: Style, naming, or preference issue.

---

## Rewrite Standards

Every rewrite (Phases 2 and 4) must satisfy ALL of the following:

### Completeness
- EVERY line of code present. No "..." ellipsis. No "// same as before".
  No "TODO". No placeholders. No omissions.
- The code must be syntactically valid and runnable as-is.

### Type annotations
- Full type annotations on every function signature, variable
  declaration, and return type (where the language supports it).
- Use the narrowest possible types. No `any` or equivalent.

### Documentation
- Every public function/class/module has a complete docstring:
  purpose, parameters (with types and constraints), return value,
  exceptions/errors that can be thrown, side effects, and at least
  one usage example for non-trivial functions.

### Error handling
- Every failure mode identified in Lens 3 has explicit handling.
- Resources are managed with RAII / try-finally / using / defer.
- Error messages include context: what operation failed, what input
  caused it, what the caller should do about it.

### Constants
- Every magic number and magic string is a named constant with a
  descriptive name and a comment explaining its origin or meaning.

### Structure
- Guard clauses and early returns to minimize nesting.
- Functions ≤ 20 lines of logic.
- Nesting ≤ 3 levels.

### Style
- Follows the language's official style guide.
- Consistent throughout.

### Annotations
- Every change that resolves a finding includes a comment:
  `// Resolves [F-XXX]: brief description`
  (These can be removed before final delivery if the team prefers.)

---

## Changelog Standards

After each rewrite, produce a table:

| Finding ID | Location | What Changed | Why | Regression Risk | Mitigation |
|-----------|----------|-------------|-----|-----------------|------------|

Regression Risk levels: NONE, LOW, MEDIUM, HIGH
If MEDIUM or HIGH, the Mitigation column must explain how regression
is prevented (specific test case, type system guarantee, etc.)

---

## Test Suite Standards

The test suite produced in Phase 6 must satisfy:

### Quantity & Coverage
- Minimum 20 test cases
- Must cover: happy paths (≥5), edge cases (≥5), error paths (≥5),
  security inputs (≥2), performance boundaries (≥1),
  idempotency (≥1), regression tests for each CRITICAL/HIGH finding (≥1 each)

### Structure
Every test must have:
Test name: descriptive_name_explaining_what_and_why
Arrange: [setup code with concrete values]
Act: [the operation being tested]
Assert: [expected outcome with specific values]

text


### Properties
- Deterministic (no flaky tests — control time, randomness, ordering)
- Isolated (no test depends on another test's state)
- Fast (mock I/O, no network, no filesystem unless testing those)
- Self-documenting (the test name + arrange section tells you
  everything without reading comments)

### Naming Convention
`test_<function>_<scenario>_<expected_result>`
Example: `test_divide_by_zero_raises_value_error`

---

## PROMPT.md Standards

When generating `PROMPT.md`, the agent must:
1. Synthesize ALL content from `agent_docs/` into a single file
2. Preserve all structure, hierarchy, and detail — no summarization
3. Add a header with generation metadata (date, source files)
4. Add a footer with instructions for regeneration
5. Keep the file self-contained (no references to `agent_docs/` files)
6. The file should be directly usable as the complete methodology
   without needing to read any other file

This enables:
- Faster session bootstrap (one file read vs four)
- Persistent methodology across sessions and harnesses
- Version-controllable methodology snapshots

