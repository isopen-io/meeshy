# Q-143 — Perf Lentille : ce qui est MESURÉ, ce qui reste device-only, soldes R6-2/R6-6

> Vague V6, après Q-140. Worktree `feat/v6-q143`, tête de départ `cadf498a`.
> Prérequis exécutés dans cet environnement : `bun install --ignore-scripts`
> (racine), `bunx prisma generate` (`packages/shared`), `bun run build`
> (`packages/shared`) — sans ces trois étapes, `services/gateway` ne
> compile pas (`@meeshy/shared` non résolu).
>
> **Méthode, comme Q-140** : chaque chiffre de ce rapport vient d'une suite
> RÉELLEMENT exécutée ce jour dans cet environnement (jsdom/Node pour web et
> gateway) — jamais relu de mémoire ni déduit d'un commentaire de code. Ce
> qui ne peut pas être mesuré ici (device réel, navigateur réel) est nommé
> comme tel, avec le substitut qui en tient lieu — jamais tu.

---

## 1. Ce qui est mesurable ici, mesuré

### 1.a Témoins de coût existants — rejoués, chiffres exacts

**B2 (fan-out socket), `emitUnreadCountsToRecipients.cost.test.ts`** — rejoué
ce jour, 4/4 verts :

| Cas | Requêtes Prisma totales | Détail par table (10 destinataires) |
|---|---|---|
| 1 destinataire | **10** | — |
| 10 destinataires | **10** (identique — non-N+1 re-prouvé) | `message.findMany`=2, `participant.findMany`=2, `conversationReadCursor.findMany`=2, `userConversationPreferences.findMany`=2, `userMessageDeletion.findMany`=2 |
| 49 destinataires | **≤ 12** (borne absolue) | — |
| 0 non-lu (aucun candidat) | **5** | passe du pont jamais payée en plus des 5 requêtes de comptage |

Chiffres inchangés depuis le solde REV-5/B2 (`0c5adf65`) : la régression que
ce témoin détecterait (10 → 55 pour 1 → 10 destinataires) reste absente.
Aucune ligne de production du chemin socket n'a été touchée par Q-143.

**G-122 (liste REST), `ConversationBridgeService.test.ts`** — rejoué ce
jour, 3 tests du bloc « non-N+1 » verts + 1 test neuf (R6-6, §3) :

| Cas | Requêtes Prisma totales |
|---|---|
| 1 conversation | **≤ 5**, identique à 10 conversations (`prismaTen.__total === prismaOne.__total`, `__counters` égaux terme à terme) |
| 10 conversations | **identique** à 1 |
| Masquage personnel déjà chargé (`hidingByConversation` fourni) | `__total` économisé de **2** requêtes (`userConversationPreferences`+`userMessageDeletion`) |
| Curseurs déjà chargés (`cursorsByParticipant` fourni — **R6-6**) | `__total` économisé de **1** requête (`conversationReadCursor.findMany`) |

Décompte nu des 5 requêtes constantes de `buildBridgeData` : 1
(`participant.findMany`) + 1 (`conversationReadCursor.findMany`) + 1
(`userConversationPreferences.findMany`) + 1 (`userMessageDeletion.findMany`)
+ 1 (`message.findMany`, fenêtre agrégée). Après R6-6, ce chemin descend à
**4** quand l'appelant (`core.ts`) fournit déjà les curseurs — voir §3.

### 1.b Banc de mesure du pass de perspective web (jsdom + rAF instrumenté)

Nouveau fichier : `apps/web/hooks/lentille/__tests__/use-lentille-perspective.perf.test.ts`
— 4/4 verts, N = **150 rangs** (au-delà de toute fenêtre de virtualisation
réaliste, pour stresser la mesure).

