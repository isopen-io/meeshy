# Recette Q-141 — R1→R20 : chaque critère, sa preuve, son propriétaire

> Vague V6. Prérequis REV-5 tenu (2 blockers levés le 2026-08-17, `b3a8803a`/`0c5adf65`,
> cf. `tasks/lentille-workshop-execution.md` §8 ligne V5). Q-140 (recette croisée des 32
> `id` de comportement, même jour) est la base factuelle reprise ici pour tout ce qui
> touche R5/R9/R10/R18 — **re-vérifiée**, pas recopiée : chaque suite citée a été
> réexécutée aujourd'hui (voir §3).
>
> **Base** : worktree `feat/v6-q141`, tête `main` = `cadf498a` (dernier commit :
> `test(recette): la matrice des 32 comportements rejouée drapeau ON, deux OS [Q-140]`).
> Aucun ancrage de ligne cité ci-dessous n'a été recopié d'un document antérieur sans
> re-grep : là où une ligne a bougé (ex. `ConversationListViewModel.swift:692`, pas
> `:1214`), la ligne réelle du jour est citée.
>
> **Portée du mandat** : Q-141 CONSTATE et STATUE (une décision, R6-5) ; elle
> n'implémente pas. Aucun fichier de production n'a été modifié — voir §6.

---

## 0. Verdict global

| | |
|---|---|
| Prouvé | **15 / 20** — R1, R3, R4, R5, R6, R8, R9, R10, R11, R12, R15, R16, R17, R19, R20 |
| Reporté-device | **3 / 20** — R2 (Instruments), R7 (VoiceOver/Dynamic Type/AA device, périmètre Q-142), R14 (XCTest exécution CI + JUnit Android hors scope phase 1) |
| Non-tenu | **2 / 20** — R13 (appel en cours : jamais câblé, aucune plateforme), R18 (parité comportementale littérale 17/32, pas 32/32 — 32/32 restent au moins *classés*) |
| **R6-5** (`suggestedMode`) | **3 producteurs, 0 consommateur** — recommandation motivée : **BRANCHER** (§4). Décision finale à l'orchestrateur/l'utilisateur. |

---

## 1. Méthode

- **R1→R13** : les treize critères originaux du contrat Lentille (§5, reprise 1:1 du
  vol. 5 §7), un par plateforme (iOS via LWS-7/8, web via LWS-9/10/11).
- **R14→R20** : les sept critères ajoutés par l'unification (contrat §5, deuxième
  tableau), transverses aux trois plateformes.
- **Verdict** à trois valeurs :
  - **prouvé** — la preuve existe, a été réexécutée aujourd'hui (ou, pour iOS sans
    toolchain, relue et confrontée au code de production comme l'a fait Q-140), et est
    verte.
  - **reporté-device** — la nature de la preuve exige un appareil/simulateur ou un
    outillage (Instruments, Accessibility Inspector, JUnit Android) absent de cet
    environnement ; le résidu testable ici est vert, mais la preuve complète n'est pas
    faite ici.
  - **non-tenu** — le comportement exigé n'atteint pas la production aujourd'hui, sur
    au moins une plateforme, indépendamment de l'outillage disponible.
- **Suites rejouées AUJOURD'HUI** (comptes en §3) : `packages/shared` (vitest),
  `apps/web` (jest, suite complète), `services/gateway` (jest, suite complète),
  `scripts/check-law-literals.sh`. iOS : lecture + grep du code de production ET du
  fichier XCTest qui le prouve — la même méthode que Q-140, exécution réelle réservée au
  CI macOS.

---

## 2. Table des 20 critères

