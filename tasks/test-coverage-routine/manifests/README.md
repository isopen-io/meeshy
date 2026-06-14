# Coverage Manifests — file-level checklists

Exhaustive, per-app lists of **every** source file, grouped by feature/domain, with a checkbox.
These are the explicit "what to cover" backing the feature matrix in `../PROGRESS.md`.
A run resolves a `(feature × app)` cell to the concrete files here and brings each to **92%
line+branch**.

Checkbox meaning:
- `[ ]` — no obvious test today → write tests to 92%.
- `[~]` — a same-named test file exists (heuristic), but it may be shallow → **verify** real
  coverage is 92% line+branch; fill gaps; only then flip to `[x]`.
- `[x]` — verified 92% line+branch **and** reviewer-approved (set by the routine).

> `[~]` is a *hint, not a guarantee*. It only means a similarly-named test file exists. Coverage
> must still be measured and proven per file.

## Totals (generated 2026-06-14)

| App | Manifest | Source files | Have a test (heuristic) | To cover/verify |
|-----|----------|:------------:|:-----------------------:|:---------------:|
| Gateway | [`gateway.md`](gateway.md) | 316 | 88 | 228 |
| Translator | [`translator.md`](translator.md) | 110 | 24 | 86 |
| Web | [`web.md`](web.md) | 1091 | 363 | 728 |
| iOS app | [`ios.md`](ios.md) | 346 | 96 | 250 |
| Android app | [`android.md`](android.md) | 148 | 28 | 120 |
| Shared (TS) | [`shared.md`](shared.md) | 78 | 18 | 60 |
| MeeshySDK (Swift) | [`sdk-swift.md`](sdk-swift.md) | 449 | 205 | 244 |
| **Total** | | **2538** | **822** | **1716** |

So even on the generous "a same-named test exists" heuristic, **~1,716 of 2,538 source files
have no obvious test** — and many of the 822 `[~]` files are shallow and need gap-filling to hit
92%. That's the full surface the routine works through, one slice per 3h run.

## Regenerating

The code moves; regenerate the manifests (preserving nothing but the file inventory — re-tick
`[x]` from git history / coverage reports as needed):

```bash
python3 tasks/test-coverage-routine/gen_manifests.py
```

The generator groups files by directory (≈feature/domain) and re-derives the `[~]`/`[ ]` heuristic
from the current tree. It does **not** know which files the routine has already driven to 92% —
that truth lives in `../PROGRESS.md` (the matrix) and the per-file `[x]` ticks the routine writes
back here. When regenerating after the routine has started, diff carefully and re-apply `[x]` ticks
for files already completed.