**Écritures de style par frame** — proxy générique posé sur `el.style` de
chaque rang (`set` trap, aucune liste blanche devinée à l'avance) :

| Mesure | Résultat |
|---|---|
| Propriétés distinctes écrites sur 150 rangs, 1 frame | **`{opacity, transform}` — exactement ces deux, jamais une troisième** |
| Total d'écritures | **300** (2 par rang, jamais plus) |
| `height`/`margin`/`padding`/`top`/`left`/`right`/`bottom`/`width`/`font-size` | **0 occurrence, sur aucun rang** |
| `prefers-reduced-motion` actif, 150 rangs, 2 frames | **0 écriture de style** (identité posée une seule fois, au `registerRow`, jamais reprise par la boucle) |

C'est la preuve Layout Shift 0 pour tout ce qu'un moteur JS (sans layout
engine réel) peut établir : le CODE n'émet jamais une propriété qui
invaliderait un layout — ce que jsdom ne peut pas ajouter (§2) est la preuve
que le NAVIGATEUR, lui, ne déclenche bien aucun reflow en réponse.

**Allocations par frame** — proxy propre retenu : `Array.prototype.push`
monkey-patché pour la durée d'une frame (jsdom/Jest n'exposent pas
`--expose-gc` dans ce harnais, donc aucun compteur de tas fiable n'était
disponible — limite documentée, pas contournée en silence) :

| Mesure | Résultat |
|---|---|
| Appels à `.push()` sur le tableau `candidates`, par frame, 150 rangs | **150** (frame 1) **et 150** (frame 2) — jamais 1 |
| Identité du tableau `candidates` entre frame 1 et frame 2 | **différente** (`array1 !== array2`) — un tableau NEUF par tick, jamais un pool |

**Verdict mesuré, à consigner honnêtement** : le contrat §4.1 énonce « zéro
allocation dans la passe » — cette mesure la **contredit pour l'implémentation
web**. La passe alloue, par frame : 1 tableau `candidates` + N objets
`{id, midY}` (poussés dans ce tableau) + N objets `{opacity, transform}`
(retour de `computeFocusTransform`, un par rang non-`reduced-motion`) — soit
**1 + 2N objets courte-durée par frame** (300 + 1 = 301 objets pour N=150),
tous morts avant la frame suivante (aucune fuite — vérifié : rien n'est
conservé au-delà de `tick()`). C'est un coût **O(N) réel, pas O(1)**, que le
contrat annonçait comme nul. Arbitrage : ces objets sont petits (2 champs
scalaires), à courte durée de vie (éligibles au tas de jeune génération du
GC V8, collecte quasi gratuite), et strictement bornés par le nombre de
rangs VISIBLES (jamais la liste entière) — le risque réel est faible, mais
l'énoncé du contrat est FAUX tel qu'écrit et devrait être corrigé
(« allocation bornée O(rangs visibles), pas zéro ») plutôt que laissé tel
quel pour la prochaine lecture.

**1 rAF / surface, sous charge** :

| Mesure | Résultat |
|---|---|
| 2 surfaces indépendantes (2 instances du hook), 150 rangs chacune | **exactement 2 frames en vol** à tout instant (1 par surface), sur 2 cycles de flush consécutifs |

Complète (sans la remplacer) la preuve « 1 rAF, quel que soit le nombre de
rangs » déjà présente dans `use-lentille-perspective.test.ts` (non
touchée) — celle-ci ne portait que sur UNE surface ; celle-ci en ajoute une
seconde et charge les deux.

### 1.c Layout Shift — extension aux surfaces montées aujourd'hui (rail des vivants, modale)

Deux surfaces livrées le jour même (git log : `ae9e011d` rail des vivants,
`9a639429` modale de profil) ne participaient à AUCUN témoin de layout
avant Q-143.

**`LivesRail`** (`apps/web/components/conversations/lentille/__tests__/LivesRail.test.tsx`,
2 tests neufs, 5/5 verts au total) :
- La cote du wrapper de pastille (`--lentille-list-rail-size`) est posée en
  style inline **identique** sur 3 entrées volontairement hétérogènes (sans
  avatar / avec avatar / live) — **1 seule valeur de géométrie distincte**
  mesurée sur les 3. L'`<img>`, quand elle existe, porte `object-cover` +
  `h-full w-full` : elle ne peut pas agrandir son parent à son chargement
  (image chargée après coup ⇒ 0 shift, structurellement).
- Garde source : `LivesRail.tsx` ne référence **jamais**
  `useLentillePerspective`/`registerRow`/`requestAnimationFrame` — cette
  surface est hors de la passe rAF par construction, pas seulement « pas
  testée dedans ».

