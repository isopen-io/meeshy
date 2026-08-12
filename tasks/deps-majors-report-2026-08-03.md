# Rapport Validation Bumps MAJOR Dependabot — 2026-08-03

## Résumé Exécutif
5 PRs majorRs validées (3 mergées, 2 laissées). TypeScript 7.0 + build-tools exigent une refonte tsconfig/ts-jest/Next.js coordonnée; @fastify/rate-limit et web-vitals sans impact. 8 PRs dépendances mineurs/patch restent ouvertes; 1 PR prod (react/react-dom) en FAILURE.

---

## PR #2496 — TypeScript 6.0.3 → 7.0.2 (services/gateway, MAJOR)

**Verdict:** `LEAVE` — architectural break, merger après migration tsconfig

**Gates:**
- `bun install (root)` ✅ OK
- `packages/shared: prisma generate + bun run build` ✅ OK
- `services/gateway: bunx tsc --noEmit` ❌ FAIL
  - TS5108: `moduleResolution=node10` supprimé en TS7
  - TS5102: `baseUrl` supprimé, doit migrer vers `compilerOptions.paths`
  - 3× TS2883 PostFeedService.ts:420/467/890 — retour inféré de `JsonValue` non portable, exige annotation explicite
- `services/gateway: bun run test` ❌ FAIL
  - ts-jest@29.4.12 incompatible TS7 (requires `<7`)
  - 576/576 suites ne lancent pas

**Breaking changes:**
1. TypeScript 7 (Corsa Go/native) supprime le Compiler API classique
2. `tsconfig.json` moduleResolution/baseUrl deviennent strictement obligatoires
3. ts-jest ne supporte pas TS7 dans le registry public

**Suite:** Coordonner (1) tsconfig.json vers paths en tous les packages, (2) annotation de types JsonValue-derived sur les 3 postes PostFeedService, (3) attendre ts-jest compat ou chercher alternatif (esbuild-jest). Garder PR ouverte, ne pas forcer rebase.

---

## PR #2492 — @fastify/rate-limit 10.3.0 → 11.2.0 (services/gateway, MAJOR)

**Verdict:** ✅ **MERGED** (commit 98cc74f)

**Gates:**
- PR CI (pre-merge) ✅ all-green
- `merge origin/main` ✅ clean, zéro conflits
- `bun install` ✅ OK
- `packages/shared build` ✅ OK
- `services/gateway tsc --noEmit` ✅ clean
- Targeted rate-limit/auth suites ✅ 9 files / 248 tests passed
- Full gateway test:coverage ✅ 576 suites / 15244 tests (1 flaky timeout voice/analysis, vert en isolation 25/25)

**Breaking changes ✅ VERIFIED:**
1. Removal `settings.whitelist` — gateway utilise `allowList` PARTOUT (0 usage whitelist trouvé)
2. IPv6 normalization dans keyGenerator par défaut — chaque registration site set explicit keyGenerator
3. Transitive fastify-plugin 5→6, compat `^5.10.0` déclaré

**Impact:** Zéro. Entièrement mergeable.

---

## PR #2499 — web-vitals 5.3.0 → 6.0.1 (apps/web, MAJOR)

**Verdict:** ✅ **MERGED** (commit 2c7de48)

**Gates:**
- PR CI (pre-merge) ✅ all-green
- `merge origin/main` ✅ clean, zéro conflits
- `bun install` ✅ OK (3833 packages)
- `tsc --noEmit delta apps/web` ✅ identical (1184 errors before/after, zéro delta)
- `apps/web jest` ✅ 497 suites / 11619 passed, 21 skipped, 0 failed