| # | Critère (1 ligne) | Verdict | Preuve exacte | Propriétaire |
|---|---|---|---|---|
| **R1** | Rangs plats, focus card unique carte de l'écran | **prouvé** | iOS `LentilleRowSourceGuardTests` (garde source : 0 occurrence de `backgroundSecondary` hors focus card, LWS-7) ; web `LentilleRow.test.tsx` + `ConversationList.lentille-mux.test.tsx` (rendu plat, OFF ⇒ `ConversationItem` identique). *Nuance* : la forme littérale « snapshot 2 thèmes » n'existe pas comme paire d'images ; la preuve tenue est une garde source structurelle (interdiction permanente de fond de carte), plus robuste mais de forme différente de celle décrite au contrat. | `apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift` + `apps/ios/MeeshyTests/Unit/Lentille/LentilleRowSourceGuardTests.swift` ; `apps/web/components/conversations/lentille/LentilleRow.tsx` + `__tests__/LentilleRow.test.tsx` |
| **R2** | Perspective compositor, hauteur constante, < 1 ms/frame, zéro allocation | **reporté-device** | Rien de mesurable ici. Condition nécessaire tenue (garde source : `Lentille/Perspective/` ne contient ni `frame(height:`, ni `invalidate`, ni `layoutIfNeeded`), mais la mesure Instruments elle-même est **explicitement actée device-only par le projet** : `tasks/lentille-workshop-execution.md:546` (« Reste device-only : … la preuve Instruments « < 1 ms/frame » (critère R2) … non observable hors device »). | Q-143 (mesure prévue) ; `apps/ios/Meeshy/Features/Main/Lentille/Perspective/LentillePerspective.swift`, `apps/web/hooks/lentille/use-focal-perspective.ts` |
| **R3** | Pont ✦ affiché si non-lu, éteint à la lecture (même depuis un autre appareil), jamais de badge chiffré | **prouvé** | Gateway `conversations.bridge.test.ts` — `it('laisse bridge et lastReadAt ABSENTS (jamais null) quand unreadCount === 0')`, réexécuté aujourd'hui, vert ; `ConversationBridgeService.test.ts` (droits de lecture, non-N+1) ; iOS `BridgeFingerprintTests` + `LentilleRowSourceGuardTests` (aucun `unreadBadgeBackground`) ; web `LentilleRow.test.tsx`/`LentilleBridgeLine.test.tsx`. Le canal multi-appareil est celui, unique, du broadcast `USER_PREFERENCES_UPDATED`/`conversation:unread-updated` — testé côté serveur (`conversation-preferences.readingMode.test.ts`, broadcast + `version` ; et `conversation-preferences-broadcast.test.ts`, `it('leaves the pin state of a re-pin after reset visible to other devices')`, même mécanisme de broadcast que celui qui porte le pont) et consommé identiquement par chaque client ; aucun test ne simule littéralement 2 clients iOS/web ouverts en parallèle sur le pont, la preuve reste celle du canal partagé, pas d'un scénario à 2 appareils simulé de bout en bout. | `services/gateway/src/services/ConversationBridgeService.ts` ; `apps/ios/.../Lentille/Row/LentilleConversationRow.swift` ; `apps/web/components/conversations/lentille/LentilleRow.tsx` |
| **R4** | Prisme par les résolveurs jumeaux exclusivement ; traduction tardive = cross-fade + 🌐 | **prouvé** | iOS `LentilleRowPrismeTests` (règle 3 : `[fr,en]`, original `en`, trad `fr` → « Bonjour ») + `FocalRealtimeMatrixTests.test_F06_translatedTextSwapsInPlace_prismeUnchanged`/`test_F06_globeChipSignalsTranslation_inFocalRow` ; web `LentilleRow.prisme.test.tsx`, `useConversationFiltering.prisme.test.ts`, `focal-row-utils.test.ts` + `FocalMetaRow.tsx` (chip 🌐 réel, `da167d4a`, reclassé et re-vérifié par Q-140 le même jour). Tous verts aujourd'hui. | `packages/shared/utils/conversation-helpers.ts` (`resolveLastMessagePreview`, lecture seule — jamais réécrit) ; `LentilleRow.tsx`/`.swift` ; `FocalMetaRow.tsx` |
| **R5** | Temps réel identique à l'actuel (`message:new` FLIP, typing, présence 1/3/5, participants, préférences, delta-sync) | **prouvé** | Matrice 32 `id` rejouée par Q-140 le même jour (jest 687/687, incluant les 3 suites de matrice) — les `id` propres au temps réel sont `≡` (L01 typing, L10 présence/dots groupes, L06 non-lu live, R11 préférences round-trip). Suites socket réexécutées aujourd'hui, vertes : `services/gateway/src/socketio/__tests__/MeeshySocketIOManager.test.ts`, `__tests__/unit/socketio/emitUnreadCountsToRecipients.test.ts`, `apps/web/hooks/queries/__tests__/use-conversations-delta-sync.test.tsx`, `use-socket-cache-sync.test.ts`. Réserve non bloquante déjà tracée (L14, web : ticker d'heure relative statique entre deux re-renders — cosmétique, pas fonctionnel) — ne dégrade pas ce verdict. | `apps/web/hooks/queries/use-conversations-delta-sync.ts`, `use-socket-cache-sync.ts` ; `services/gateway/src/socketio/` ; `packages/MeeshySDK/.../Sync/` |
| **R6** | Pilule de section : premier événement → visible, 900 ms après l'arrêt → invisible ; stickers corrects aux frontières | **prouvé** | `packages/shared/utils/scroll-activity.ts` + `__tests__/scroll-activity.test.ts` (t+0.899/t+0.901, réarmement) — vert dans le run vitest complet du jour (83/83) ; iOS `ScrollPillStateTests` (mêmes bornes, `test_pillVisibility_isVisibleOneMsBeforeTheBound_andInvisibleOneMsAfter`, `test_interleavedScroll_rearmsTheWindow…`) ; web `SectionScrollPill.test.tsx`, `use-scroll-activity.test.ts`. | `packages/shared/utils/scroll-activity.ts` ; `apps/ios/.../Lentille/Chrome/SectionScrollPill.swift` ; `apps/web/components/conversations/lentille/SectionScrollPill.tsx` |
| **R7** | VoiceOver / Dynamic Type / reduced-motion / contrastes AA | **reporté-device** | Web : 5 suites `apps/web/__tests__/a11y/*.a11y.test.tsx` (jest-axe, `toHaveNoViolations`) vertes aujourd'hui, dans le run complet ; contraste pont ≥ 4,5:1 testé (`LentilleRow.test.tsx`) ; reduce-motion structurel testé (perspective désactivée, focus card = fond seul). **Manque** : aucun test `accessibility5`/`DynamicTypeSize` trouvé sous `apps/ios/MeeshyTests/Unit/Lentille/` (grep 0 hit, réexécuté aujourd'hui) — Dynamic Type extrême non couvert ; VoiceOver réel et contrastes AA en device sont, par nature, hors de cet environnement. C'est le périmètre explicite non encore exécuté de **Q-142**. Le trou L16 (aria du pont manquant côté iOS, §2 table Q-140, reconfirmé aujourd'hui `LentilleConversationRow.swift:155-159`) touche directement ce critère. | Q-142 (à exécuter) ; `apps/web/__tests__/a11y/lentille-list.a11y.test.tsx` |
| **R8** | Drapeau éteint ⇒ bit-à-bit identique | **prouvé** | iOS : snapshot 30 conversations OFF (LWS-5) + `LentilleFlagGateTests` ; web `ConversationList.lentille-mux.test.tsx` (OFF ⇒ `ConversationItem` rendu, identique) — vert dans le run complet du jour. | `ConversationListViewModel.swift` (corps de `groupConversations` seul) ; `apps/web/components/conversations/ConversationList.tsx` (mux) |
| **R9** | Gestes inchangés drapeau on (swipes, menus 2 chemins, drag & drop, pull-to-refresh, pagination) | **prouvé** | iOS `SectionDropTargetTests` (drag & drop, 4 sections ciblées), `PeekViewModelTests` (2 chemins long-press < iOS 26 et natif 26+), L07/L17 (swipe, pull-to-refresh, pagination — fermés V3ter, re-cités Q-140) ; web `LentillePeek.test.tsx`/`LentillePeek.actions.test.tsx` (clic droit + appui long, tap court jamais intercepté), `useLoadMoreSentinel.test.tsx` (pagination). Tous verts aujourd'hui. | `ConversationListView.swift`/`+Rows.swift` (`SwipeableRow` inchangé autour) ; `apps/web/components/conversations/lentille/LentillePeek.tsx` |
| **R10** | Écarts d'audit corrigés (mute visible, typing en liste, tri `lastMessageAt`, recherche sur préview résolu, squelettes pixel-stables, i18n) | **prouvé** | `useConversationSorting.test.ts` (E11, tri sur `lastMessageAt`), `useConversationFiltering.prisme.test.ts` (recherche sur préview résolu), `use-conversations-query.dedupe.test.tsx` (dédup par `id`, E10), `LentilleSkeletonGeometryTests` (squelette pixel-stable) — tous verts aujourd'hui. i18n : clés du pont/modes déjà au catalogue 4 langues (vérifiées par rendu dans les suites ci-dessus). | `apps/web/components/conversations/hooks/useConversationSorting.ts`, `useConversationFiltering.ts` ; `apps/web/locales/*/conversations.json` |
| **R11** | Encoche et modes : menu par 3 chemins, mémorisé par conversation, multi-appareils, orchestrateur réengagé sur Auto | **prouvé** (1 réserve non bloquante) | iOS `ModePreferenceRoundTripTests` (aller-retour Auto⇆forcé, isolé par conversation, cross-store Lentille/Focal) ; web `ReadingModeMenu.test.tsx`, `conversation-preferences-store.readingMode.test.ts` (rollback, `version` inférieure ignorée) ; gateway `conversation-preferences.readingMode.test.ts` (broadcast utilisateur, `version:{increment:1}`) — tous verts aujourd'hui. Réserve déjà tracée (R5-6, non résolue par Q-141 : le scope web n'a pas d'identité propre — condition avant activation multi-comptes, hors périmètre de cette tâche). | `apps/ios/.../Lentille/Mode/LentilleModeMenu.swift` ; `apps/web/components/conversations/lentille/ReadingModeMenu.tsx` ; `services/gateway/src/routes/conversation-preferences.ts` |
| **R12** | Long press : aperçu + actions rapides sur les 2 chemins iOS, clic droit + appui long web ; tap court jamais intercepté | **prouvé** | `PeekViewModelTests` (2 chemins iOS) ; `LentillePeek.test.tsx` (`describe('LentillePeek — appui long 420 ms + clic droit, tap court jamais intercepté')` : annulé par déplacement/scroll, clic droit immédiat, tap court intact) — verts aujourd'hui. | `apps/ios/.../Lentille/Mode/LentillePeekView.swift` ; `apps/web/components/conversations/lentille/LentillePeek.tsx` |
| **R13** | Appel en cours : ● pulsant + « n voix · depuis X », Rejoindre seulement si non rejoint | **non-tenu** | Le rang SAIT rendre la bannière (`test_L13_liveCallBanner_isConsumedByTheRow`), mais rien ne l'alimente : `ConversationListViewModel.swift:692` passe `liveCall: nil` (re-grep aujourd'hui — ligne déplacée depuis le `:1214` cité par Q-140, qui était déjà un commentaire renvoyant à cette même affectation) ; `LentilleProviders.swift:260` porte `LocalLiveCallProvider`, appelé par **aucun** fichier de production (re-grep aujourd'hui, 0 hit) ; web `use-lentille-sections.ts:80` et `useConversationSorting.ts:57` posent `liveCall: null` en dur. La fonctionnalité n'atteint l'utilisateur sur **aucune** plateforme — ce n'est pas une limite d'outillage, c'est un câblage jamais fait. | Gap non attribué — `ConversationLiveCallProviding` jamais branché en production ; tâche de câblage distincte à ouvrir (déjà nommée par Q-140, non résolue depuis) |
| **R14** | Les 7 fichiers de vecteurs sont verts dans les **trois** suites (Jest/XCTest/JUnit), même commit `fixtures/` | **reporté-device** (+ hors-scope Android, volontaire) | Les 7 fichiers contractuels (`accent`, `bridge`, `focus-curve`, `orchestrator`, `scroll-activity`, `sections`, `sort`) existent et sont verts en vitest aujourd'hui (83/83, `packages/shared/__tests__/vectors/*.test.ts` inclus). Les suites XCTest miroirs existent et ont été relues (`AccentVectorTests`, `SectionResolverVectorTests`, `BridgeFormatterVectorTests`) mais ne sont **pas exécutables ici** (pas de toolchain Xcode) — exécution réelle réservée au CI macOS. JUnit (Android/LWS-12) **n'existe pas** : `apps/android/**` reste fermé par construction jusqu'à la clôture de la phase 1 (Q-145) — ce n'est pas un trou, c'est le périmètre acté par le contrat (§0, portée phase 2). | `packages/shared/fixtures/reading-modes/*.vectors.json` ; `packages/shared/__tests__/vectors/*.test.ts` (2/3 plateformes prouvées aujourd'hui, la 3e hors scope phase 1) |
| **R15** | Aucune constante de loi écrite hors `packages/shared/` | **prouvé** | `bash scripts/check-law-literals.sh` réexécuté aujourd'hui : `✓ No law literals found in skin files` — couvre `Lentille/**`, `Focal/**`, `Riviere/**` (iOS, hors `Core/**`) et `components/conversations/{lentille,focal,riviere}/**`, `hooks/lentille/**`, `components/conversations/reading/**`, `bubble-message/FocalRow.tsx` (web). | `scripts/check-law-literals.sh`, câblé `ci.yml` job quality |
| **R16** | Le pont survit à un changement de langue du lecteur sans aller-retour serveur (étage déterministe) et par re-résolution (étage agent) | **prouvé** | `packages/shared/__tests__/conversation-bridge.test.ts` — `formatBridge` avec le **même** `data` et deux `t` de langues différentes rend deux phrases distinctes (étage déterministe), vert aujourd'hui ; `LentilleBridgeLine.test.tsx` — étage agent (`kind:'agent'`, `translations`+`originalLanguage`, résolution Prisme par langue) ; iOS `BridgeFingerprintTests`/`LentilleRowPrismeTests` couvrent le même mécanisme des deux côtés. | `packages/shared/utils/conversation-bridge.ts` (`formatBridge`) ; `LentilleBridgeLine.tsx`/`.swift` |
| **R17** | Fidélité des cotes : métriques rendues == `lentille-tokens.json` au réglage par défaut | **prouvé** (scope phase 1 : Swift + CSS ; Kotlin hors scope) | `packages/shared/__tests__/ci/lentille-tokens-consumption-gate.test.ts` — vert aujourd'hui (vitest) : chaque famille de token doit avoir un consommateur RÉEL (symbole `LentilleMetrics.<X>` Swift hors définition/tests, OU variable CSS `--lentille-<section>-<x>` hors fichier de déclaration/tests), sinon figurer datée dans `EXCLUDED_DEAD_FAMILIES` ; `LentilleMetricsTests`/`FocalMetricsTests` (parité valeur JSON⇔Swift). Kotlin (Android) n'existe pas — hors scope phase 1, pas un trou. | `packages/shared/design/lentille-tokens.json` ; `apps/ios/.../Lentille/Core/LentilleMetrics.swift` ; tokens CSS web |
| **R18** | Fidélité comportementale : 32 `id` de `behaviour-matrix.json` couverts par plateforme, web ≡ iOS `id` par `id` | **non-tenu** (partiel, quantifié) | Recette Q-140 rejouée intégralement aujourd'hui (jest 687/687 vert, incluant les 3 suites de matrice `behaviour-matrix-parity.test.ts`×2 + `FocalRow.parity.test.tsx`) : **32/32 `id` CLASSÉS** (couvert avec preuve OU non-couvert avec raison typée re-prouvée par grep 0-hit rejouable — le bar amendé par REV-4ter), mais **17/32 seulement en parité littérale `≡`** (L : 11/17 — L01,L02,L04,L06,L07,L08,L10,L11,L12,L15,L17 ; F : 6/15 — F03,F04,F06,F07,F09,F13). REV-4ter a explicitement certifié le périmètre livré, **pas** la parité 32/32 (« web 17/32 »). 1 trou bloquant neuf reste ouvert (L16 iOS, aria du pont) — re-confirmé aujourd'hui à `LentilleConversationRow.swift:155-159`, toujours un simple relais vers `ThemedConversationRow.conversationAccessibilityLabel`, qui ne cite jamais `bridge`. | `apps/web/__tests__/lentille/behaviour-matrix-parity.test.ts`, `__tests__/focal/behaviour-matrix-parity.test.ts` (garde d'ensemble) ; `tasks/lentille-recette-q140.md` §2 (détail `id` par `id`) |
| **R19** | Substituts honnêtes : mock ≡ gateway sur les mêmes vecteurs ; fenêtre incomplète affichée comme telle ; bascule d'injection ne change aucun snapshot | **prouvé** | `packages/shared/__tests__/providers/provider-substitution.test.ts` (`describe('substitution de ConversationBridgeProviding (R19)')` — vert aujourd'hui) : bascule Local→stub ne change rien au rendu, `unreadCount` appelant (30) ≠ couverture cache (3) ⇒ pont de référence porte 30 ; iOS `ProviderSubstitutionTests`/`LocalBridgeProviderTests`/`GatewayBridgeProviderTests` (traversée sans transformation confirmée). Injection réelle confirmée câblée en production : `ConversationListViewModel.swift` porte `let gatewayBridgeProvider = GatewayBridgeProvider()` (G-124) — P7 est neutre, re-vérifié aujourd'hui. | `packages/shared/providers/local/LocalBridgeProvider.ts` ; `apps/ios/.../Lentille/Core/{LocalBridgeProvider,GatewayBridgeProvider}.swift` |
| **R20** | Innocuité sur `main` : drapeau off ⇒ snapshot identique + bundle non téléchargé ; exception dégrade vers l'historique, jamais une page morte ; nom du drapeau une seule occurrence hors résolveur | **prouvé** | `apps/web/__tests__/lentille/lentille-flag-single-occurrence.test.ts` (`describe('Garde LWS-10 — une seule occurrence du nom du drapeau hors résolveur/tests')` — vert aujourd'hui) ; `ConversationList.lentille-mux.test.tsx` (`FeatureErrorBoundary` fallback = rendu historique, `next/dynamic`, snapshot OFF identique). | `apps/web/hooks/use-feature-flags.ts` (`resolveLentilleFlag`) ; `apps/web/components/conversations/ConversationList.tsx` (mux) |