**`UserProfileModal`** (`apps/web/components/profile/__tests__/UserProfileModal.test.tsx`,
3 tests neufs sous `describe('… — Layout Shift 0 (Q-143 …')`, 15/15 verts au
total pour le fichier) :
- Le contenu monté (`data-testid="user-profile-modal"`) n'est **jamais** un
  descendant du sous-arbre appelant (`listRoot.contains(modal) === false`)
  — Portal Radix, hors du flux document.
- La classe posée porte `fixed` et **jamais** `static`/`relative`/`sticky`.
- Le sous-arbre voisin (`fake-list`) est **byte-identique**
  (`outerHTML` avant === après) entre `open=false` et `open=true` — ouvrir
  la modale ne re-rend jamais ses frères.

jsdom ne calcule aucun layout réel (`getBoundingClientRect` rend des zéros
sans stub) : la preuve retenue ici est **structurelle** (position hors-flux
+ non-participation à la passe + non-effet sur les frères), pas
pixel-perfect — c'est la limite honnête de ce que Node peut établir pour ces
deux surfaces (cf. §2).

---

## 2. Ce qui exige un device/navigateur réel

| # | Ce qu'il faudrait mesurer | Outil réel | Substitut posé ici |
|---|---|---|---|
| 1 | Coût réel en ms/frame de la passe de perspective web sous un VRAI compositor (paint, layerisation, promotion `opacity`/`transform` en layer composité) | Chrome DevTools, panneau Performance, trace de frames à 60/120 Hz | Proxy `el.style` (§1.b) : prouve que le CODE n'écrit jamais une propriété de layout — ne mesure AUCUN temps réel (jsdom n'a ni moteur de style ni de paint ; `performance.now()` autour de la boucle ne chronométrerait que du JS pur, sans rapport avec un compositor réel) |
| 2 | Score Layout Shift RÉEL (API `LayoutShift`/`web-vitals`, CLS observé) | Chrome réel, `PerformanceObserver({type:'layout-shift'})` | Preuve structurelle §1.c (Portal, `fixed`, non-participation rAF, non-ré-render des frères) — jamais un score CLS chiffré, jsdom n'implémente pas l'API |
| 3 | Rafraîchissement 120 Hz ProMotion réel (web ET iOS) | Écran ProMotion réel (iPhone/iPad Pro), Chrome/Safari dessus | Aucun — non simulable ; le code est agnostique de la fréquence par construction (rAF suit le taux de rafraîchissement du système, jamais une horloge fixe posée par le hook), mais la CADENCE RÉELLE à 120 Hz n'est vérifiable que sur l'appareil |
| 4 | Instruments (Time Profiler) — `< 1 ms/frame` sur la passe iOS (`LentilleFocusElectionHost`, `.visualEffect`, `LentillePerspective`) | Xcode Instruments, device réel | Lecture statique (aucun toolchain Swift ici) : `LentilleFocusElectionHost` (`struct: View`) et `LentillePerspective` (`struct: ViewModifier`) sont des TYPES VALEUR SwiftUI — argument favorable mais NON CONCLUANT (SwiftUI boxe et diffe ses `View` en interne, coût réel invisible sans profiler) ; déjà nommé « reste device-only » par la sous-section R-g du plan (`tasks/lentille-workshop-execution.md:546`), non re-testable ici |
| 5 | Instruments (Allocations) — trace ARC réelle de la boucle d'élection iOS | Xcode Instruments, device réel | Aucun substitut : `electFocusRow`/`FocalFocusCurve` sont partagés TS↔Swift par miroir de loi, mais le coût ARC réel (retain/release, boxing SwiftUI) n'est lisible qu'au profiler |
| 6 | Sensation réelle du geste (jank perçu, dropped frames sous doigt) | Device réel, QA manuelle | Aucun — cf. Porte V1 : « preuves device-only reportées : gestes réels » |
| 7 | Ordonnancement intra-frame iOS (l'overlay d'élection peut lire le registre de la frame précédente selon l'ordre SwiftUI) | Instruments / trace de frame | Déjà chiffré dans R-g (borne « au pire une frame », 17 ms à 60 Hz / 8 ms à 120 Hz) — borne théorique posée par lecture de code, pas mesurée |
| 8 | Promotion de layer compositeur navigateur (`will-change`) | Chrome DevTools, couche « Layers » | Observation statique : aucun `will-change: opacity, transform` n'est posé sur le wrapper de rang (`LentilleRow.tsx`) — un navigateur PEUT promouvoir automatiquement un élément dont l'opacité varie (contexte d'empilement), mais ce n'est pas garanti sans le hint explicite ; **non corrigé ici** (hors mandat Q-143, à vérifier au profiler avant d'ajouter le hint — l'ajouter sans mesure serait une optimisation non prouvée) |
| 9 | Android (`LentilleDimens`, LWS-12) | Espresso/Perfetto, device réel | Hors périmètre Q-143 (aucune surface Android touchée par ce lot ni par R6-2/R6-6) — non mesuré ici, non prétendu couvert |

Aucune ligne ci-dessus n'est comblée par une assertion jsdom déguisée : là où
un chiffre ms/Hz est affiché plus haut (§1.b, §R-g historique), il vient
d'un calcul ou d'un test RÉELLEMENT exécuté sur ce qui EST mesurable
(comptage d'écritures, comptage d'appels, arithmétique de bande) — jamais
d'une extrapolation présentée comme une mesure de temps réel.

---

## 3. R6-2 — le site d'appel iOS est branché sur le vrai drapeau

**Constat re-prouvé (2026-08-17)** : `MessageListViewController.swift:1387`
codait `showsAgentGrammar: false` en dur, sous un commentaire qui affirmait
« WS-10 (F-089) n'a pas encore livré `isAgentGrammarEnabled` ». C'est FAUX
— `MeeshyFeatureFlags.isAgentGrammarEnabled` existe et est testé depuis F-089
(`MeeshyFeatureFlags.swift:68-80`, `AgentGrammarGateTests.swift`).

**Correctif** (Swift minimal, discipline sans toolchain — brace/paren/bracket
comptés et équilibrés par script avant/après ; aucun compilateur disponible
ici, exécution réelle **re-jouable seulement par le CI**) :

```swift
// AVANT (MessageListViewController.swift:1385-1388)
isAgentAuthored: message.messageSource == .agent,
// WS-10 (F-089) n'a pas encore livré `isAgentGrammarEnabled` —
// OFF tant que le drapeau n'existe pas (`grep` vide sur le
// dépôt à l'ouverture de F-086).
showsAgentGrammar: false,

// APRÈS
isAgentAuthored: message.messageSource == .agent,
// R6-2 — WS-10 A LIVRÉ `isAgentGrammarEnabled`
// (`MeeshyFeatureFlags.swift:69`) : ce site le branche
// enfin. Le drapeau lui-même reste OFF PAR DÉFAUT (§5.2
// du contrat : le chemin serveur non écrivant n'existe
// toujours pas — activation soumise à décision produit
// écrite, non prise ici) ; brancher le site rend
// seulement le levier réel, il ne l'actionne pas.
showsAgentGrammar: MeeshyFeatureFlags.isAgentGrammarEnabled,
```

**Témoin de câblage (garde source)** ajouté à `AgentGrammarGateTests.swift` —
`test_messageListViewController_wiresShowsAgentGrammarToTheRealFlag` :
1. la source (commentaires retirés) contient
   `showsAgentGrammar: MeeshyFeatureFlags.isAgentGrammarEnabled` ;
2. elle ne contient PLUS `showsAgentGrammar: false` ;
3. la source BRUTE (commentaires compris) ne contient plus la phrase fausse
   (« n'a pas encore livré ») — re-preuve que le mensonge a été retiré, pas
   seulement contourné en silence par du code à côté d'un commentaire resté
   faux.

Non exécuté ici (pas de toolchain Xcode dans cet environnement) — équilibre
d'accolades/parenthèses/crochets du fichier vérifié par script Python
(319/319 `{}`, 978/978 `()`, 80/80 `[]`, inchangé en proportion par rapport
à avant édition) ; **suite `AgentGrammarGateTests` re-jouable seulement par
le CI** (comme tout XCTest de ce lot, cf. Q-140 §7).

### Décision produit écrite exigée par §5.2/WS-10 — consignée ici

Le contrat (`tasks/lentille-implementation-contract.md:609`) est explicite :
« Tant que cette séparation [chemin de production non écrivant, C3] n'est
pas en place, `agent_grammar` reste **OFF** et son activation requiert la
décision produit écrite déjà exigée par #3010 WS-10. »

**Décision produit consignée par Q-143** : `agent_grammar` **RESTE OFF PAR
DÉFAUT** — ni `MEESHY_FLAG_AGENT_GRAMMAR=1` ni
`meeshy.flag.agent_grammar=true` ne sont posés par ce lot, sur aucune
plateforme, aucun environnement. Le correctif R6-2 ne fait QUE rendre le
levier RÉEL (le site d'appel iOS lit désormais la vraie source de vérité au
lieu d'un OFF câblé indépendamment d'elle) — il ne change AUCUN
comportement observable en production tant que le drapeau n'est pas posé
ailleurs. La condition d'activation posée par le contrat (chemin serveur
C3 non écrivant, `services/agent/` — G-126, `03b4eaea`, « chemin NON
ÉCRIVANT prouvé ») est TENUE côté gateway depuis V5, mais §5.2 exige la
décision ÉCRITE en PLUS de la condition technique — cette décision n'est
PAS prise par Q-143 et reste à obtenir explicitement de l'équipe produit
avant tout bascule de défaut.

---

## 4. R6-6 — double lecture de curseurs par passe de liste : soldée

**Constat re-prouvé** : `GET /conversations` (`routes/conversations/core.ts`)
lisait `conversationReadCursor` une première fois pour peupler
`orchestratorInputs.lastOpenedAt` (ligne ~796, avant correctif), PUIS
`ConversationBridgeService.buildBridgeData` (appelé par la même requête,
juste après) lisait la MÊME table, pour les MÊMES participants (le
lecteur, sur les conversations candidates du pont), une seconde fois — deux
lectures identiques par page de liste avec pont.

**Solde retenu — mutualisation, jumelle exacte du patron déjà en place
pour `hidingByConversation`** (`ConversationBridgeService.ts:190-195`) :
un nouveau paramètre optionnel `cursorsByParticipant` sur
`BuildBridgeDataParams` — fourni, la requête interne du service n'est pas
rejouée ; absent, comportement identique à avant (rétrocompatible, tous les
appelants existants du service continuent de fonctionner sans changement).

**Fichiers touchés** (gateway) :
- `services/gateway/src/services/ConversationBridgeService.ts` — paramètre
  `cursorsByParticipant` + branchement conditionnel dans le `Promise.all`
  des requêtes 2(+3,4).
- `services/gateway/src/routes/conversations/core.ts` — le `select` de la
  lecture existante gagne `lastReadMessageCreatedAt` (le service en a
  besoin en plus de `lastReadAt`), la même lecture alimente maintenant
  DEUX maps (`lastOpenedAtByConversation`, existante, ET
  `cursorsByParticipant`, neuve) ; le résultat est transmis à
  `buildBridgeData`.

Diff net : **41 lignes** insérées à travers les deux fichiers de production
(18 dans `core.ts`, 23 dans `ConversationBridgeService.ts`) — dont une
bonne moitié sont des commentaires expliquant le "pourquoi R6-6" (discipline
du dépôt, cf. tous les fichiers cités plus haut) ; le changement de
comportement lui-même tient en une dizaine de lignes par fichier (nouvelle
déclaration de map, extension du `select`, branche conditionnelle du
`Promise.all`, un paramètre ajouté à un appel existant). Risque jugé bas :
patron IDENTIQUE à une mutualisation déjà en production
(`hidingByConversation`), rétrocompatible par construction (paramètre
optionnel), aucune ligne de logique métier modifiée — seule la SOURCE d'une
lecture change.

**Témoin de compteurs AVANT/APRÈS** (`ConversationBridgeService.test.ts`,
test neuf `« les curseurs déjà chargés par la passe (cursorsByParticipant)
économisent leur requête (R6-6) »`, vert) :

| | `conversationReadCursor.findMany` | `__total` |
|---|---|---|
| AVANT (curseurs non fournis, comportement historique) | **1** | référence |
| APRÈS (curseurs fournis via `cursorsByParticipant`) | **0** | `référence − 1` |

Et un second témoin, côté site d'appel
(`services/gateway/src/__tests__/routes/conversations.bridge.test.ts`, test
neuf `« transmet cursorsByParticipant au service — le levier de
mutualisation R6-6 est bien branché »`, vert) : le `select` de la lecture de
`core.ts` porte désormais `lastReadMessageCreatedAt`, la map transmise au
service contient exactement les valeurs lues, et
`conversationReadCursor.findMany` n'est appelé **qu'une fois** pour toute la
page — le total pour une page de liste AVEC pont passe de **2 lectures** de
cette table (avant R6-6) à **1 lecture** (après), pour un résultat
STRICTEMENT identique (témoin d'exactitude : même `bridge`, même
`lastReadAt`, vérifié conversation par conversation).

---

## 5. Suites rejouées (preuves d'exécution)

```
services/gateway$ npx jest src/services/__tests__/ConversationBridgeService.test.ts \
  src/services/__tests__/ConversationBridgeService.viewers.test.ts \
  src/__tests__/routes/conversations.bridge.test.ts \
  src/__tests__/unit/socketio/emitUnreadCountsToRecipients.cost.test.ts \
  src/__tests__/unit/socketio/emitUnreadCountsToRecipients.test.ts
Test Suites: 5 passed, 5 total
Tests:       77 passed, 77 total

apps/web$ npx jest hooks/lentille/__tests__/use-lentille-perspective.perf.test.ts --verbose
✓ sous charge (150 rangs) : SEULES opacity/transform sont jamais écrites — 0 écriture de layout (70 ms)
✓ reduce-motion : sous charge, ZÉRO écriture de style (21 ms)
✓ MESURÉ : 150 rangs ⇒ 150 objets `candidate` alloués par frame (O(N), pas O(1)) (33 ms)
✓ deux surfaces concurrentes (150 rangs chacune) : EXACTEMENT 1 frame en vol par surface (46 ms)
Test Suites: 1 passed, 1 total · Tests: 4 passed, 4 total

apps/web$ npx jest hooks/lentille/__tests__/use-lentille-perspective.test.ts \
  components/conversations/lentille/__tests__/LentilleConversationListMount.perspective-lifecycle.test.tsx \
  components/conversations/lentille/__tests__/LentilleConversationListMount.profile-modal.test.tsx \
  components/conversations/lentille/__tests__/LentilleConversationListMount.rail.test.tsx \
  components/conversations/focal/__tests__/FocalThread.perspective-lifecycle.test.tsx
Test Suites: 5 passed, 5 total · Tests: 31 passed, 31 total

apps/web$ npx jest components/conversations/lentille/__tests__/LivesRail.test.tsx \
  components/profile/__tests__/UserProfileModal.test.tsx --verbose
Test Suites: 2 passed, 2 total · Tests: 15 passed, 15 total

packages/shared$ npx vitest run
Test Files  83 (1 failed) · Tests  2167 passed, 1 failed (2168)
  — échec PRÉEXISTANT, sans rapport avec Q-143 (aucun fichier shared touché
  par ce lot) : garde d'ensemble `behaviour-matrix`, id L16 iOS. Résolu en
  amont par `5f65e41f` (« le lecteur d'écran entend le pont ✦ que l'œil
  voit [Q-140/L16-iOS] »), pas encore rebasé dans ce worktree au moment de
  l'exécution — re-vérifié vert après rebase (§6).
```

**Suite complète web** (`apps/web$ npx jest`, sans filtre) :

```
Test Suites: 1 failed, 687 passed, 688 total
Tests:       2 failed, 21 skipped, 13393 passed, 13416 total
Snapshots:   2 passed, 2 total
```

L'unique échec (`__tests__/components/auth/register-form-wizard.test.tsx`,
2 tests, timeout Jest 5000 ms) est un **flake de contention** — cet
environnement exécute plusieurs worktrees sœurs V6 en parallèle sur la même
machine. Re-jouée SEULE : **5/5 verts, 10 s** (contre le budget de 5 s par
test qui expirait sous charge partagée). Aucun rapport avec Q-143 (fichier
non touché par ce lot). Base Q-140 : 687 suites/13 386 tests — Q-143 ajoute
1 suite neuve (`use-lentille-perspective.perf.test.ts`) et des tests aux
fichiers étendus (`LivesRail`, `UserProfileModal`,
`conversations.bridge.test.ts`), cohérent avec 13 386 → 13 393 net-des-
skips-inchangés (21, comme Q-140).

**Suite complète gateway** (`services/gateway$ npx jest`, sans filtre) :

```
Test Suites: 1 failed, 742 passed, 743 total
Tests:       1 failed, 18034 passed, 18035 total
Time:        2160.622 s
```

L'unique échec (`signal-protocol-routes.test.ts`, « returns 500 when db
throws », timeout Jest 10 000 ms, suite entière à 384 s) est un **flake de
contention**, sans rapport avec Q-143 (routes Signal Protocol, aucun fichier
touché par ce lot). Re-jouée SEULE : **1/1 vert, 8,3 s** (budget de 10 s
largement tenu hors charge partagée).

