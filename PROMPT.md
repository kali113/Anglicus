Agent Methodology — Auto-Generated
Source: agent_docs/*.md
Regenerate by deleting this file and starting a new session.
Last generated: 2026-02-16

---
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

---

# 15 Analysis Lenses — Phase 1

Apply EVERY lens below. For each finding, use the format in `standards.md`.
If a lens yields ZERO findings, write 2–3 sentences explaining exactly
what you checked and why the code is correct in that regard.

---

## Lens 1: Correctness & Logic

- Trace EVERY conditional branch. Is the logic correct in ALL cases?
- EVERY loop: initialization, condition, update, termination guarantee.
  Off-by-one? Fence-post? Empty-collection behavior?
- EVERY arithmetic operation: overflow, underflow, division by zero,
  floating-point precision loss, sign errors, integer truncation,
  modulo with negative operands.
- EVERY comparison: correct operator? correct operands? type coercion?
- EVERY return path (including implicit returns, fall-throughs,
  default branches).
- State transitions: can any illegal state be reached?
- Recursive functions: prove termination, verify base cases, check
  stack depth limits.
- Operator precedence errors, short-circuit side effects, accidental
  assignment vs comparison, switch/match fall-through.
- For EACH bug found, provide a CONCRETE input that triggers it and
  the incorrect output it produces.

---

## Lens 2: Edge Cases & Boundary Conditions

For EVERY input-accepting function, systematically test against:

**Nullity & emptiness:**
null, undefined, None, nil, NaN, Infinity, -Infinity,
empty string, empty array, empty map, empty set, empty file, empty stream

**Extremes:**
MIN_INT, MAX_INT, MIN_FLOAT, MAX_FLOAT, -0, +0, subnormal floats,
single-element collections, two-element collections (fence-post),
negative where positive expected, zero where nonzero expected

**Strings & encoding:**
BOM, zero-width joiners/spaces, combining characters, surrogate pairs,
RTL marks, multi-codepoint emoji (👨‍👩‍👧‍👦), null bytes (\0) embedded in
strings, strings of length MAX_INT, newlines in unexpected places

**Scale:**
10M elements, 1B elements, deeply nested structures (10K depth),
extremely long strings, many concurrent callers

**Ordering & structure:**
duplicates, already sorted, reverse sorted, all identical elements,
circular/self-referential structures, sparse data, dense data

**Time:**
midnight, DST transitions, leap seconds, epoch, negative timestamps,
far-future dates (year 9999), time zone boundaries, clock skew

**Idempotency:**
What happens when the same operation is called twice with the same input?
Is the result identical? Should it be?

For each uncovered edge case: provide the specific input AND the
incorrect behavior it causes.

---

## Lens 3: Error Handling & Resilience

- Map EVERY possible failure point (I/O, allocation, parse, network,
  permission, validation, external service). Is each one handled?
- Each catch/except/rescue: is the type specific enough? Is context
  preserved? Is the error swallowed? Is there a bare `catch` or
  `except Exception`?
- Error messages: could a developer at 3 AM diagnose the issue
  WITHOUT reading source code? Are they actionable?
- Resource lifecycle: are files, connections, locks, handles, temp
  files released in ALL paths (success, error, panic)? Check for
  missing finally/defer/using/RAII.
- Client errors vs internal errors: properly distinguished?
  Proper HTTP status codes / error codes?
- Partial failure: can a failure leave the system inconsistent?
  Is there transactional integrity / rollback / saga pattern?
- Timeouts: does EVERY blocking operation (network, file, lock
  acquisition, queue poll) have an explicit timeout?
- Retry logic: where applicable, is there retry with exponential
  backoff + jitter? Is it bounded (max retries)? Are non-retryable
  errors excluded?
- Fail-safe defaults: when something goes wrong and there's no
  explicit handling, does the system fail SAFELY (deny access,
  return empty, log and alert) rather than fail OPEN?

---

## Lens 4: Security

Assume an intelligent, motivated attacker. For each vector, state
VULNERABLE / IMMUNE / N/A with EVIDENCE.

**Injection:**
SQL, NoSQL, OS command, LDAP, XPath, template, header, log injection.
Trace untrusted data from entry point through every transformation to
every sink. Is it parameterized/escaped at every sink?

**XSS:** stored, reflected, DOM-based. Trace user content to HTML output.

**Authentication & authorization:**
Bypass, privilege escalation, IDOR (insecure direct object reference),
missing authorization checks on every endpoint/operation, horizontal
privilege escalation (user A accessing user B's data).

**Request forgery:** CSRF, SSRF. Token validation? Allow-list of targets?

**Path traversal:** Can an attacker escape intended directories with
../, symlinks, null bytes, URL encoding?

**Deserialization:** Prototype pollution, arbitrary object instantiation,
RCE via deserialization gadget chains.

**Cryptography:**
Weak algorithms (MD5, SHA1, DES, RC4), ECB mode, static/predictable
IVs/nonces, hardcoded keys/secrets, insufficient key length,
Math.random()/rand() for security purposes, timing-vulnerable
comparisons (use constant-time compare).

**Data exposure:**
Are secrets, tokens, PII, passwords logged? Cached? Stored in
plaintext? Included in error messages? Committed to version control?
Transmitted unencrypted?

**Denial of service:**
Can attacker craft input causing O(n²+) processing? ReDoS? Hash
collision DoS? Zip bombs? XML entity expansion? Unbounded memory
allocation? Infinite loops via crafted input?

**Supply chain:**
Known CVEs in dependencies? Unmaintained dependencies? Typosquatting
risk? Lockfile integrity?

**Race conditions:**
TOCTOU (time-of-check-to-time-of-use)? Double-spend? Privilege
escalation via interleaving?

**Mass assignment / over-posting:**
Can a user set fields they shouldn't (admin, role, price) by
including extra fields in a request?

For each vulnerability: provide a CONCRETE exploit scenario with
specific malicious input and the resulting compromise.

---

## Lens 5: Performance & Efficiency

For EVERY function/method, state:
- Time complexity: O(?) — with justification
- Space complexity: O(?) — with justification
- Can either be improved? To what? How?

**Unnecessary work:**
Repeated computations, redundant iterations, unused results,
gratuitous deep copies/clones, repeated parsing of the same data,
re-sorting already-sorted data.

**Algorithmic downgrades:**
Linear search where hash/binary exists, full sort where partial sort
or heap suffices, nested loops that could use indexing/hashing,
brute force where dynamic programming applies.

**Memory:**
Leaks (unclosed resources, unremoved listeners, growing unbounded
caches, closures capturing too much), excessive allocation in hot
paths, large objects retained longer than needed, string building
via concatenation in loops.

**I/O:**
N+1 queries, unbatched operations, synchronous I/O on hot paths,
missing connection pooling, missing streaming for large payloads,
missing compression, chatty protocols that could be batched.

**Caching:**
Missing memoization for pure expensive functions, missing HTTP cache
headers, missing materialized views, cache invalidation correctness.

**Concurrency waste:**
Sequential independent operations that could be parallel, contention
on shared locks (reduce critical section size), false sharing.

**Data locality:**
Access patterns that defeat CPU cache (random access through large
arrays of pointers vs. contiguous arrays of values).

**Boxing / autoboxing:**
In tight loops — use primitive types where possible.

**Cold start:**
Initialization costs that could be deferred (lazy singletons, lazy
imports, connection establishment on first use).

---

## Lens 6: Architecture & Design

**SOLID** — for each principle, state PASS / PARTIAL / FAIL with evidence:

- **SRP**: Does each class/module/function have exactly one reason to
  change? If multiple, what should be extracted?
- **OCP**: Can behavior be extended without modifying existing code?
  What abstraction is missing?
- **LSP**: Are subtypes fully substitutable? Any violated contracts?
- **ISP**: Are consumers forced to depend on methods they don't use?
- **DIP**: Do high-level modules depend on low-level modules directly?
  Where should abstractions be introduced?

**Other principles:**
- **DRY**: List EVERY instance of duplication — including SEMANTIC
  duplication (different code that does the same thing).
- **KISS**: Unnecessary complexity? Over-engineering?
- **YAGNI**: Code built for a future need that doesn't exist?
- **Separation of concerns**: Business logic mixed with I/O,
  presentation, infrastructure, or serialization?
- **Law of Demeter**: Code reaching through object chains (a.b.c.d)?
- **Fail-safe defaults**: Do defaults err on the side of safety?
- **Idempotency**: Are operations idempotent where they should be?
- **Backward compatibility**: Would these changes break existing callers?

**Patterns:**
- Design patterns misapplied, forced, or missing?
- Anti-patterns present? (God object, anemic domain model, spaghetti,
  golden hammer, feature envy, shotgun surgery, primitive obsession,
  leaky abstraction, boat anchor, lava flow)

**API design:**
- Consistent naming, parameter ordering, return types?
- Principle of Least Astonishment: could a caller be surprised?
- Misuse resistance: does the API guide correct usage and make
  incorrect usage difficult or impossible?
- Versioning and backward compatibility?

**Technical debt:**
- Identify every piece of technical debt, its cost (in maintenance
  burden, bug risk, performance), and recommended remediation.

---

## Lens 7: Readability & Maintainability

Evaluate as if a NEW team member must understand and safely modify
this code tomorrow.

**Naming:**
- Does every name reveal intent without ambiguity?
- Consistent conventions throughout?
- Grep-friendly (unique, not easily confused with other names)?
- No abbreviations a new hire wouldn't know?
- List EVERY improvable name with a better alternative.

**Function size & complexity:**
- Any function > 20 lines of logic? Decompose.
- Estimate cyclomatic complexity for complex functions. Flag > 10.
- Estimate cognitive complexity. Flag > 15.
- Nesting depth > 3 levels? Apply guard clauses, early returns,
  function extraction.

**Magic values:**
- Every literal number (except 0, 1, -1 in obvious contexts) and
  every literal string used in logic MUST be a named constant.
  List all violations.

**Comments:**
- Missing: complex algorithms, non-obvious "why", workarounds,
  regex explanations, performance-critical decisions.
- Outdated/misleading: comments that don't match the code.
- Redundant: comments that restate what the code says.

**Dead code:**
- Unreachable branches, unused variables/functions/imports/parameters,
  commented-out code. List ALL.

**Consistency:**
- Mixed conventions, different approaches to the same problem in
  different places, inconsistent formatting.

**Organization:**
- Is the file doing too much? Are related things grouped?
- Is the reading order logical (top-down, public-before-private)?
- Are imports organized (stdlib → third-party → local)?

---

## Lens 8: Type Safety & Data Integrity

- Types as NARROW and SPECIFIC as possible. No `any`, `Object`,
  untyped dictionaries where a struct/interface would work.
- Nullability explicitly modeled everywhere (Optional, nullable
  annotations, null object pattern).
- **Impossible states made unrepresentable**: discriminated unions,
  state machines via types, builder patterns enforcing required
  fields, enums instead of stringly-typed values.
- Validation at EVERY trust boundary (API input, file read, DB read,
  deserialization, env vars, CLI args, inter-service messages).
- Invariants enforced by types or constructors, not just convention
  or documentation.
- Immutability: is mutable state minimized? Are shared data structures
  immutable or defensively copied?
- Phantom types, branded types, newtype wrappers — applicable?
- Are implicit type coercions possible and could they cause bugs?

---

## Lens 9: Concurrency & Thread Safety

Skip ONLY if the code is provably single-threaded AND synchronous.
Otherwise:

- ALL shared mutable state identified. For each: what protects it?
  Is the protection sufficient?
- Race conditions: provide specific interleaving scenarios.
- Deadlock: can locks be acquired in different orders?
- Starvation: can any consumer be permanently blocked?
- Atomicity: are compound check-then-act sequences atomic?
- Async correctness: unhandled promise rejections, missing awaits,
  fire-and-forget promises that should be awaited, error propagation
  gaps in async chains.
- Cancellation: is cooperative cancellation supported where needed?
  Are long-running operations cancellable?
- Back-pressure: what happens if producer outpaces consumer?
  Unbounded queue growth?
- Connection/resource pool exhaustion under load?

---

## Lens 10: Testing & Testability

- **Dependency injection**: can dependencies be swapped for test
  doubles? If not, what refactoring enables it?
- **Purity**: which functions are pure? Can more be made pure?
- **Seams**: are there clear seams for mocking I/O, time, randomness?

Generate a CONCRETE test suite outline of at minimum 20 specific test
cases. Each must have:
- Descriptive name
- Input → expected output (concrete values)
- Rationale (what bug/edge case this catches)

Cover:
- Happy path (multiple realistic scenarios)
- Every edge case from Lens 2
- Every bug found in Lens 1
- Every error path from Lens 3
- At least 2 security-related inputs from Lens 4
- Property-based / fuzz test candidates
- Performance regression tests (input sizes with expected time bounds)
- Idempotency tests

---

## Lens 11: Operational Readiness

- **Logging**: Structured (JSON)? Appropriate levels (DEBUG/INFO/WARN/
  ERROR)? Sufficient context to debug production issues (request ID,
  user ID, operation, duration, relevant parameters)? NO sensitive
  data in logs?
- **Metrics**: Are key operations instrumented (counters, histograms,
  gauges)? Latency, error rate, throughput, queue depth, pool usage?
- **Tracing**: Distributed trace context propagated across boundaries?
- **Health checks**: Readiness probe? Liveness probe? Dependency
  health checks?
- **Configuration**: Any hardcoded values that should be configurable?
  Missing validation on config values? Sensible defaults?
- **Graceful shutdown**: In-flight requests drained? Connections
  closed? Background workers stopped? Shutdown timeout?
- **Deployment safety**: Safe to run alongside old version?
  (backward-compatible wire formats, DB schema, APIs)
- **Feature flags**: Should any new behavior be gated?

---

## Lens 12: Language-Specific Idioms

- Identify the EXACT language and version.
- Apply that language's OFFICIAL style guide.
- For every function: is there a more idiomatic way to write it using
  language-specific features? (list comprehensions, pattern matching,
  protocols/traits, decorators, generators, RAII, structured
  concurrency, extension methods, etc.)
- Known pitfalls for this language:
  - JavaScript: ==, this binding, prototype chain, event loop blocking
  - Python: mutable default args, late binding closures, GIL
  - Go: nil interface, goroutine leaks, error handling
  - Java: == vs .equals, autoboxing cache, checked exceptions
  - Rust: lifetime issues, unwrap panics, Send/Sync
  - C/C++: dangling pointers, buffer overflows, UB
  - TypeScript: type narrowing gaps, enum pitfalls
  - [Apply as relevant]
- Modern features: are legacy patterns used where modern alternatives
  exist and are clearly better?

---

## Lens 13: Documentation

- Every public function/class/module: complete docs?
  (purpose, params, return, throws/errors, examples, side effects)
- Complex algorithms: explained with references?
- Module/file-level docstring: the "why" and "how" of the design?
- Non-obvious decisions: "why" comments present?
- Are existing comments accurate and current?
- Would a new developer understand the architecture from the docs alone?

---

## Lens 14: Accessibility (UI code only — skip if N/A)

State "N/A — no UI code" if not applicable. Otherwise:
- Semantic HTML, ARIA roles/labels/live-regions
- Keyboard navigation (tab order, focus trapping in modals, skip links)
- Screen reader: alt text, form labels, error announcements
- Color contrast (WCAG AA minimum), not relying on color alone
- Focus management (after route changes, modal open/close)
- Reduced motion (prefers-reduced-motion)
- Responsive design (touch targets ≥ 44px, viewport meta)
- Error states announced to assistive technology

---

## Lens 15: Internationalization (skip if N/A)

State "N/A — not user-facing" if not applicable. Otherwise:
- Hardcoded user-facing strings (extract to resource files)
- Locale-sensitive: date/time, numbers, currency, sorting/collation
- RTL layout support
- Character encoding (UTF-8 throughout)
- Pluralization rules (not just "add s")
- String concatenation for sentences (use ICU MessageFormat or
  equivalent — word order varies across languages)
- Text expansion (German ~30% longer than English — does UI accommodate?)

---

# Quality Validation Checklist — Phase 5

Answer YES, NO, or N/A for each item. Each answer REQUIRES a one-sentence
justification citing specific evidence (function name, line concept, or trace).

If ANY answer is NO: fix the issue, regenerate the code, and re-run the
ENTIRE checklist from the top. Do NOT proceed with any NO.

---

## Correctness
- [ ] Every execution path produces the correct result for all valid inputs
- [ ] Every edge case from Lens 2 is handled gracefully (no crash, no corruption)
- [ ] Every loop terminates; every recursion has a provably-reached base case
- [ ] No integer overflow, underflow, division by zero, or precision loss possible
- [ ] All contracts (pre/post/invariant) from Phase 0B are enforced in the code
- [ ] All state transitions are valid (no illegal state is reachable)
- [ ] Operations are idempotent where the domain requires it

## Robustness
- [ ] Every external failure mode has explicit error handling
- [ ] Every resource is acquired and released correctly in ALL paths (RAII/finally/defer/using)
- [ ] Every error message is actionable for the person who will see it
- [ ] No operation can leave the system in an inconsistent state
- [ ] All blocking operations have explicit timeouts
- [ ] Retry logic (where present) has backoff, jitter, and a max-retry bound
- [ ] Fail-safe defaults are used (deny by default, empty result vs crash)

## Security
- [ ] All untrusted input is validated and sanitized before use at every sink
- [ ] No secrets appear in logs, error messages, stack traces, or VCS
- [ ] All cryptographic operations use current best-practice algorithms and parameters
- [ ] No injection vector exists for any attack type (SQL, command, XSS, SSRF, path traversal)
- [ ] Principle of least privilege applied (minimum permissions, minimum data exposure)
- [ ] No denial-of-service amplification possible via crafted input
- [ ] Authentication and authorization are checked on every protected operation

## Performance
- [ ] No function has worse time complexity than necessary (documented with Big-O)
- [ ] No unnecessary memory allocations in hot paths
- [ ] No N+1 queries or unbatched I/O operations
- [ ] No memory leaks under any execution path
- [ ] Caching is applied where it provides clear benefit
- [ ] No blocking operations on async/event-loop threads

## Design
- [ ] Every function/class has a single responsibility
- [ ] No code duplication exists (including semantic duplication)
- [ ] No unnecessary abstractions, dead code, or premature generalization
- [ ] The dependency graph has no cycles and coupling is minimized
- [ ] The API cannot be easily misused — it guides correct usage
- [ ] The code is backward-compatible (or breaking changes are documented)

## Readability
- [ ] Every name communicates its purpose unambiguously
- [ ] No function exceeds ~20 lines of logic
- [ ] No nesting exceeds 3 levels
- [ ] Every magic number/string is a named constant
- [ ] "Why" comments present for every non-obvious decision; no redundant "what" comments
- [ ] A competent developer new to the project could understand any function within 60 seconds
- [ ] Dead code is completely removed

## Type Safety
- [ ] No `any`, `Object`, or unnecessarily wide types are used
- [ ] Impossible states are unrepresentable via the type system
- [ ] Nullability is explicitly modeled everywhere
- [ ] Data is validated at every trust boundary
- [ ] Immutability is used wherever shared data exists

## Testability
- [ ] Every function can be unit-tested in isolation (dependencies are injectable)
- [ ] All side effects are behind injectable interfaces
- [ ] At least 20 concrete test cases have been specified
- [ ] Tests cover happy paths, edge cases, error paths, and security inputs

## Operational Readiness
- [ ] Structured logging with appropriate levels and context exists
- [ ] No sensitive data is logged
- [ ] Graceful shutdown handles in-flight work
- [ ] Configuration is externalized and validated
- [ ] Health/readiness endpoints exist (for services)

## Documentation
- [ ] Every public symbol has complete documentation (purpose, params, returns, errors)
- [ ] Every complex algorithm is explained with the approach/rationale
- [ ] The module's overall purpose and design is documented at the top level

---

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
---

Regeneration instructions:
Delete this file and start a new session to regenerate from agent_docs/*.md.
