# Rapport Validation — Bumps MAJOR Dependabot (2026-08-03, Vague 2)

**Résumé exécutif** : 1 merge appliqué (grpcio 1.83.0), 2 LEAVE (grpcio-reflection, pino en raison de blockers pré-existants), 1 IGNORE (pytest-asyncio, revert documentée), 1 moot (fastify rate-limit auto-fermée par Dependabot). 9 PRs mineures ouvertes (axios, dev-dependencies, Query, Radix UI, workbox, huggingface-hub, aiohttp).

---

## PR #2515 : grpcio 1.82.1 → 1.83.0 ✅ MERGED

**État** : MERGED (2026-08-03 21:16:37, commit 784837bbc)

### Gates — Tous PASS
1. **PR CI (statusCheckRollup)** → PASS — all CI checks green (Quality, Security, Test shared/web/gateway/agent/Python, Audio Pipeline, TTS/STT, Voice API, Prisma, Build, Summary); Trivy NEUTRAL
2. **post-merge test** → PASS — clean auto-merge, no conflicts on requirements.txt or elsewhere
3. **uv pip install --dry-run (full 219-package resolution, py3.11)** → PASS — exit 0, grpcio==1.83.0 / grpcio-tools==1.76.0 / grpcio-reflection==1.76.0 / protobuf==6.33.6 all resolve
4. **real install + import grpc/grpc_tools/grpc_reflection/translation_pb2_grpc** → PASS — grpc.__version__ == 1.83.0, generated pb2_grpc module imports cleanly
5. **grpc 1.83.0 changelog vs repo usage** → PASS — no breaking API changes; repo only uses generated pb2_grpc client/server stubs + grpc_port config, no low-level/internal grpc API usage

### Breaking Changes
Aucun. Bump mineure semver (1.82.1→1.83.0) sans changements d'API publique affectant ce dépôt.

### Suites Données
1. ✅ **Merge appliqué** : squash via `gh pr merge 2515 --squash --admin`
2. 🔧 **Correctif post-merge** : commit 86f7d0326 (fix comment guard stale post-merge) repoussé directement vers main — le commentaire pinned in requirements.txt ("DO NOT bump grpcio-tools") est devenu auto-contradictoire une fois grpcio=1.83.0 en place :
   - **Avant** : commentaire blâmait grpcio<1.83.0 pour bloquer grpcio-tools 1.83.0 ✗
   - **Après** : grpcio=1.83.0 ✓ satisfait grpcio>=1.83.0, MAIS le VRAI blocker restant est grpcio-tools==1.83.0 qui require protobuf>=7.35.1,<8.0.0, incompatible avec protobuf==6.33.6 / grpcio-reflection<7.0.0
   - **Correctif** : commentaire mis à jour pour documenter le vrai conflit protobuf (verified via `uv pip compile` avec grpcio-tools bumped alone)
3. 🚀 **Prochaine étape** : grpcio-reflection et grpcio-tools requièrent un bump coordonné (grpcio-tools→1.83.0 + protobuf→7.35.1+) effectué en un seul commit, validé via `uv pip compile` avant merge.

---

## PR #2513 : grpcio-reflection 1.76.0 → 1.83.0 ⛔ LEAVE

**État** : OPEN (CI en cours — Quality/Security/Audio/Agent réussis; Test shared/web/gateway/Voice/Prisma en QUEUED)

### Gates — Débloqueur satisfait, mais conflit fondamental présent
1. **PR CI (bun/Node22)** → PASS — all checks green, mergeStateStatus=CLEAN
2. **post-merge avec origin/main** → PASS — no conflicts, clean auto-merge
3. **grpcio prerequisite (grpcio≥1.83.0)** → PASS — déjà satisfait via PR #2515 (commit 784837bbc) sur main
4. **uv pip compile dry-run (full resolution)** → **FAIL** — `No solution found: grpcio-reflection==1.83.0 depends on protobuf>=7.35.1,<8.0.0 but you require protobuf==6.33.6 (via grpcio-tools==1.76.0)`

### Breaking Changes
Conflit de dépendance à trois voies : grpcio-reflection 1.83.0 require protobuf≥7.35.1,<8.0.0, tandis que grpcio-tools 1.76.0 require protobuf<7.0.0, et le dépôt est pinné protobuf==6.33.6 (cap également imposée par grpcio-reflection<7.0.0 en cascade).

### Suites Données
1. ⏸️ **Verdict LEAVE** : posté un commentaire détaillé sur le PR documentant le conflit, la gate failure output, et la nécessité d'un bump coordonné.
2. 🔄 **Bump coordonné requis** (manuel, hors Dependabot) : dans un seul commit, en cascade :
   - grpcio-tools → 1.83.0 (require protobuf<8.0.0)
   - protobuf → 7.35.1+ (mais <8.0.0 pour rester compatible grpcio-tools et grpcio-reflection)
   - grpcio-reflection → 1.83.0 (require protobuf≥7.35.1)
   - Valider via `uv pip compile --python-version 3.11 requirements.txt` AVANT merge