**Suite complète shared** (`packages/shared$ npx vitest run`, avant rebase) :

```
Test Files  83 (1 failed) · Tests  2167 passed, 1 failed (2168)
```

Le seul échec (`behaviour-matrix.test.ts`, garde d'ensemble, id L16 iOS) était
PRÉEXISTANT à la tête de départ de ce lot — `packages/shared` n'a reçu
aucune modification de Q-143. Corrigé en amont par `5f65e41f` (« le lecteur
d'écran entend le pont ✦ que l'œil voit [Q-140/L16-iOS] »), absorbé par le
rebase (§6) — re-vérifié après rebase : **vert**
(`vitest run __tests__/vectors/behaviour-matrix.test.ts` → 1 fichier / 15
tests verts).

iOS : aucun toolchain Xcode dans cet environnement — `AgentGrammarGateTests`
(garde source neuve comprise) **re-jouable seulement par le CI**, comme tout
XCTest cité par ce lot et par Q-140.

---

## 6. Ce que Q-143 n'a PAS fait

- N'a pas ajouté de hint `will-change` au wrapper de rang web (§2, point 8)
  — optimisation non prouvée par un profiler réel, hors mandat de ce lot.
- N'a pas corrigé le libellé « zéro allocation » du contrat §4.1 lui-même
  (le rapport MESURE l'écart et le signale — modifier le texte du contrat
  est une décision éditoriale qui dépasse une micro-tâche de recette).
- N'a PAS activé `agent_grammar` — ni changé son défaut. Voir §3 : décision
  produit consignée, drapeau OFF.
- N'a pas touché `buildBridgeDataForViewers` (chemin socket, B2/REV-5) : la
  double lecture y est structurellement différente (deux services distincts
  avec des besoins de cursor différents — compte de non-lus vs fenêtre du
  pont — sur un chemin qu'aucune réserve R6-6 ne nomme), non mutualisée ici
  pour rester dans le périmètre exact de la réserve.

---

## 7. Rebase — état final

`git rebase origin/main` exécuté APRÈS les 4 commits de ce lot, SANS
conflit (5 commits amont absorbés, dont `5f65e41f` qui corrige l'échec
préexistant du §5 shared, et 3 lots sœurs déjà mergés — `Q-146/R6-1`,
`R5-4`, `R5-5`, `R6-3`, `R5-3`). Après rebase, re-vérifiés verts :

- `packages/shared` build (`bunx prisma generate` + `bun run build`) — vert.
- `services/gateway` build (`tsc`) — vert.
- `services/gateway` : les 5 fichiers/77 tests ciblés par ce lot (§5) —
  **77/77 verts**.
- `apps/web` : les 8 fichiers/50 tests ciblés par ce lot (perspective +
  layout shift, §1.b/1.c) — **50/50 verts**.
- `packages/shared` : `behaviour-matrix.test.ts` (le seul échec du run
  d'avant-rebase, §5) — **15/15 verts**.

Tête finale de la branche `feat/v6-q143` après rebase : 4 commits
`[Q-143/…]`/`[Q-143]` au sommet de `origin/main`. Non poussée.