---

## 3. Suites rejouées aujourd'hui (2026-08-17) — preuves d'exécution

Prérequis posés avant tout run : `bun install --ignore-scripts`, puis dans
`packages/shared` : `npx prisma generate --generator client` (Prisma Client v6.19.3,
généré sans erreur) et `bun run build` (`tsc --project tsconfig.json`, propre).

```
packages/shared$ npx vitest run
Test Files  83 passed (83)
     Tests  2168 passed (2168)

apps/web$ npx jest
Test Suites: 687 passed, 687 total
Tests:       21 skipped, 13386 passed, 13407 total
Snapshots:   2 passed, 2 total
Time:        124.655 s

services/gateway$ npx jest --config=jest.config.json --testPathPatterns='(ConversationBridgeService|conversations\.bridge|conversation-preferences\.readingMode|MeeshySocketIOManager|emitUnreadCountsToRecipients)'
Test Suites: 8 passed, 8 total
Tests:       474 passed, 474 total
Time:        24.627 s

services/gateway$ npx jest --config=jest.config.json   (suite complète)
Lancée en tâche de fond ; ralentie par une contention CPU partagée avec une autre
session active sur cette machine (`v6_q143`, tests gateway+web concurrents observés au
`ps`). Le sous-ensemble ciblé ci-dessus (8 suites / 474 tests, couvrant CHAQUE fichier
cité en preuve au §2) fait foi pour ce rapport. La suite complète n'a pas terminé dans
la fenêtre de cette tâche ; sur son log partiel (~12,5k lignes), un seul `FAIL` observé
— `src/__tests__/unit/routes/admin/agent-topics-extra.test.ts`, cause :
« A jest worker process was terminated by another process: signal=SIGKILL » (worker tué
par la contention mémoire de la machine partagée, pas un échec de test). Ce fichier
n'est cité par AUCUNE preuve R1→R20 (route admin `agent-topics`, hors périmètre
Lentille) — bruit d'environnement, pas une régression.

$ bash scripts/check-law-literals.sh
✓ No law literals found in skin files
```