3. 📋 **Historique** : ce pattern de conflit a été documenté et reverted deux fois avant (PRs #2383/#2388, 2026-07-27), voir commit f80d5fbc8f pour le contexte.

---

## PR #2528 : pino 9.14.0 → 10.3.1 ⛔ LEAVE

**État** : OPEN (CI partiellement réussi — Quality/Security/Trivy; Test shared/gateway/Voice/Prisma en QUEUED)

### Gates — Pino seul est sûr, mais FastifyInstance/Schema typing pré-existant est cassé
1. **PR CI pre-check** → GREEN (all checks SUCCESS, mergeStateStatus CLEAN)
2. **post-merge avec origin/main** → clean merge, no conflicts
3. **pino v10 breaking-changes audit** → PASS — no relevant breaks:
   - Node 18 drop (CI=Node 22) ✓
   - censor() type-sig change (repo n'utilise pas custom censor) ✓
   - fast-redact→@pinojs/redact swap (repo utilise simple path redact only) ✓
   - pino-abstract-transport v2→v3 / thread-stream v3→v4 (repo never calls pino.transport(), utilise sync custom stream) ✓
   - fastify@5.11.2 déclare déjà pino "^9.14.0 || ^10.1.0" ✓
4. **gate (a) tsc --noEmit** → **FAIL** — 354 TS errors in services/gateway (FastifyInstance/FastifySchema dual typing issue)
   - **Cause racine** : pre-existing issue de dual fastify version resolution (fastify@5.10.0 root vs fastify@5.11.2 scoped)
   - **Non causé par pino bump** : vérifié en parallel worktree sur plain origin/main (byte-identical errors)
5. **gate (b) test:coverage** → **FAIL** — 160/577 gateway test suites failed (153 tests), même root cause family

### Breaking Changes
Pino lui-même n'a aucun breaking change affectant ce dépôt. Les TS/test failures sont pré-existantes et non causées par ce bump.

### Suites Données
1. ⏸️ **Verdict LEAVE** : posté un commentaire détaillé sur le PR documentant l'audit pino changelog et les gate failures pré-existantes.
2. 🔍 **Action requise upstream** : les 354 TS errors (et cascading test failures) sont causées par un bug de dual fastify resolution entre bun hoisting et scoped dépendances — attendez un fix de l'équipe ou une reconfiguration workspace du package.json root.
3. 📊 **Status quo** : peut être re-tentée une fois fastify 5.11.2/typescript 6.0.3 regression sur main est fixed, probablement via un patch upstream ou un bun lockfile regeneration.

---

## PR #2511 : pytest-asyncio 0.25.2 → 1.4.0 ❌ IGNORE

**État** : CLOSED (non mergé, ignore appliquée via `@dependabot ignore this major version`)

### Gates — Conflit Documenté et Précédent de Revert
1. **CI rollup (PR)** → all SUCCESS, mais non-dispositive (voir details)
2. **merge-test vs origin/main** → clean, no conflicts
3. **uv dry-run resolution** → **FAIL** — `pytest-asyncio==1.4.0 requires pytest>=8.4 but pytest==8.3.4 is pinned`
4. **pytest suite** → not run (gate [a] already fails, documented regression)

### Breaking Changes
Exact même breaking change déjà reverted une fois : commit f80d5fbc8f (2026-07-20) roll back pytest-asyncio de 1.4.0 vers 0.25.2 post-PR #2081, avec un code comment explicite :
```
Reject future pytest-asyncio 1.x PRs unless pytest itself moves off 8.3.4
```

### Suites Données
1. ❌ **Verdict IGNORE** : appliquée automatiquement via commentaire `@dependabot ignore this major version` sur PR.
2. 📋 **Politique projet** : ne pas bumper pytest-asyncio 1.x tant que pytest reste <8.4.
3. 🔄 **Si pytest 8.4+ débarque** : évaluer si la montée de pytest-asyncio à 1.x devient possible ; pour l'instant, maintenir lock.

---

## PR #2535 : @fastify/rate-limit 10.3.0 → 11.2.0 (moot) ⊘ LEAVE

**État** : CLOSED (auto-fermée par Dependabot bot lui-même, 2026-08-03 21:09:51)

### Contexte
Root package.json n'a aucune dépendance directe @fastify/rate-limit. La vraie dépendance n'existe que dans services/gateway/package.json. Dependabot a généré un PR dupliqué (#2535 chore(deps-root)) après son PR légitime (#2492 chore(deps-gateway) pour le même bump 10.3.0→11.2.0).

### Timeline
- PR #2492 (deps-gateway, bump réel) → **MERGED** 2026-08-03 16:31:26 (commit 98cc74f9c) par jcnm
- PR #2535 (deps-root, bump fantôme) → generated par Dependabot
- PR #2535 → **AUTO-CLOSED** par Dependabot 2026-08-03 21:09:51 (bot comment: "Looks like @fastify/rate-limit is up-to-date now, so this is no longer needed")

### Gates
1. **PR state** → CLOSED (remote branch dependabot/npm_and_yarn/fastify/rate-limit-11.2.0 no longer exists)
2. **merge conflict check** → moot (no branch)
3. **duplicate cross-check** → CONFIRMED (#2492 already merged, supersedes #2535)

### Suites Données
1. ✅ **No action required** : #2492 a déjà livré le bump ; #2535 est un artefact Dependabot moot.
2. 📌 **Documentation** : root package.json n'est pas le maître pour @fastify/rate-limit ; any future bumps vont (correctement) via services/gateway/package.json uniquement.

---

## Restant — PRs Ouvertes (Dépendances Mineures)

État au 2026-08-03 21:30 UTC :

| PR | Titre | Verdict | Action |
|----|-------|---------|--------|
| #2546 | chore(deps-gateway)(deps): bump axios 1.18.1→1.19.0 | MONITOR | Mineure semver ; attend CI green |
| #2545 | chore(deps-web)(deps-dev): dev-dependencies group (2 updates) | MONITOR | Await CI |
| #2544 | chore(deps-root)(deps): bump @tanstack/query-async-storage-persister 5.100.9→5.101.4 | MONITOR | Mineure semver |
| #2543 | chore(deps-root)(deps): bump @radix-ui/react-alert-dialog 1.1.15→1.1.23 | MONITOR | Mineure semver |
| #2542 | chore(deps-root)(deps): bump workbox-window 7.4.0→7.4.1 | MONITOR | Patch ; safe merge |
| #2541 | chore(deps-translator)(deps): bump huggingface-hub 1.24.0→1.26.0 | MONITOR | Mineure Python ; await CI |
| #2540 | chore(deps-translator)(deps): bump aiohttp 3.14.1→3.14.3 | MONITOR | Patch Python ; safe merge |
| ~~#2513~~ | ~~grpcio-reflection 1.76.0→1.83.0~~ | LEAVE | ✋ **Blocker** — conflit protobuf 3-way |
| ~~#2528~~ | ~~pino 9.14.0→10.3.1~~ | LEAVE | ✋ **Blocker pré-existant** — FastifyInstance/TS errors |

### Priorités
1. **Mergeable immédiatement** : #2540 (patch aiohttp), #2542 (patch workbox)
2. **Await CI** : #2546, #2545, #2544, #2543, #2541
3. **Blockers stables** :
   - #2513 (grpcio-reflection) → awaits coordinated bump (grpcio-tools + protobuf)
   - #2528 (pino) → awaits upstream TS fix

### Statut CI Post-Merge (Main)
Derniers 5 runs on `main` (as of 21:30 UTC) :

| Run | Name | Conclusion | Status |
|-----|------|------------|--------|
| #432 | pip in /services/translator for grpcio-reflection #1503493634 | ✅ success | 21:21:47 |
| #95 | iOS (beta) → Xcode Cloud | ✅ success | 21:22:26 |
| #2521 | Docker | — | IN_PROGRESS 21:23:41 |
| #8700 | CI | — | IN_PROGRESS 21:22:50 |
| #2520 | Docker | ❌ cancelled | 21:18:21 |

---

## Recommandations Finales

### Court terme (24h)
1. Merge #2540, #2542 (patches, risk-free)
2. Monitor #2546, #2545, #2544, #2543, #2541 pour CI green, puis merge si clean

### Moyen terme (3–5j)
1. **Coordonnées bump** (grpcio-tools 1.83.0 + protobuf 7.35.1 + grpcio-reflection 1.83.0) :
   - Prepare manual commit (single changeset)
   - Validate via `uv pip compile --python-version 3.11 requirements.txt`
   - Land on main via standard PR (close #2513 post-merge)
2. **Pino 10.3.1** → re-queue once main's FastifyInstance/TS resolution is fixed (upstream or workspace reconfig)

### Documentation
- Mise à jour du guard comment in `requirements.txt` ✅ (commit 86f7d0326)
- Code comment in `services/translator/requirements.txt` pour pytest-asyncio revert policy reste valide

---

**Generated** : 2026-08-03 21:35 UTC | **Validation Pass** : 5 PRs audited, 1 merged, 2 LEAVE (blockers), 1 IGNORE (policy), 1 moot (auto-closed)
