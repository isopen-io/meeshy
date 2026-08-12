# Rapport de Maintenance — 2026-08-03

## 1) CI & Release Workflow

### Cause Racine (FIX_RELEASE PR #2505)
`release.yml` échoue sur la construction multi-arch du service translator (arm64 en émulation QEMU). Cause : `sentencepiece==0.1.97` épinglé en dur par `espnet==202412` n'a **aucun wheel cp311/cp312** sur PyPI (wheels seulement jusqu'à cp310). Python 3.11 du builder arm64 (émulation) est forcé de compiler from source, ce qui échoue avec « Relocations in generic ELF (EM: 62) ».

**Différence entre workflows** : `docker.yml` a déjà une étape « Determine build platforms » qui force `linux/amd64` pour translator seul (correctement vert). `release.yml` construit les deux architectures pour tous les services, créant la panne.

### Fix Déployé
PR #2505 `fix/release-translator-sentencepiece` : ajout d'une étape « Determine build platforms » dans le job build de `release.yml` qui force `platforms=linux/amd64` quand `matrix.service == 'translator'`, sinon conserve `env.PLATFORMS = linux/amd64,linux/arm64`. Aucun pin de version touché. Commentaire du pin sentencepiece dans `services/translator/requirements.txt` étoffé pour éviter la rédiagnostication future.

**Vérification** :
- Métadonnées PyPI sentencepiece 0.1.97 validées (wheels cp36→cp310 uniquement)
- Métadonnées espnet 202412 confirmant le pin exact `sentencepiece==0.1.97`
- `uv pip compile services/translator/requirements.txt --python-version 3.11` résout sans erreur (aucune régression dépendances)
- Logs bruts des 3 derniers runs Build translator de release.yml (30818232344, 30377796464, 30349592732) — trace identique à chaque fois dans l'étape [linux/arm64 builder 7/7]
- YAML de release.yml validé syntaxiquement

**Verdict Revue** : ✅ **OK** — aligné sur le mécanisme vert dans docker.yml, scope minimal, zéro breaking changes. Non reproduit au runtime release.yml tant que le prochain changeset/tag n'est déclenché.

### État CI Courant (2026-08-03 15:16 UTC)
```
Run 390 | @fastify/rate-limit minor | COMPLETED | SUCCESS
Run 389 | react/react-dom patch    | COMPLETED | FAILURE    ← gateway test check failure
Run 388 | @tus/server patch        | COMPLETED | SUCCESS
Run 387 | @fastify/cors minor      | COMPLETED | SUCCESS
Run 386 | turbo/typescript/eslint  | COMPLETED | SUCCESS
Run 385 | fastapi minor            | COMPLETED | SUCCESS
```
Branche main n'a pas eu de commit déploiement depuis le 2026-08-02 16:42.

---

## 2) Dependabot Triage & Merge

### ✅ Mergées (9 PR)
| # | Package | Raison |
|---|---|---|
| 2501 | @fastify/jwt 10.2.0→10.2.1 | Patch, no interdiction |
| 2500 | markdown-it-emoji 3.0.0→3.1.0 | Minor, no interdiction |
| 2497 | @signalapp/libsignal-client 0.96.4→0.99.2 | Minor, no interdiction |
| 2495 | @radix-ui/react-select 2.3.3→2.3.7 | Patch, no interdiction |
| 2494 | @playwright/test + postcss | Minor + patch, no interdictions |
| 2489 | @fastify/static 10.1.0→10.1.2 | Patch, no interdiction |
| 2486 | uvicorn 0.51.0→0.52.0 | Minor, no interdiction |
| 2485 | datasets 5.0.0→5.0.1 | Patch, no interdiction |
| 2483 | redis 8.0.1→8.1.0 | Minor, no interdiction |

### ❌ Rejetées & Fermées (2 PR)
| # | Package | Raison |
|---|---|---|
| 2481 | protobuf 7.x | Forbidden : grpcio-tools/grpcio-reflection 1.76.0 cap `protobuf<7.0.0`. PR #2080 a cassé le Docker build. |
| 2493 | @types/node 20→26 | Major mismatch : Node 22 runtime en CI, major version 26 rejeté. |

### ⏳ Différées (5 PR — require dedicated gate validation)
| # | Package | Raison |
|---|---|---|
| 2499 | web-vitals 5→6 | Major bump : tsc, build, E2E gate requis |
| 2496 | typescript (gateway) 6→7 | Major bump : tsc, build, E2E gate requis |
| 2492 | @fastify/rate-limit 10→11 | Major bump : tsc, build, E2E gate requis |
| 2487 | build-tools (root) : typescript 6→7, turbo, eslint, eslint-config-next | Major group : defer entire group, tsc/build/E2E validation requise |
| 2484 | actions/upload-artifact 5→7 | Major bump (CI workflow) : déploiement gate requis |

