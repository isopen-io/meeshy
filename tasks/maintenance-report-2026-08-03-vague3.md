# Rapport Maintenance + Livraison — 2026-08-03 Vague 3 (soirée)

**Objectif utilisateur** : compléter les merges restants, créer un livrable iOS 1.0.3 (TestFlight puis App Store), avec tests + compilations verts.

## 1. Réparation de main (bloquant découvert)

### Casse n°1 — TypeScript 7 embarqué en douce
- La PR #2524 (groupe `build-tools`, mergée vague 2) contenait **typescript 6.0.3 → 7.0.2** alors que le bump avait été explicitement différé (#2496).
- TS 7 (compilateur natif) n'expose plus l'API compilateur JS requise par `ts-jest` → **toutes les suites Jest échouaient au chargement** (Test web, Test gateway, Test agent, Voice API) sur main et sur toutes les PR basées dessus.
- Fix `52451a1d7` : revert vers ^6.0.3 (racine, web, agent, gateway — `packages/shared` reste en 7.0.2, vert depuis #1858), turbo 2.10.8 conservé, règle dependabot ignore semver-major typescript (3 sections), lockfiles régénérés.

### Casse n°2 — Split fastify 5.10/5.11 (latente, révélée par tsc)
- Le bump fastify gateway 5.11.0 (#2530) avec agent resté ^5.10.0 → deux copies dans le store bun → plus de hoist racine → `@fastify/jwt` ne résout plus `fastify` → son `declare module 'fastify'` devient un module ambiant isolé → `request.user` disparaît du typage (3 erreurs TS2339, et jusqu'à 354 erreurs / 160 suites rouges selon le layout de hoisting).
- Fix : alignement agent sur ^5.11.0 → copie unique 5.11.2, augmentation restaurée, tsc 0 erreur.

### Casse n°3 — fastify 5.11 ajoute la méthode QUERY
- `fastify.all()` enregistrait désormais `QUERY /api/v1/uploads(/*)` ; @tus/server répond 400 avant auth → le garde `route-auth-coverage` (401/403 attendus pour anonyme) échouait.
- Fix : enregistrement explicite des 6 méthodes tus (GET, HEAD, POST, PATCH, DELETE, OPTIONS), comportement identique à 5.10.

## 2. Merges réalisés (3 lots, push unique par lot, --no-ff → statut MERGED)

- **Lot 1 (9 PR)** : 2538 @tus/server 2.4.3, 2537 checkbox, 2536 progress, 2534 libphonenumber, 2533 dompurify*, 2532 framer-motion, 2531 toad-cache*, 2530 fastify*, 2519 dropdown-menu (*fermées contenu-sur-main après rebase-course Dependabot)
- **Majors (workflow deps-majors-gate, 6 agents)** : 2515 grpcio 1.83.0 **MERGÉE** (gates uv complets) ; 2511 pytest-asyncio **IGNORE** (pytest pinné 8.3.4 < 8.4 requis, déjà reverté 2026-07-20) ; 2535 rate-limit obsolète (vrai bump = #2492 mergée par jcnm) ; 2513 grpcio-reflection **LEAVE** (conflit à trois : reflection 1.83 exige protobuf ≥7.35.1, tools 1.76 exige <7 — bump coordonné documenté sur la PR, décision produit requise sur le cap protobuf <7)
- **Lot 2 (7 PR)** : 2528 pino 10.3.1 (audit breaking changes sain ; ses gates rouges venaient du dual-fastify préexistant, corrigé), 2540 aiohttp, 2541 huggingface-hub, 2542 workbox-window, 2543 alert-dialog, 2544 tanstack persister, 2545 types react
- **Lot 3 (6 PR)** : 2546 axios 1.19.0, 2547 react-query 5.101.4*, 2548 tabs, 2549 switch, 2550 react-virtual, 2551 tabs racine
- **Non traitées (arrivées en fin de passe, treadmill Dependabot)** : 2552 tailwind-merge, 2553 react-separator → prochaine passe.

## 3. Vérifications locales (bun, parité CI)

| Gate | Résultat |
|---|---|
| Web `bun run test` | 497 suites / 11 619 tests ✅ (1 flake transitoire re-run vert) |
| Gateway `bun run test:coverage` | 577 suites / 15 257 tests ✅ |
| Gateway `npx tsc --noEmit` | 0 erreur ✅ |
| Shared tests | 1448 ✅ · Agent tests : 250 ✅ |
| Translator `uv pip compile` | exit 0, pins cohérents (grpcio 1.83/tools 1.76/protobuf 6.33.6) ✅ |
| iOS `meeshy.sh build` | succès 97 s ✅ |

## 4. Livraison iOS 1.0.3 — ✅ LIVRÉE (2026-08-04 ~00:15)

- `MARKETING_VERSION` 1.0.2 → 1.0.3 (`c80202150`) ; build ASC **1269** (andp max-build)
- Séquence locale ANDP (workflow GitHub ANDP toujours cassé — MATCH_PASSWORD) : archive Release (-Onone, CURRENT_PROJECT_VERSION=1269) → strip ci_post_xcodebuild → export IPA 77 Mo → `andp release` → **TestFlight VALID** ✅
- CI finale verte AVANT upload : CI ✅ Docker ✅ **Release ✅ (vert pour la première fois depuis des semaines)** sur `5c3248431`/`b4ee9c76b`
- App Store : la 1.0.2 était **REJECTED** → `andp version set` a renommé l'enregistrement éditable en 1.0.3, build 1269 attaché, precheck 0 erreur/0 warning
- **Piège `andp submit` (409 « cannot be reviewed »)** : une reviewSubmission `UNRESOLVED_ISSUES` (résidu du rejet 1.0.2) bloquait la plateforme ; annulée via `PATCH /v1/reviewSubmissions {canceled:true}`. Les 2 échecs d'`andp submit` avaient laissé des coquilles VIDES `READY_FOR_REVIEW` non annulables (409) mais RÉUTILISABLES : `add_submission_item` + `mark_submitted` en granulaire → **IOS 1.0.3 WAITING_FOR_REVIEW** ✅

## 5. Restant / décisions

1. **2513 grpcio-reflection** : nécessite de lever le cap protobuf <7 (bump coordonné tools+reflection+protobuf) — décision produit.
2. **Treadmill Dependabot** : 2552/2553+ arrivent en continu (backlog hebdo) — prochaine passe.
3. **uv.lock translator obsolète** (2026-07-06) : la CI "Test Python" teste pyproject/uv.lock, PAS requirements.txt (source du Dockerfile) — le gate réel est le workflow Docker. À réaligner un jour.
4. Flake web (1 suite / 9 tests, non identifiée — tail tronqué) et flake `PostFeedService` connus.
