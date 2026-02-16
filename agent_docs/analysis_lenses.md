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