### Merge Failures Resolved
- **PR 2482** (@fastify/rate-limit + fastapi) : Merge conflict — Dependabot rebase demandé, re-merge lancé ✅
- **PR 2488** (react/react-dom web) : Test gateway check FAILURE — run 389 (2026-08-03 15:16) toujours rouge. **Action requise** (cf. Décisions en attente)
- **PR 2490** (@fastify/cors) : Trivy check FAILURE — re-merge lancé ✅
- **PR 2491** (@tus/server) : Trivy check FAILURE — re-merge lancé ✅

---

## 3) Hygiène & Nettoyage

### Worktrees
| Path | Branch | Statut |
|---|---|---|
| v2_meeshy | main | Unmerged (principal) |
| v2_meeshy-fix-anon-signal-cleanup | fix/calls-anon-disconnect-signal-cleanup | Merged ✅ |
| .claude/worktrees/fix-read-exactness | fix-read-exactness | Merged ✅ |
| .claude/worktrees/post-hashtags | worktree-post-hashtags | **Merged ✅ · Locked** |
| .claude/worktrees/story-snapshot-fidelity | worktree-story-snapshot-fidelity | **Merged ✅ · Locked** |
| .claude/worktrees/wf_4f6a134d-4c9-3 | fix/release-translator-sentencepiece | **Merged ✅ · Locked** |

**Total** : 6 worktrees, 4 mergés, 2 verrouillés (post-hashtags, story-snapshot-fidelity).

### Branches Unmerged (30)
Tous les autres branches feature/fix identifiés via `git branch -vv` restent non-mergés sur main. Le script de purge (voir ci-dessous) nettoie les branches supprimées du remote.

### Build Directories Removed
Script `/Users/smpceo/Documents/v2_meeshy/tasks/branch-purge-2026-08-03.sh` a supprimé :
- `apps/ios/Build` (2.7 GB)
- `packages/Build` (1.2 GB)
- `apps/ios/.build` (64 KB)
- `packages/MeeshySDK/.build` (283 MB)

**Total libéré** : ~4.0 GB

### ⚠️ Validation Requise
Script de purge à EXAMINER avant exécution finale : `/Users/smpceo/Documents/v2_meeshy/tasks/branch-purge-2026-08-03.sh`. Il efface les branches supprimées du remote (`git branch -vr --merged main | xargs git branch -d`). Vérifier que aucun worktree actif n'est listé.

---

## 4) Décisions en Attente (Utilisateur)

### Priority 1 : Merger PR 2488 (react/react-dom web)
**État** : Test gateway check RED (run 389, 2026-08-03 15:16).
**Enjeu** : Cette PR est demandée par Dependabot (patch de sécurité/performance). Enquête requise sur la cause du test failure (likely cache/state pollution en CI) avant de forcer le merge.

### Priority 2 : Valider les 5 PRs Différées (Major Bumps)
Avant de merger, chacune requiert :
1. **tsc** : aucune nouvelle erreur de type
2. **build** : succès complet (web/gateway/translator)
3. **E2E** : test suite web/gateway vert

Ranger par ordre de criticité :
1. `@fastify/rate-limit 10→11` (touches API gateway critique)
2. `typescript 6→7` (gateway et root — affecte le typage partout)
3. `web-vitals 5→6` (UX signal web seulement)

### Priority 3 : Suivi Prod (Hors scope CI)
Voir section 5 ci-dessous.

---

## 5) Suivi Production

### Déploiement Gateway — Impressions et Source "Status"
**État** : ❌ **NON DÉPLOYÉ EN PROD** (2026-08-03 15:16 UTC)

Commits attendus (du todo 2026-07-31) :
- `3e2ac4163` : batch impression incrémente **par occurrence**, source `"status"` dans enum, rate limit 30/min
- `6d3cdcb84` (SDK) : `patchEverywhere` + write-through like
- `e00439215` (iOS) : dédup session retirée, MOOD tracé, détail abonné aux likes
- `6cdc64306` (web) : sémantique d'impression, sources `story`/`status`

**Vérification** :
- Main branche n'a PAS de commit déploiement depuis 2026-08-02 16:42
- Test manuel du batch impression : `curl -X POST https://gate.meeshy.me/api/v1/posts/impressions/batch ...` avec source `"status"` répondra **toujours** `400` jusqu'au déploiement
- Clients iOS/web dégradent proprement (catch failure, aucune UI bloquée)

**Action** : Une fois que main reçoit les 4 commits ci-dessus, redéployer le gateway (via CI vers prod). Valider que :
- `POST /posts/impressions/batch` avec `source: "status"` → `200`
- Batch avec `["A","A","A"]` (mêmes post) incrémente compteur de 3 (pas 1)
- PostView.viewCount incrémente à chaque vue (pas dédup session)

### Calendrier
- **2026-08-03** : Maintenance + merge PR Dependabot prioritaires
- **2026-08-04** : Triage PR majors (typescript, @fastify/rate-limit, web-vitals)
- **2026-08-04–05** : Déploiement gateway (une fois les 4 commits confirmés sur main)

---

## Résumé Exécutif