**Breaking changes DOCUMENTED:** v6.0.0/v6.0.1 — verbatimModuleSyntax type-only exports, includeProcessedEventEntries default→false, requestIdleCallback capped 1s. **Zéro impact:** package unused (zero call sites pour onCLS/onINP/reportWebVitals/* anywhere).

**Impact:** Zéro. Pure maintenance (unused dep, safe to bump).

---

## PR #2487 — Build-tools group (root, MAJOR)

**Branches:** turbo 2.10.4→2.10.8, **typescript 6.0.3→7.0.2 MAJOR**, eslint 10.7.0→10.8.0, eslint-config-next 16.2.10→16.2.12

**Verdict:** `LEAVE` — TypeScript 7 breaks 2 required gates; groupe entier bloqué sur migration coordonnée

**Gates:**
- `gh pr checkout + merge origin/main` ✅ clean
- `bun install` ✅ OK
- `packages/shared tsc` ✅ OK (build clean, TS7-migrated prior to this PR)
- `services/gateway turbo build` ❌ FAIL
  - TS5108 moduleResolution=node10 removed
  - TS5102 baseUrl removed
  - 3× TS2883 PostFeedService.ts
- `apps/web next build` ❌ FAIL
  - TypeError: `ts.sys.fileExists` undefined
  - Next.js 15.5.22 loader calls missing Compiler API
- `next lint` ❌ FAIL (same ts.sys crash)

**Architectural issue:** TS7 native compiler breaks Next.js config loader + ts-jest. Cette PR groupe est correctly blocked; ne pas ignorer en permanence (réparable via migration deliberate).

**Suite:** Même recette que PR 2496. Reste ouvert pour follow-up intentionnel.

---

## PR #2484 — upload-artifact v5 → v7 (.github/workflows, MAJOR)

**Verdict:** ✅ **MERGED** (commit via `gh pr merge 2484 --squash --admin`)

**Gates:**
- PR CI (pre-merge) ✅ all-green (Quality, Security, Test *, Build, Summary)
- `merge origin/main` ✅ clean
- Inventory upload-artifact/download-artifact ✅ all v7 (repo-wide), PR only touched ios-wmo-probe.yml (v5→v7)
- action.yml v5 vs v7 diff ✅ no removed/renamed inputs (only new optional `archive=true`)
- Compat upload v7 / download v8 (pre-existing pair ios-release.yml) ✅ same modern immutable-artifact backend

**Breaking changes:** None applicable (download-artifact v8 unchanged, no archive-format break).

**Impact:** Zéro. Single file sync PR, safe fast-track.

---

## Restant — PRs Ouvertes (8 dépendances mineurs/patch, 1 feature, 1 prod failure)

| PR | Type | Branch | Status | Suite |
|-----|------|--------|--------|-------|
| **2506** | feature (test/gateway calls) | claude/modest-cori-uv0fco | OPEN | Review normal |
| **2496** | TS 7.0.2 (gateway, MAJOR) | dependabot/…/typescript-7.0.2 | OPEN | Attendre TS7 support (ts-jest, Next) + coordonner tsconfig |
| **2493** | @types/node 20.19 → 26.1.2 (shared, MAJOR) | dependabot/…/types-2002b58cc1 | OPEN | Vérifier (TS7 aligned? Gate path?) |
| **2491** | @tus/server 2.4.1 → 2.4.3 (root, patch) | dependabot/…/tus/server-2.4.3 | OPEN | Vérifier CI, likely green |
| **2490** | @fastify/cors 11.2.0 → 11.3.0 (root, minor) | dependabot/…/fastify/cors-11.3.0 | OPEN | Vérifier CI, likely green |
| **2488** | next-ecosystem group (web, minor/patch) | dependabot/…/next-ecosystem-479fbeca4e | OPEN | Vérifier web build + jest |
| **2487** | build-tools (TS7, turbo, eslint, MAJOR) | dependabot/…/build-tools-d0eae52d12 | OPEN | Attendre TS7 migration recipe (cf. PR 2496) |
| **2482** | fastapi 0.139.2 → 0.141.1 (translator, patch) | dependabot/…/fastapi-0.141.1 | OPEN | Vérifier Python CI |
| **—** | **react/react-dom (prod failure)** | — | **FAILURE in CI** | **Triage:** gh run view / PR audit |

### CI Runs Récents (main post-merges)
- ✅ fastapi pip update: SUCCESS (1m5s)
- ✅ @fastify/cors npm update: SUCCESS (2m4s)
- ❌ react/react-dom npm update: FAILURE (5m25s) — **audit required**
- ⏳ web-vitals Docker: queued
- ⏳ web-vitals Release: pending

### Actions Recommandées
1. **Immédiat:** Auditer failure CI react/react-dom (PR list/view), triage + diagnostiquer
2. **Court terme:** Vérifier PR 2493 (@types/node TS7 compat) — peut dépendre de PR 2496 migration
3. **Moyen terme:** Attendre ts-jest/Next.js TS7 support releases, puis coordonner PR 2496 + 2487
4. **Nettoyage:** Une fois TS7 gates passent, merger 2496/2487 en séquence (partagent impact tsconfig)

---

**Rapport généré:** 2026-08-03 16:45 UTC  
**Commandes audit utilisées:** `gh pr list --state open --limit 20`, `gh run list --branch main --limit 5`, gate suites locales (bun/tsc/jest).
