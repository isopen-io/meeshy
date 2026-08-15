# Workshop d'exécution — Lentille · Focal+Script · Rivière, de bout en bout

> **Statut** : plan d'exécution opérationnel. Il ne décide RIEN de nouveau sur le produit —
> il découpe en micro-tâches ce que décident `tasks/lentille-focal-workshop.md` (le séquenceur)
> et les deux contrats (`tasks/lentille-implementation-contract.md`, `tasks/focal-implementation-contract.md`),
> plus l'amendement R (§7) acté par décision produit du 2026-08-15.
> **Branche d'intégration** : `claude/lentille-workshop-tasks-ux7qql`, rebasée sur `main` = `abbf6aa9`
> (la lignée réparée : #3025 docs + #3024). Chaque vague pousse tôt, pousse souvent, et retire `main` à chaque frontière.
> **Orchestrateur** : Fable 5 (cette session). Les micro-tâches sont dimensionnées pour des agents
> simples et bon marché — l'économie est un objectif de premier rang (§1).

---

## 0. Trois faits d'ancrage — à re-prouver, jamais à supposer

Les contrats citent des numéros de ligne relevés sur une lignée antérieure. La lignée actuelle
(`abbf6aa9`) a bougé. Trois re-preuves déjà faites, à refaire par tout agent avant d'éditer :

| Ancrage du contrat | Réalité sur `abbf6aa9` |
|---|---|
| `ConversationListViewModel.swift:554` (`groupConversations`) | **`:486`**, chemin `apps/ios/Meeshy/Features/Main/ViewModels/` |
| `services/agent` (E15) | existe, inchangé |
| `packages/shared/utils/conversation-colors.ts` | toujours absent (E3 tient) |

**Règle RE-PROUVER** (leçon du dépôt) : la première action de toute micro-tâche est de vérifier
ses ancrages (`grep`, `ls`) et de les corriger dans son rapport. Un numéro de ligne n'est jamais
une donnée d'entrée fiable ; un symbole et un chemin le sont presque toujours.

---

## 1. L'économie — grille des modèles

Fable (cette session) orchestre, merge, arbitre, et n'exécute lui-même que ce qu'aucun agent ne peut porter.

| Modèle | Rôle | Ce qu'on lui confie | Ce qu'on ne lui confie JAMAIS |
|---|---|---|---|
| **Haiku 4.5** | basses besognes | fichiers de vecteurs JSON depuis une loi déjà écrite, `lentille-tokens.json` depuis §4.3, clés i18n, copie de fixtures en ressources de bundle, gardes source (tests `grep`), squelettes de suites de test, mises à jour de docs/CHANGELOG | toute décision, tout fichier partagé entre workstreams, toute résolution de conflit |
| **Sonnet 5** | vues de module & lois simples | chaque vue Lentille/Focal/Rivière prise isolément (row, sticker, pilule, rail, menu, peek, skeleton), miroirs Swift d'une loi TS déjà verte, providers de substitution, hooks web, tests unitaires d'un module, corrections d'écarts LWS-9 | restructurations de conteneurs existants, fichiers `packages/MeeshySDK`, gateway |
| **Opus 5** | uniquement si nécessaire | LWS-6 (conteneur sticky — le workstream le plus risqué), extension `renderFingerprint` (E13), passes de perspective/élection branchées sur du code vivant, `ConversationBridgeService` gateway (contrainte non-N+1), chemin agent **non écrivant** (C3), **revues d'architecture, d'intégration et de cohérence générale aux portes** | besognes qu'un Sonnet ferait — chaque tâche Opus est justifiée dans sa ligne |
| **Fable 5** | maître | portes V1/V2, merges de vagues, extensions de contrat, confrontation CI↔local, ce document | — |

**Règles d'escalade.**
1. Un agent bloqué **s'arrête et remonte** — il n'improvise pas. Fable requalifie la tâche (souvent : la scinder encore, rarement : monter de modèle).
2. Une tâche rendue deux fois fausse par Haiku passe à Sonnet ; deux fois fausse par Sonnet passe à Opus **avec un périmètre réduit de moitié**. Le remède à l'échec est d'abord un découpage plus fin, pas un modèle plus gros.
3. Aucun agent n'édite un fichier dont il n'est pas propriétaire (règle d'or des contrats). Découverte d'un besoin transverse ⇒ demande d'extension de contrat à Fable, tâche suspendue.

---

## 2. Protocole d'une micro-tâche — identique pour tous les agents

1. **RE-PROUVER** ses ancrages (§0).
2. **RED** : écrire le(s) test(s) qui échouent — le critère d'acceptation cité par la tâche, rien de plus.
3. **GREEN** : le minimum de code. Les constantes viennent de `packages/shared` ou des tokens — jamais en dur (garde R15 : aucun `520`, `380`, `0.45`, `0.82`, `900`, `25`, `24` littéral dans un fichier de peau).
4. **Vérifier localement** ce qui est vérifiable sous Linux : `cd packages/shared && bun test`, `cd apps/web && bun test`, `cd services/gateway && bun run test:coverage` (prérequis bun de `CLAUDE.md` : `npx prisma generate --generator client` + `bun run build` dans `packages/shared`). L'iOS ne compile pas sous Linux — voir §3.
5. **Committer et pousser** dès le vert local — un commit par micro-tâche, message `feat|fix|test(scope): <tâche> [LWS-x/Tnnn]`.
6. **Rapporter** : ancrages corrigés, fichiers touchés, tests ajoutés, tout écart contrat↔code découvert.

---

## 3. Git & CI — pousser tôt, compiler à distance, confronter

### 3.1 La branche et le rythme
- Tout se développe sur `claude/lentille-workshop-tasks-ux7qql` (et ses worktrees de vague, §4).
- **Push après chaque micro-tâche verte.** **Pull de `main`** (`git fetch origin main && git merge origin/main`) à chaque frontière de vague et avant chaque PR — jamais moins d'une fois par session d'agent.
- Les PR suivent le découpage P0→P9 du contrat Lentille §6. P0 (LWS-9) part la première, sans drapeau, n'attend rien.

### 3.2 Le CI comme compilateur iOS distant — la parallélisation demandée
Le dépôt fournit exactement le levier : `.github/workflows/ios.yml` (runner macos-15, Xcode 26.1.1) **compile app + cibles de test à chaque push** de branche, et n'exécute la suite complète que si le **sujet** du commit contient `run test` (ou `smoke test` / `to test`). `ci.yml` (ubuntu, bun) court en parallèle la matrice shared/web/gateway/agent.

Le patron d'économie, à chaque vague :
1. Les agents iOS écrivent code + tests sous Linux et **poussent** — le macOS CI compile pendant que…
2. …les agents Linux exécutent **localement** les suites bun des autres composants (shared, web, gateway).
3. **Le premier fini informe l'autre** : un rouge CI iOS (compilation) revient à l'agent iOS comme micro-tâche de correction ; un rouge bun local n'attend pas le CI. À la clôture de vague seulement, **un** commit avec `run test` dans le sujet paie la suite XCTest complète sur macOS.
4. **Confrontation** : quand CI et local divergent (bun vs node, macOS vs attendu), le bun/CI fait foi (`CLAUDE.md` — parité CI). La divergence elle-même devient une micro-tâche Haiku de documentation ou Sonnet de correction.

### 3.3 Gardes CI ajoutées par ce workshop (vague 0)
- Garde vecteurs : une suite qui charge **zéro** cas échoue (leçon 257).
- Garde drapeau web : le nom du drapeau n'apparaît qu'**une** fois hors résolveur/tests (LWS-10).
- Garde R15 : constantes de loi interdites hors `packages/shared`.

---

## 4. Les vagues — qui court en parallèle avec qui

```
V0 amorçage ──▸ V1 ┬ L0 noyau TS (C-*)            ⊥  P0 web hors-drapeau (W9-*)
                   └─▸ V2 miroirs Swift + mocks (M-*)
                        └─▸ V3 ┬ iOS Lentille (I-*)   ⊥   iOS Focal+Script (F-*)
                               └──────────▸ PORTE V1 (REV-3)
                                    └─▸ V4 ┬ web Lentille (WL-*) ⊥ web Focal+Script (WF-*)
                                           └──────▸ PORTE V2 (REV-4)
                                                └─▸ V5 ┬ gateway+agent (G-*)  ⊥  Rivière iOS+web (R-*)
                                                       └─▸ V6 bascule injection + recette croisée + activation (Q-*)
```

⊥ = fichiers disjoints, parallélisme sans risque (workshop §5). Interdits de parallélisme :
deux agents sur `ConversationListView.swift`, deux agents sur `packages/shared/utils/`,
deux agents sur `project.pbxproj` (géré par le dernier worktree iOS à merger, via XcodeGen).

Worktrees de vague (convention `CLAUDE.md`) :
```
git worktree add ../v2_meeshy-lentille-core -b feat/lentille-core claude/lentille-workshop-tasks-ux7qql   # V1-V2
git worktree add ../v2_meeshy-lentille-ios  -b feat/lentille-ios  claude/lentille-workshop-tasks-ux7qql   # V3
git worktree add ../v2_meeshy-lentille-web  -b feat/lentille-web  claude/lentille-workshop-tasks-ux7qql   # V4 (+W9 dès V1)
git worktree add ../v2_meeshy-lentille-gw   -b feat/lentille-gw   claude/lentille-workshop-tasks-ux7qql   # V5
```
Ordre de merge : core → web → iOS (pbxproj en dernier) → gateway.

---

## 5. Les micro-tâches

Notation : **Dép** = tâches bloquantes. **∥** = groupe parallèle (même lettre = peut courir ensemble).
Chaque tâche cite sa section de contrat — l'agent la lit AVANT d'écrire. Une tâche = un commit.

### V0 — Amorçage (6 tâches)

| ID | Tâche | Fichiers | Dép | Modèle | ∥ |
|---|---|---|---|---|---|
| S-001 | Re-prouver TOUS les ancrages des deux contrats sur `abbf6aa9` (symboles, chemins, lignes) ; publier la table corrigée en tête de ce fichier | `tasks/lentille-workshop-execution.md` (append) | — | Sonnet | a |
| S-002 | Harnais de vecteurs Jest : loader commun `packages/shared/__tests__/vectors/harness.ts` qui ÉCHOUE à zéro cas chargé (leçon 257) + test du harnais | `packages/shared/__tests__/vectors/` | — | Sonnet | a |
| S-003 | Garde CI R15 : script + test qui grep les littéraux de loi (`520/380/0.45/0.82/900` etc.) hors `packages/shared` — liste blanche vide au départ | `scripts/`, câblage `ci.yml` job quality | — | Haiku | a |
| S-004 | Squelette XcodeGen : dossier `apps/ios/Meeshy/Features/Main/Lentille/` + cible de ressources fixtures (copie `packages/shared/fixtures/` en ressource de bundle de test) — compilation CI verte à vide | `project.yml`, arbo Lentille vide | — | Sonnet | a |
| S-005 | Clés i18n neuves : pont ✦ (auteurs/`+N`/volumes/médias), modes de lecture, mention de partialité « sur les N derniers messages » — fr/en/es/pt, chemins conformes à l'existant | `apps/web/locales/*/conversations.json` | — | Haiku | a |
| S-006 | Page de suivi : table d'avancement des vagues (une ligne par tâche, cochable) en fin de ce fichier | ce fichier | — | Haiku | a |

### V1 — L0, le noyau TypeScript (22 tâches) — contrat Lentille LWS-0/1/2, workshop §2

| ID | Tâche | Fichiers | Dép | Modèle | ∥ |
|---|---|---|---|---|---|
| C-010 | Types gelés : `ConversationReadingMode`, `ReadingModePreference` (§3.1), `ConversationBridge{,Data}` (§3.2), `ConversationLiveCall` (§3.3) — types purs + Zod, zéro logique | `packages/shared/types/{reading-modes,conversation-bridge}.ts` | — | Sonnet | b |
| C-011 | `resolveOrchestratorDecision` — 4 branches + drapeau OFF + choix collant qui PRIME (LWS-0, critères 1-2) | `packages/shared/utils/reading-modes.ts` | C-010 | Sonnet | c |
| C-012 | `resolveCapabilities` — unique point de branchement invité/inscrit + éligibilité Rivière (≥ 5 actifs, jamais `direct`) | idem (même fichier, MÊME agent que C-011, séquentiel) | C-011 | Sonnet | c |
| C-013 | `resolveAssistTier` + `AssistCapabilityProbing` (sonde `false` partout) + garde e2ee : `e2ee` ∧ incapable ⇒ `deterministic`, JAMAIS `serverAgent` (workshop §4.4) | idem | C-012 | Sonnet | c |
| C-014 | `focusCurve(distance, variant)` `.thread`/`.list` — critères : `thread@400 → alpha 0.18` ; `list@520 → alpha 0.55, scale 0.96` ; la hauteur de rang n'apparaît nulle part | `packages/shared/utils/focus-curve.ts` | C-010 | Sonnet | d |
| C-015 | `electFocusRow` — hystérésis : oscillation ±40 px ⇒ gagnant stable | idem (même agent que C-014) | C-014 | Sonnet | d |
| C-016 | `scrollActivityLaw` — machine idle→active→idle, 900 ms, réarmement ; critères t+0.899/t+0.901 | `packages/shared/utils/scroll-activity.ts` | C-010 | Sonnet | e |
| C-017 | `resolveConversationSections` — partition exacte (chaque conversation dans UNE section), catégories à LEUR rang, bornes calendrier lecteur jamais UTC, aucune section vide | `packages/shared/utils/conversation-sections.ts` | C-010 | Sonnet | f |
| C-018 | `sortConversations` — épinglées→live→catégorie→`lastMessageAt` desc, repli `updatedAt`, départage par `id` ; non-régression E11 | idem (même agent que C-017) | C-017 | Sonnet | f |
| C-019 | `buildBridgeData` — données pas phrase ; 2 auteurs + `+N` ; zéro non-lu ⇒ `null` jamais pont vide | `packages/shared/utils/conversation-bridge.ts` | C-010 | Sonnet | g |
| C-020 | `formatBridge(data, t)` — même `data`, deux `t` ⇒ deux phrases (preuve E7) | idem (même agent que C-019) | C-019 | Sonnet | g |
| C-021 | Portage TS accent (E3) : blend 30/30/40, hueShift ±30°, repli palette 20, troncature `Math.trunc` (JAMAIS d'arrondi — `#31B6BA` pas `#31B6BB`) | `packages/shared/utils/conversation-colors.ts` | — | Sonnet | h |
| C-022 | Vecteurs `accent.vectors.json` GÉNÉRÉS depuis les valeurs Swift (`ColorGeneration.swift`) — le TS s'aligne, jamais l'inverse ; 20 cas, égalité entière sans tolérance | `packages/shared/fixtures/reading-modes/accent.vectors.json` | C-021 | Haiku | h |
| C-023 | Vecteurs `orchestrator` + `focus-curve` (1e-4) + `scroll-activity` | `packages/shared/fixtures/reading-modes/*.vectors.json` | C-011..C-016, S-002 | Haiku | i |
| C-024 | Vecteurs `sections` + `sort` + `bridge` | idem | C-017..C-020, S-002 | Haiku | i |
| C-025 | Vecteur dédié assist-tier e2ee (le trou qui ne se voit pas en recette — workshop §4.4) | idem | C-013 | Haiku | i |
| C-026 | `lentille-tokens.json` — TOUS les nombres de §4.3 du contrat (liste ET fil), structure à trois consommateurs | `packages/shared/design/lentille-tokens.json` | — | Haiku | j |
| C-027 | `behaviour-matrix.json` — 28 lignes vol. 5 §5.3 + 16 lignes vol. 4 §5, chaque ligne un `id` ; garde d'ensemble « déclarés == couverts » côté Jest | `packages/shared/fixtures/conformance/` | S-002 | Sonnet | j |
| C-028 | Protocoles providers figés : `ConversationBridgeProviding`, `ReadingModePreferenceStoring`, `ConversationLiveCallProviding` (LWS-2bis — les interfaces SEULES) | `packages/shared/providers/*.ts` | C-010 | Sonnet | k |
| C-029 | `bridge` sur `MeeshyConversation` + repli dans `renderFingerprint` : valeurs de traductions comprises, clés triées, pont `nil` ⇒ fingerprint inchangé (E13) | `packages/MeeshySDK/.../CoreModels.swift` | C-010 | **Opus** (portillon de re-render, régression jumelle B1) | l |
| C-030 | `BridgeFingerprintTests` : texte traduit seul change ⇒ fingerprint change ; pont nil ⇒ identique à aujourd'hui | `apps/ios/MeeshyTests/Unit/Lentille/BridgeFingerprintTests.swift` | C-029 | Sonnet | l |
| C-031 | Loi de sectionnement web LWS-9 : tri → `sortConversations` dans `useConversationSorting` (E11) | `apps/web/components/conversations/hooks/useConversationSorting.ts` | C-018 | Sonnet | m |
| REV-1 | **Revue d'architecture du noyau** : cohérence types↔lois↔vecteurs↔protocoles, aucune constante orpheline, API stables avant gel S1 | lecture seule | C-010..C-031 | **Opus** | — |

### V1-bis — P0 web, hors drapeau, part immédiatement (5 tâches) — LWS-9

| ID | Tâche | Fichiers | Dép | Modèle | ∥ |
|---|---|---|---|---|---|
| W9-001 | Recherche sur le préview RÉSOLU par le Prisme en plus du titre — « Bonjour » trouve l'original « Hello » traduit | `useConversationFiltering.ts` + test `.prisme` | — | Sonnet | n |
| W9-002 | Déduplication par `id` à la sélection du cache infini (E10) — deux pages se recouvrant rendent UNE ligne | sélection `use-conversations-query` + test `.dedupe` | — | Sonnet | n |
| W9-003 | Désaccord de chemin i18n `noConversationsFound` (E14) : confirmer la portée du `t` injecté À L'EXÉCUTION, puis aligner l'appel — pas de doublon de clé ; vérifier `noConversations` au passage | `EmptyConversations.tsx` ou clé remontée | — | Sonnet | n |
| W9-004 | Tests de non-régression P0 drapeau éteint (les 4 corrections passent sans Lentille) | `apps/web/__tests__/...` | W9-001..003, C-031 | Haiku | n |
| W9-005 | **PR P0** : assembler, pull main, pousser, suivre le CI jusqu'au vert | — | W9-004 | Fable | — |

### V2 — Miroirs Swift + substituts (12 tâches) — L0.d + LM, LWS-5 (miroirs) + LWS-2bis

| ID | Tâche | Fichiers | Dép | Modèle | ∥ |
|---|---|---|---|---|---|
| M-040 | Miroir Swift `LentilleSectionResolver` (sections + tri) + suite `SectionResolverVectorTests` (nommage SANS jeton `Conversation` — gate `meeshy.sh` phase 1) | `Lentille/Core/LentilleSectionResolver.swift` + tests | C-024, S-004 | Sonnet | o |
| M-041 | Miroir Swift `LentilleBridgeFormatter` + `BridgeFormatterVectorTests` | `Lentille/Core/LentilleBridgeFormatter.swift` + tests | C-024 | Sonnet | o |
| M-042 | Miroirs Swift orchestrateur + capacités + assist-tier (`ReadingModeOrchestrator`) + vecteurs | `Focal/Core/` (miroirs, amendement A2) | C-023, C-025 | Sonnet | o |
| M-043 | Miroirs Swift `FocalFocusCurve` (paramétrée .thread/.list, A3) + `FocalFocusElector` + vecteurs | `Focal/Core/` | C-023 | Sonnet | o |
| M-044 | Miroir Swift `ScrollTimePillLaw` → `scrollActivityLaw` (A4) + vecteurs | `Focal/Core/` | C-023 | Sonnet | o |
| M-045 | `LentilleMetrics` (rang 64, avatar 44 = `.conversationHeaderCollapsed`, anneau 1.5, point 8, nom bodySize `.heavy`…) + `LentilleMetricsTests` de parité avec `lentille-tokens.json` | `Lentille/Core/LentilleMetrics.swift` | C-026 | Sonnet | p |
| M-046 | `LentilleFeatureFlag` (`UserDefaults` + `ProcessInfo` `MEESHY_FLAG_LENTILLE_LIST`, défaut OFF) + `LentilleFlagGateTests` ; idem drapeau Focal `reading_modes` (WS-1 amendé) | `Lentille/Core/LentilleFeatureFlag.swift`, flag Focal | — | Sonnet | p |
| M-047 | Providers TS locaux : `LocalBridgeProvider` (`isComplete:false` si fenêtre incomplète), `LocalLiveCallProvider` (nil si inconnu), store préférence local — mêmes vecteurs que le futur réel, garde « aucun fichier de peau ne nomme Local…/Gateway…Provider », garde zéro requête réseau | `packages/shared/providers/` impls + tests | C-028 | Sonnet | q |
| M-048 | Miroirs Swift des trois providers + `LocalBridgeProviderTests` + `ProviderSubstitutionTests` (bascule d'injection ⇒ aucun snapshot ne bouge) | `apps/ios/.../Lentille/` providers + tests | M-047 | Sonnet | q |
| M-049 | Tokens CSS depuis `lentille-tokens.json` + test de parité web (modèle `MeeshyTokenParityTest` : réparer le token, jamais le test) | `apps/web/` tokens + test | C-026 | Haiku | p |
| M-050 | Commit de clôture V2 avec `run test` dans le sujet — suite XCTest complète sur macOS CI ; pendant l'attente, suites bun locales shared+web | — | M-040..M-049 | Fable | — |
| REV-2 | **Revue de parité** : chaque miroir lit les MÊMES fichiers de vecteurs, sur le même commit de `fixtures/` ; gel S1 prononcé (lois, vecteurs, tokens, protocoles figés) | lecture seule | M-050 | **Opus** | — |

### V3 — iOS : Lentille (I-*) ⊥ Focal+Script (F-*) — LWS-5→8 et WS-1→11 amendés

Chaque agent pousse à chaque tâche verte ; macOS CI compile pendant que les suites bun tournent en local (§3.2).

| ID | Tâche | Fichiers | Dép | Modèle | ∥ |
|---|---|---|---|---|---|
| I-060 | Greffe : CORPS de `groupConversations` (`:486`) → appel miroir ; signature/`nonisolated`/static inchangés ; snapshot 30 conversations drapeau OFF identique ; garde `debounce(16ms)` intact (E6) | `ConversationListViewModel.swift` (corps seul) | REV-2 | Sonnet | r |
| I-061 | `LentilleSticker` + `SectionScrollPill` + `StoriesVivantsRail` (vues pures, tokens, sans montage) | `Lentille/Chrome/*.swift` | REV-2 | Sonnet | r |
| I-062 | **Restructuration sticky** : `LazyVStack` → `Section{}header:{}` + `pinnedViews`, re-câblage `SectionDropDelegate`/`SectionFrameRegistry` sur le `header:`, pliage conservé (E4) — LE workstream le plus risqué | `ConversationListView.swift` | I-060, I-061 | **Opus** | s |
| I-063 | Montage pilule sur le signal `isScrollingDown` EXISTANT (un détecteur, trois consommateurs — aucun observateur neuf) + rail ≤ 6 masqué si vide | `ConversationListView.swift` (même agent que I-062, séquentiel) | I-062 | **Opus** | s |
| I-064 | Tests LWS-6 : `StickySectionStructureTests`, `SectionDropTargetTests` (4 sections ciblées), `ScrollPillStateTests`, `LentilleChromeSourceGuardTests` (aucun ScrollViewReader neuf) | `MeeshyTests/Unit/Lentille/` | I-063 | Sonnet | s |
| I-065 | `LentilleConversationRow` + `LentilleBridgeLine` : mêmes entrées que `ThemedConversationRow`, `==` copié puis ÉTENDU à `bridge`, `Button(.plain)` jamais `.onTapGesture`, aucun `@State` de langue, AUCUNE carte | `Lentille/Row/` | REV-2 | Sonnet | t |
| I-066 | `LentilleSkeletonRow` — géométrie exacte (avatar 44, deux barres), affiché uniquement sur cache vide | `Lentille/Row/LentilleSkeletonRow.swift` | I-065 | Sonnet | t |
| I-067 | Mux de rang sous drapeau dans `ConversationRowItem` — `SwipeableRow`, menus OS, portillon `.equatable()` inchangés autour | `ConversationListView+Rows.swift` (mux seul) | I-065 | Sonnet | t |
| I-068 | Tests LWS-7 : `LentilleRowEquatableTests`, `LentilleRowPrismeTests` (règle 3 : ['fr','en'], original en, trad fr ⇒ « Bonjour »), `LentilleRowSourceGuardTests` (pas de `unreadBadgeBackground`, pas de `.font(.system(size:`), `LentilleSkeletonGeometryTests` | `MeeshyTests/Unit/Lentille/` | I-066, I-067 | Sonnet | t |
| I-069 | `LentillePerspective` par `.visualEffect` — pur compositor, courbe = `focusCurve(_, .list)` jamais réécrite ; garde source (ni `frame(height:` ni `invalidate`) ; reduce motion ⇒ tout à 1 | `Lentille/Perspective/` | REV-2 | **Opus** (greffe sur scroll vivant) | u |
| I-070 | Élection focus card : `onScrollGeometryChange` iOS 18+, repli `PreferenceKey` 60 Hz iOS 17, bande `bottom−140±45`, suit le défilement jamais les événements | même agent que I-069 | I-069 | **Opus** | u |
| I-071 | Focus card + encoche « AUTO · <décision> » + chip mode mémorisé — hauteur inchangée, ring accent de CETTE conversation | `Lentille/Perspective/`, `Lentille/Mode/` | I-070 | Sonnet | u |
| I-072 | `LentilleModeMenu` (Rivière TOUJOURS présente, grisée avec raison réelle et seuils vivants) + `LentillePeekView` + sous-menu « Mode de lecture » dans `nativeContextMenuView` APRÈS « Marquer lu » — timings `RowPressBounceModifier` gelés | `Lentille/Mode/`, `ConversationListView+Overlays.swift` | I-071, M-048 | Sonnet | u |
| I-073 | Tests LWS-8 : `LentillePerspectiveCurveTests`, `FocusCardElectionTests`, `ModeMenuModelTests`, `ModePreferenceRoundTripTests` (aller-retour Auto⇆forcé), `PeekViewModelTests` | `MeeshyTests/Unit/Lentille/` | I-072 | Sonnet | u |
| F-080 | Focal WS-1 : préférence locale (future cache optimiste, A5), identité lecteur, libellés VoiceOver | contrat Focal §WS-1 (fichiers y listés) | REV-2 | Sonnet | v |
| F-081 | Focal WS-2 : pilule « jour · heure » sur `scrollActivityLaw` partagée (A4) | contrat Focal §WS-2 | REV-2 | Sonnet | v |
| F-082 | Focal WS-3 : blocs riches de la rangée plate (médias radius 16, citation filet 2.5 couleur auteur) | contrat Focal §WS-3 | REV-2 | Sonnet | w |
| F-083 | Focal WS-4 : `FocalRow` — la rangée plate, densité Script comprise (même rangée, densité uniforme, zéro perspective) | contrat Focal §WS-4 | F-082 | Sonnet | w |
| F-084 | Focal WS-5 : `FocalScrollPass` — perspective `.thread`, géométrie inversée + correction d'ancrage (§4 du contrat Focal, algorithme coté) | contrat Focal §WS-5 | F-083 | **Opus** (géométrie inversée, 6 sites d'appel) | w |
| F-085 | Focal WS-6 : hôte de défilement (atterrissage dans la bande, inset de tête) | contrat Focal §WS-6 | F-084 | Sonnet | w |
| F-086 | Focal WS-7 : coquille de conversation — l'orchestrateur décide dans `ConversationView.init` (A6), bascule Focal/Script/bulles sous drapeau | contrat Focal §WS-7 | F-085, M-042 | Sonnet | v |
| F-087 | Focal WS-8 : digest déterministe, épisodes, classement de la Rampe (`isComplete` honnête) | contrat Focal §WS-8 | REV-2 | Sonnet | x |
| F-088 | Focal WS-9 : Résumé Vivant — UI + Rampe (l'état d'abord, la preuve à un tap) | contrat Focal §WS-9 | F-087 | Sonnet | x |
| F-089 | Focal WS-10 : surfaces agent ✦ stub + grammaire pointillée (avatar pointillé 1.5, `agent_grammar` OFF) | contrat Focal §WS-10 | F-088 | Sonnet | x |
| F-090 | Tests Focal WS-11 : gardes source, Dynamic Type, VoiceOver, suites de vecteurs du fil | contrat Focal §WS-11 | F-086, F-089 | Sonnet | v |
| I-074 | Clôture V3 : merge worktree iOS (pbxproj en dernier), commit `run test`, suite XCTest complète — pendant l'attente : suites bun web+gateway en local | — | I-073, F-090 | Fable | — |
| REV-3 | **PORTE V1 — revue d'intégration iOS** (Opus) : 7 vecteurs XCTest verts, parité tokens, matrice 28+16 id couverts, planche 25 cas, a11y, perf Instruments (< 1 ms/frame, zéro allocation), drapeaux OFF ⇒ bit-à-bit, non-régression gestes | lecture + verdict | I-074 | **Opus** | — |

### V4 — Web : Lentille (WL-*) ⊥ Focal (WF-*) — LWS-10/11, après PORTE V1

| ID | Tâche | Fichiers | Dép | Modèle | ∥ |
|---|---|---|---|---|---|
| WL-100 | `resolveLentilleFlag` pur (searchParam→cookie→env→OFF) + extension `useFeatureFlags` + garde « une seule occurrence hors résolveur » | `hooks/use-feature-flags.ts` + résolveur + test | REV-3 | Sonnet | y |
| WL-101 | Mux dans `ConversationList.tsx` : `next/dynamic` (drapeau off ⇒ bundle non téléchargé) + `FeatureErrorBoundary` fallback = rendu historique + abonnement typing (même service que le fil, dot forcé vert) | `ConversationList.tsx` | WL-100 | Sonnet | y |
| WL-102 | `LentilleRow` + `LentilleBridgeLine` : rang plat 64, avatar 44, anneau `--row-accent` (C-021), ligne 2 par `resolveLastMessagePreview` (chemin EXACT de `ConversationItem`), badge destructive SUPPRIMÉ → point 8 + pont ✦, précédence typing>brouillon>pont>préview | `components/conversations/lentille/` | WL-100, M-049 | Sonnet | z |
| WL-103 | `LentilleSticker` + `SectionScrollPill` + `LivesRail` + `LentilleSkeletonRow` (sticky CSS, `aria-hidden`, ≤ 6, masqué si vide) | idem | WL-100 | Sonnet | z |
| WL-104 | `useLentillePerspective` (UN `requestAnimationFrame`, style inline sur wrapper interne, `prefers-reduced-motion` ⇒ désactivée) + `useScrollActivity` factorisé (consommé aussi par le Focal web) | `hooks/lentille/` | WL-100 | Sonnet | z |
| WL-105 | Tests LWS-10 : `LentilleRow.test`, `LentilleRow.prisme.test`, `useLentillePerspective.test`, `LentilleSticker.test` + snapshot drapeau OFF identique + garde « aucun useQuery dans la peau » + contraste pont ≥ 4.5:1 deux thèmes + a11y (`role="button"`, aria-label complet) | `apps/web/__tests__/` | WL-102..104 | Sonnet | z |
| WL-106 | `ReadingModeMenu` (3 chemins : encoche, ⋮ existant, aperçu) via `conversation-preferences-store` optimiste versionnée + `LentillePeek` (clic droit + appui long 420 ms annulé par scroll) | `ReadingModeMenu.tsx`, `LentillePeek.tsx` | WL-102 | Sonnet | aa |
| WL-107 | Tests LWS-11 : rollback sur échec, `version` inférieure ignorée, Rivière grisée raison réelle, tap court jamais intercepté | `apps/web/__tests__/` | WL-106 | Sonnet | aa |
| WF-110 | Focal web : `FocalRow` + densité Script (rangée plate, retrait 29, interligne 1.42) — arbre vivant uniquement, `components/v2/**` INTERDIT (E12) | `components/conversations/focal/` | REV-3 | Sonnet | ab |
| WF-111 | Focal web : perspective `.thread` + élection (hooks partagés WL-104) + pilule jour·heure | idem | WF-110, WL-104 | Sonnet | ab |
| WF-112 | Focal web : citation filet, médias radius 16, capsule date sticky, rangée pont/agent pointillée | idem | WF-110 | Sonnet | ab |
| WF-113 | Tests Focal web + parité comportementale id par id avec iOS (16 lignes vol. 4 §5) | `apps/web/__tests__/` | WF-111, WF-112 | Sonnet | ab |
| REV-4 | **PORTE V2 — revue d'intégration web** (Opus) : 7 vecteurs Jest verts, parité tokens CSS, 44 id couverts ET web ≡ iOS id par id, planche 25 cas vs planche iOS, axe-core, profiler (Layout Shift 0), snapshot OFF, test câblage Prisme `ConversationItem` toujours vert | lecture + verdict | WL-107, WF-113 | **Opus** | — |

### V5 — Gateway + agent (G-*) ⊥ Rivière (R-*) — LWS-3/4 + §5.1, après PORTE V2

| ID | Tâche | Fichiers | Dép | Modèle | ∥ |
|---|---|---|---|---|---|
| G-120 | Prisma : `readingMode String @default("auto")` sur `UserConversationPreferences` (jamais le clé/valeur, E9) + migration | `packages/shared/prisma/schema.prisma` | REV-4 | Sonnet | ac |
| G-121 | Route préférences : schéma + `PUT` + broadcast à L'UTILISATEUR seul ; `version:{increment:1}` intact ; 400 hors énumération ; patch partiel n'efface pas | `services/gateway/src/routes/conversation-preferences.ts` + test `.readingMode` | G-120 | Sonnet | ac |
| G-122 | `ConversationBridgeService` : `buildBridgeData` DANS la passe `unreadCountMap` existante (jamais N+1), droits de lecture respectés (message effacé, `clearHistoryBefore`), `unreadCount===0` ⇒ champ ABSENT | `services/gateway/src/services/` + test | REV-4 | **Opus** (coût de la liste, droits) | ac |
| G-123 | Attache : mapping `GET /conversations` + payload `conversation:unread-updated` + `suggestedMode` précalculé (A6) — tri et curseur `before` INTACTS | `routes/conversations/core.ts`, `socketio/` + test `conversations.bridge` | G-122 | Sonnet | ac |
| G-124 | Bascule d'injection P7 : `GatewayBridgeProvider` etc. remplacent les substituts — AUCUN snapshot de vue ne bouge (R19) | injections iOS + web | G-123, G-121 | Sonnet | ac |
| G-125 | Agent §5.1 : résumé borné à une plage de messages + format 1 ligne (contraintes de génération sur l'observer) | `services/agent/` (observer) | REV-4 | Sonnet | ad |
| G-126 | Agent C3 : chemin de production NON ÉCRIVANT — débouché de lecture adossé à l'observer, SANS `generator`+`delivery`, sans identité d'emprunt ; `agent_grammar` reste OFF | `services/agent/` | G-125 | **Opus** (la contrainte la plus importante du contrat) | ad |
| G-127 | Gateway↔agent : intersection résumé/fenêtre non lue, repli déterministe si non couvrant (C2), étage agent avec paire `translations`+`originalLanguage` (E7) | gateway + test | G-126, G-123 | Sonnet | ad |
| R-130 | **Rivière — loi** : `resolveRiverLanes({messages, participants, viewerId})` → couloirs par participant, ancres de bulles, segments de polyligne (la ligne ENTOURE la bulle et poursuit sa course), connecteurs de réponse (bulle → message répondu) — données pures, zéro pixel ; vecteurs `river-lanes.vectors.json` | `packages/shared/utils/river-lanes.ts` + fixtures (extension L0 accordée par Fable) | REV-4 | **Opus** (loi neuve, géométrie) | ae |
| R-131 | Rivière — tokens : largeur de trait, écart de couloirs, rayon de contournement de bulle, heure en base de bulle, courbe des connecteurs — dans `lentille-tokens.json`, section `river` | `packages/shared/design/lentille-tokens.json` | R-130 | Haiku | ae |
| R-132 | Miroir Swift `RiverLaneResolver` + vecteurs XCTest | `Focal/Core/` ou `Riviere/Core/` | R-130 | Sonnet | ae |
| R-133 | Rivière iOS : rendu Canvas/Path — couleur de ligne par participant via `DynamicColorGenerator.colorForName`, bulles sur les lignes, heure en base, connecteurs de réponse ; mode sélectionnable quand `resolveCapabilities` l'ouvre (≥ 5 actifs, jamais direct), drapeau `riviere_mode` OFF | `Riviere/` iOS | R-132, I-074 | Sonnet | af |
| R-134 | Rivière web : rendu SVG overlay, mêmes lois, mêmes tokens | `components/conversations/riviere/` | R-130, REV-4 | Sonnet | af |
| R-135 | Menu de mode : dégriser Rivière quand éligible (les 3 plateformes de menu : I-072, WL-106) — la raison grisée reste pour les inéligibles | mux menus (extension accordée) | R-133, R-134 | Sonnet | af |
| R-136 | Tests Rivière : vecteurs 2 suites, snapshot OFF identique, éligibilité (direct jamais, < 5 grisé), connecteur pointe le bon message, a11y (ordre DOM = ordre chronologique) | suites iOS + web | R-135 | Sonnet | af |
| REV-5 | **Revue de cohérence gateway+agent+Rivière** (Opus) : non-N+1 prouvé, C1/C2/C3 tenus, bascule P7 neutre, Rivière conforme à la loi partagée | lecture + verdict | G-127, R-136 | **Opus** | — |

### V6 — Recette croisée et activation (LWS-13) — après REV-5

| ID | Tâche | Fichiers | Dép | Modèle | ∥ |
|---|---|---|---|---|---|
| Q-140 | Matrice §5.3 (28 id) rejouée drapeau ON, iOS + web | suites de recette | REV-5 | Sonnet | ag |
| Q-141 | R1→R20 : chaque critère, sa preuve, son propriétaire — table de verdicts | `tasks/` rapport | REV-5 | Sonnet | ag |
| Q-142 | A11y croisée : Dynamic Type `.accessibility5` sans troncature (8 branches de ligne 2), VoiceOver, axe-core, contrastes AA deux thèmes | suites + rapport | Q-140 | Sonnet | ag |
| Q-143 | Perf : Instruments + profiler navigateur, 60/120 Hz, < 1 ms/frame, zéro allocation, Layout Shift 0 — MESURÉ, pas déduit | rapport | Q-140 | Sonnet | ag |
| Q-144 | Snapshots drapeaux OFF trois surfaces (innocuité R20) + `meeshy.sh` : suites de perf ajoutées à `NON_PHASE_SUITES` (seul droit d'édition LWS-13) | suites | Q-140 | Haiku | ag |
| Q-145 | **Clôture phase 1** : les 10 points de §9.1 du workshop, verdict ligne par ligne ; activation progressive (`NEXT_PUBLIC_LENTILLE_DEFAULT`, défaut TestFlight) — décision produit finale à l'utilisateur | rapport + PR finale | Q-141..Q-144 | **Opus** puis Fable | — |

**Phase 2 (Android, LWS-12)** : fermée tant que Q-145 n'est pas actée. Son découpage sera un
avenant à ce fichier — sur un cœur figé, il se réduira à ~15 tâches Sonnet + 1 revue Opus.

---

## 6. Récapitulatif d'économie

| Vague | Tâches | Haiku | Sonnet | Opus | Portes |
|---|---|---|---|---|---|
| V0 | 6 | 3 | 3 | 0 | — |
| V1 + P0 | 28 | 6 | 19 | 2 (C-029, REV-1) | gel S1 |
| V2 | 12 | 1 | 9 | 1 (REV-2) | S1 |
| V3 | 26 | 0 | 19 | 6 (I-062/063/069/070, F-084, REV-3) | **V1** |
| V4 | 13 | 0 | 12 | 1 (REV-4) | **V2** |
| V5 | 16 | 1 | 11 | 4 (G-122, G-126, R-130, REV-5) | S3 |
| V6 | 6 | 1 | 4 | 1 (Q-145) | clôture |
| **Total** | **107** | **12** | **77** | **15** | |

~72 % Sonnet, ~11 % Haiku, ~14 % Opus — l'Opus est concentré exactement là où les contrats
signalent le risque (sticky, perspective vivante, portillon SDK, non-N+1, C3, portes). Les tâches
se subdivisent encore à l'exécution si un agent peine (règle d'escalade §1) — le plafond de coût
est le découpage, pas le modèle.

---

## 7. Amendement R — la Rivière gagne son procès (décision produit 2026-08-15)

Le workshop §8 tenait la Rivière « hors périmètre tant qu'elle n'a pas gagné son procès (vol. 3) ».
**Le propriétaire produit a rendu le verdict le 2026-08-15 : la Rivière se construit**, sur iOS et web,
dans ce chantier, comme mode de lecture du fil. Le contrat Lentille reste vrai partout ailleurs :
le catalogue la portait déjà (`ConversationReadingMode = 'river'`), `resolveCapabilities` portait déjà
son éligibilité (≥ 5 participants actifs, jamais en `direct`), le menu la montrait déjà. Ce qui change :
elle devient **sélectionnable** quand éligible, derrière son propre drapeau `riviere_mode` (défaut OFF).

**La forme, actée** (source : description produit du 2026-08-15) :
- Chaque participant possède **une ligne** — sa course dans la conversation, teintée à sa couleur
  (`DynamicColorGenerator.colorForName`, les trois plateformes l'ont déjà).
- Les messages sont des **bulles posées sur les lignes** : la ligne de l'auteur **entoure la bulle**
  (le bord de la bulle EST un segment de sa ligne) **et poursuit sa course** vers son message suivant.
- La **date/heure vit en base de bulle**.
- Une **réponse** fait partir un **second trait** de la bulle vers le message auquel elle répond,
  dans le couloir du destinataire.
- L'ordre chronologique global est préservé verticalement ; les couloirs se répartissent
  horizontalement. Reduce motion ⇒ aucun tracé animé. L'ordre du DOM/accessibilité reste
  strictement chronologique — les lignes sont décoratives (`aria-hidden`), le contenu prime.

**Ce qui ne change pas** : l'éligibilité (jamais en 1:1, jamais sous 5 actifs — la raison grisée
reste affichée aux inéligibles avec ses valeurs réelles), le Prisme (les bulles Rivière résolvent
leur langue par `resolveLastMessagePreview`/`preferredTranslation`, comme toute bulle), et la
règle des lois : la géométrie des couloirs est une **loi partagée vectorisée** (R-130), jamais
recalculée à façon par une plateforme.

---

## 8. Suivi d'avancement

Renseigné par Fable à chaque clôture de vague. `✅` = mergé + CI vert.

| Vague | État | Commit de clôture | CI |
|---|---|---|---|
| V0 | ✅ livrée (S-001→S-005, S-006 = cette table) | 42d3d9a2e | vert local |
| V1 + P0 | ✅ livrée — 22 tâches, PR P0 = #3030 ; C-031 sur branche (dépend de la loi partagée, suivra en P1) | (courant) | bun vert local, macOS en cours |
| V2 | ✅ 12/12 livrées — 5 miroirs Swift (89 vecteurs rejoués du bundle), providers TS+Swift, métriques, drapeaux, tokens CSS ; gel S1 prononcé ; main mergé. **REV-2 rendu** : 1 blocker (LocalBridgeProvider TS lisait `window.unreadCount` au lieu du `input.unreadCount` autoritatif du protocole — corrigé, tests discriminants jumeaux TS+Swift) + réserves R1 (substitution TS ajoutée), R3 (formatMediaSegment Swift aligné `count > 0`), R2/R4/R5/R6 tracées pour V3+. Exécution croisée : shared 1955 verts, web 899 verts, XCTest 11 suites Lentille vertes (run 31887931317), sdk-tests 7235/7236 (garde CollapsibleHeader réparé 8b30ec4f0) | 037a739d2 | **gel S1 CONFIRMÉ** — CI+iOS+SDK Tests verts sur 037a739d2 (runs 31891087403/306/455) |
| V3 | ✅ **26/26 livrées** — deux worktrees ⊥ mergés (`feat/focal-ios-v3` → `feat/lentille-ios-v3`, zéro conflit, zéro édition pbxproj — le CI régénère). Lentille : greffe `groupConversations` (OFF bit-à-bit), sticky `Section/pinnedViews` + inset `CollapsibleHeaderMetrics`, identités `lentille.*` non-droppables/non-repliables, pilule sur `scrollOffsetRelay` (900 ms par la loi), rail fusionné avec « moi », rang plat + pont ✦ (`==` 13 clauses), squelette muxé, perspective `.visualEffect` (inerte iOS 16 — cible 16.0, écart contrat accepté), élection par le relais existant (choix Opus vs `onScrollGeometryChange`, à confirmer REV-3), focus card + encoche + menu (Rivière grisée seuils vivants) + peek sur les DEUX chemins (I-067ter). Focal : WS-1→11 amendés — préférence locale (protocole renommé `FocalReadingModePreferenceStoring`, collision M-048 évitée), pilule jour·heure, `FocalMetrics` (miroir `thread.*`, créé sur trou de parité), blocs riches + `FocalRow` (+flou/vue-unique F-083bis ; +F05/F06/F10/F11/F15 et contraste AA 0,55 vérifié WCAG F-083ter), `FocalScrollPass` géométrie inversée (bande 140±45 : **le miroir gelé fait foi**, le 150/95 du contrat Focal §4.3 est un erratum), 6 sites montés sous drapeau, coquille + Aa, digest/Résumé Vivant/agent stub (C1/C2/C3 tenus). **Réserves REV-2 soldées** (mapping recette §5) : R2 = passes compositor + gardes source ; R4 = `LentilleRowPrismeTests` règle 3 ; R5 = signal unique réutilisé, pipelines intacts (gardes debounce/registres) ; R6 = pilule 899/901 + stickers I-064. **En marge, `main` réparé** : les 17 échecs XCTest hérités (appels ×11, répertoire ×4, l10n ×2) corrigés — run #47 vert, suite complète — après ajout d'annotations d'échec lisibles au workflow (S-003 durci : garde R15 en jetons, commentaires exclus). i18n : 59 clés V3 au catalogue (7 locales). **Notes REV-3** : 7 tests F-090 volontairement rouges devenus verts à re-prouver au CI ; 4ᵉ enregistrement `.conversationStart` non traité ; réactions par-image hors périmètre grille ; raison Rivière indiscriminée en `direct` (amendement S1 candidat, WL-106 aussi concerné) ; constante partagée `openMyStories` (4 sites littéraux) ; unités `lingerMs` à clarifier dans une suite gelée ; matrice réelle = 15 lignes F (pas 16) | (clôture) | XCTest complète demandée (« run test ») — se déclenche à l'ouverture de la PR (les pushes de branche ne déclenchent pas ios.yml) |
| V4 | bloquée par PORTE V1 | — | — |
| V5 | bloquée par PORTE V2 | — | — |
| V6 | bloquée par REV-5 | — | — |

---

## Annexe S-001 — ancrages re-prouvés sur `abbf6aa9` (2026-08-15)

Tous les symboles cités par les contrats **existent** — aucun ABSENT. Corrections à retenir
(le reste des ancrages est vérifié exact ; re-preuve locale obligatoire avant édition, règle §0) :

| Ancrage cité | Réalité | Impact |
|---|---|---|
| `groupConversations` `:554` | `apps/ios/Meeshy/Features/Main/ViewModels/ConversationListViewModel.swift:554` — pipeline `CombineLatest4` L495, debounce 16 ms L496 (bloc réel 495-513) | aucun |
| `expandedSections` « dans le ViewModel » | vit dans `ConversationListView.swift` (état de vue) | I-062 le consomme là |
| `meeshy.sh:1584` `NON_PHASE_SUITES` | `:1591` (+7) | Q-144 |
| `CollapsibleHeader` « iOS » | `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift` (SDK, pas apps/ios) | ne pas l'éditer côté app |
| `emitConversationPreviewUpdate.ts` | `services/gateway/src/socketio/` (gateway, pas web) | classement §1.5 |
| **E14** : `EmptyConversations.tsx:19` appellerait la clé plate | le code appelle DÉJÀ `t('conversationSearch.noConversationsFound')` — défaut vraisemblablement corrigé sur cette lignée | W9-003 : vérifier à l'exécution puis ATTESTER (test de non-régression), ne pas re-corriger |
| E10/E11 (tri `lastMessage.createdAt`, dupli frontière de page) | **confirmés** — `useConversationSorting.ts:43-44`, commentaires `use-conversations-query.ts` | W9-001/002 fondés |
| `useFeatureFlags` | lit uniquement `NEXT_PUBLIC_*` — confirmé | WL-100 fondé |
| `components/v2/SplitViewLayout` | non routé (0 import sous `apps/web/app`) — confirmé | interdit E12 fondé |

### Correction C-027 — le compte réel de la matrice comportementale
Les matrices normatives comptent **32 lignes** (vol. 5 §5.3 : 17 ; vol. 4 §5 : 15), pas 44
(28+16) comme l'écrivaient contrat §LWS-2/R18 et workshop §2.5 ③. `behaviour-matrix.json`
porte les 32 id réels (`L01`..`L17`, `F01`..`F15`) ; partout où R18/porte V1 disent « 44 id »,
lire « les id de behaviour-matrix.json ». La garde d'ensemble (déclarés == couverts) est
écrite, désarmée (`describe.skip` documenté), **bloquante à la Porte V1**.