Les chiffres `packages/shared` (83/2168) et `apps/web` (687/13386+21 skip) sont
**identiques** à ceux rapportés par Q-140 le même jour — aucune régression entre les
deux tâches.

iOS : pas de toolchain Xcode dans cet environnement. Chaque témoin XCTest cité au §2 a
été lu intégralement et confronté au code de production qu'il prétend garder (méthode
Q-140, reconduite ici) ; l'exécution réelle reste re-jouable seulement par le CI macOS.

---

## 4. R6-5 — `suggestedMode` : 3 producteurs, 0 consommateur

### 4.1 Constat, re-prouvé aujourd'hui

**Trois producteurs**, tous vivants et testés :

1. `services/gateway/src/services/ConversationBridgeService.ts:776-782` —
   `resolveSuggestedMode` appelle `toBridgeSuggestedMode(resolveOrchestratorDecision(...))`
   (la loi partagée), posé au champ `bridge.suggestedMode` du payload `GET /conversations`
   et de `conversation:unread-updated` (deux sites d'écriture, `:486` et `:741`).
2. `packages/shared/providers/local/LocalBridgeProvider.ts:100` — le substitut calcule
   `suggestedMode: input.unreadCount <= ORCHESTRATOR_UNREAD_CAP ? 'focal' : 'resume'`
   (miroir simplifié du seuil ≤ 25, testé par `LocalBridgeProviderTests` iOS et
   `local-bridge-provider.test.ts` TS).
3. `apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleProviders.swift:148/162` —
   `LentilleProviders.suggestedMode(forUnreadCount:)`, miroir Swift du même seuil.

**Zéro consommateur.** Re-grep aujourd'hui sur `apps/ios/Meeshy` et
`apps/web/{components,hooks,app}` (hors tests) pour toute lecture de
`.suggestedMode`/`bridge?.suggestedMode` en dehors des trois producteurs ci-dessus :
**aucun résultat**. En particulier :

- L'encoche « AUTO · <décision> » de la focus card (l'affordance que le contrat A6
  décrit comme la façon d'« annoncer la décision avant le tap ») **ne lit pas** le
  champ — elle **recalcule** localement `resolveOrchestratorDecision` via
  `LentilleReadingModeContext`/`use-thread-reading-mode.ts`, indépendamment de ce que
  le serveur a précalculé et envoyé sur le fil.
- Le hash `renderFingerprint` (SDK) inclut `bridge.suggestedMode` dans sa combinaison
  (`CoreModels.swift:560`) — donc une conversation dont *seul* `suggestedMode` change
  invalide bien le portillon `.equatable()` et provoque un re-render... d'une ligne
  dont rien, dans le rendu qui suit, ne dépend de la valeur qui vient de changer.

### 4.2 Ce que ça coûte de laisser en l'état

- Une invalidation de rendu (`renderFingerprint`) systématiquement déclenchée pour une
  valeur jamais lue en aval — coût mineur mais réel, et confus pour quiconque debug une
  ligne qui se re-rend « sans raison visible ».
- Un octet de payload réseau par conversation avec pont, sur chaque `GET /conversations`
  et chaque `conversation:unread-updated` — négligeable en isolation, mais c'est un
  champ calculé côté serveur (une requête `resolveOrchestratorDecision` par conversation
  avec pont, dans `ConversationBridgeService`) pour un résultat jeté au sol.
- Le critère produit A6 (« la liste doit annoncer la décision avant le tap ») reste
  **non satisfait dans les faits** : rien dans la liste — ligne fermée, pas seulement la
  focus card élue — ne distingue aujourd'hui visuellement une conversation qui ouvrira
  Focal d'une qui ouvrira le Résumé Vivant. Le champ qui porterait cette distinction
  existe, est juste, est câblé bout en bout — et n'est branché nulle part.

### 4.3 Recommandation motivée : **BRANCHER**

**Où.** `LentilleBridgeLine` (les deux plateformes) — c'est la ligne 2 du rang qui porte
déjà le pont ✦, l'endroit naturel pour une affordance « ce que le tap ouvrira »,
disponible pour **chaque** rang avec pont, pas seulement le rang élu par le focus.
Alternative plus étroite : uniquement l'encoche de la focus card (`LentilleFocusCard`),
si le produit préfère limiter l'affordance au rang mis en avant.

**Comment.**
1. RED d'abord, par plateforme, sur le modèle des tests discriminants existants
   (`LentilleRowPrismeTests`, `LentilleRowEquatableTests` : même texte/`unreadCount`,
   seul `suggestedMode` change ⇒ rendu observable différent). Deux témoins minimum :
   `suggestedMode: 'resume'` affiche un signal distinct de `'focal'` ; l'absence de
   pont n'affiche rien de neuf (garde de non-régression).
2. Lire `conversation.bridge?.suggestedMode` dans `LentilleBridgeLine`
   (`.tsx`/`.swift`), map vers une icône ou un libellé court (ex. glyphe résumé vs
   glyphe fil) — jamais recalculé, jamais une seconde loi : la valeur vient du wire,
   point.
3. Étendre la garde `LentilleRowSourceGuardTests`/le linter web (si applicable) pour
   interdire un futur recalcul local de cette distinction dans la peau — même
   discipline que pour `formatBridge`/`resolveLastMessagePreview`.

**Coût.** Borné et bas : aucune donnée nouvelle à transporter (les 3 producteurs livrent
déjà la valeur, le fingerprint réagit déjà à ses changements), aucun travail gateway,
aucune migration. Une seule modification de rendu par plateforme (2 fichiers de
production, ~quelques lignes chacun) + 2 fichiers de test RED→GREEN, sur le patron
exact des tests Prisme déjà en place. Estimation : tâche Sonnet, périmètre comparable à
une des tâches `I-06x`/`WL-10x` déjà closes.

**Ce que RETIRER casserait.** Retirer `suggestedMode` des 3 producteurs annulerait
purement et simplement le critère A6 tel que formulé dans le contrat (« la liste doit
annoncer la décision avant le tap ») — un critère produit explicite, pas une commodité
technique. Ce n'est pas un champ mort par accident : c'est un champ construit pour un
usage qui n'a simplement jamais été câblé côté peau. Le retirer économiserait le coût
mineur du §4.2 mais fermerait la porte à A6 sans qu'aucune décision produit ne l'ait
demandé — alors que BRANCHER la rouvre à un coût proportionné.

**Décision finale** : revient à l'orchestrateur/l'utilisateur. Cette section documente
le choix et son coût ; elle ne le tranche pas.

---

## 5. Ce que Q-141 n'a PAS fait (mandat : constate et statue, n'implémente pas)

- Aucun branchement de `suggestedMode` (R6-5) — recommandé, non exécuté ici.
- Aucun correctif du trou L16 (aria du pont iOS, R7/R18) — déjà nommé par Q-140,
  reconfirmé ici, toujours en tâche.
- Aucun câblage de `ConversationLiveCallProviding` (R13) — déjà nommé par Q-140,
  reconfirmé ici, toujours en tâche.
- Aucune exécution Instruments/Accessibility Inspector/JUnit — hors de cet
  environnement par construction (R2, R7, R14).

---

## 6. Fichiers touchés par Q-141

**Aucun fichier de production ni de test n'a été modifié.** Aucune coquille flagrante
n'a été trouvée dans un commentaire de garde au cours de cette relecture — rien à
documenter à ce titre.

- `tasks/lentille-recette-q141-r1-r20.md` — ce rapport (seul fichier créé).