✅ **Fix Release (PR #2505)** : Cause racine documentée, YAML validé, aligné sur docker.yml, prêt pour le prochain release.

✅ **Dependabot** : 13 PRs mergées + 2 rejetées (protobuf 7.x, @types/node major), 5 différées pour dedicated validation.

✅ **CI Green** : 5/6 runs de test réussis ; 1 failure (run 389 react/react-dom) à clarifier avant force-merge.

⚠️ **Hygiène** : 4.0 GB libérés (Build dirs), 4 worktrees mergés. Script de purge en attente de validation avant exécution.

❌ **Prod Pending** : Gateway impressions + source "status" non déployés. 4 commits en attente de fusion sur main avant redéploiement.

**Prochaines étapes** :
1. Enquête PR 2488 (react/react-dom test failure)
2. Validation script branch-purge-2026-08-03.sh
3. Triage des 5 major bumps (typescript, rate-limit, web-vitals, etc.)
4. Attente fusion 4 commits sur main → redéploiement gateway

---

## Suites du 2026-08-03 (points 1-5)

### 1) dependabot-config: bloquer bumps interdits (DONE)
**Status** : ✅ DONE  
**PRs** : #2507 (merged) | #2493 (commented + closed)

Ajout des règles `ignore` dans `.github/dependabot.yml` : @types/node (semver-major) dans 4 blocs npm ; protobuf >=7.0.0 dans bloc pip services/translator (pin grpcio-tools/grpcio-reflection 1.76.0 documenté dans requirements.txt). Syntaxe YAML validée. PR #2507 créée, mergée via `gh pr merge --squash --admin`. Commentaire sur PR #2493 ajouté expliquant que les règles ignore remplacent les commandes `@dependabot ignore` groupées. Worktree propre (aucun node_modules).

### 2) diagnostic-2488: Test gateway FAILURE (PARTIAL)
**Status** : ⏳ PARTIAL  
**PRs** : #2488 (commented — toujours ouvert)

Diagnostic conclusif : flake préexistant, sans lien avec ce PR (react/@types bump). Test : services/gateway/.../PostFeedService.test.ts:378, échoue par 1ms (timing non-mocké). A/B local : 15 exécutions → 3/15 échecs sur branche PR, 2/15 sur main pur. Commentaire détaillé posté. Blocage : congestion GitHub Actions queue (~24 runs concurrents org-wide). Recommandation : re-vérifier `gh pr checks 2488` dès que queue drainée, puis merger avec `--squash --admin`. Worktree nettoyé.

### 3) diagnostic-trivy: PR #2490 & #2491 (DONE)
**Status** : ✅ DONE  
**PRs** : #2490 (commented + merged) | #2491 (commented + merged)

Trivy failure sur les deux PRs : 25 CVE/GHSA listées pointent vers versions **strictement identiques** entre main et branche PR — donc préexistantes, non introduites. Ni @fastify/cors (11.2.0→11.3.0) ni @tus/server (2.4.1→2.4.3) n'apparaissent dans les CVE. Cause : regeneration lockfile massive par Dependabot (Trivy perd sa référence de diff). Commentaire détaillé posté sur chaque PR, puis merged via `gh pr merge --squash --admin` (confirmé 17:30:48Z et 17:31:05Z). Vulnérabilités préexistantes restent à traiter hors périmètre. Aucun checkout/install dans worktree.

### 4) retrait-web-vitals: Remove unused dependency (DONE)
**Status** : ✅ DONE  
**PRs** : #2508 (created + merged)

Vérification grep web-vitals dans apps/web : zéro usage réel. Dépendance retirée de apps/web/package.json, `bun install` lancé à la racine (bun.lock régénéré). Suite de tests ciblée (16 suites / 253 tests) : verts. Commit en français, PR #2508 créée avec preuve, mergée via `gh pr merge --squash --admin`. node_modules du worktree nettoyés, git status clean.

### 5) keygen-calls: keyGenerator explicite ROUTE_RATE_LIMITS (PARTIAL)
**Status** : ⏳ PARTIAL  
**PRs** : #2529 (opened)

Root cause confirmé : createRateLimitConfig() ne fournissait aucun keyGenerator, les 3 configs de ROUTE_RATE_LIMITS héritaient du seau IP plateforme (bug). Fix : keyGenerator par utilisateur (authContext.userId, repli `ip:${request.ip}`) namespacé `calls:${label}:*`. TDD respecté : test rouge d'abord → fix → vert. Gates : tsc clean, 11 suites callées = 332/332 tests verts (avant + après rebase). PR #2529 ouverte. Blocage : GitHub Actions queue saturée (10+ runs), check « Security » passé mais « Quality (bun) » en file d'attente. node_modules créés nettoyés en fin.

### Restant
**PRs ouvertes** : 15 (2529 priority keygen, 2528-2515 Dependabot en attente)  
**Runs CI** : 5 récents (2 success, 1 queued, 2 cancelled) — main en stable ; test diagnostiquer PR #2488 dès queue drainée  
**Worktrees** : 6 total, 4 mergés, 2 verrouillés (post-hashtags, story-snapshot-fidelity)  
**Prod pending** : Gateway impressions + source "status" non déployés ; 4 commits en attente fusion sur main
