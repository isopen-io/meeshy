# Q-145 — Clôture de la phase 1 : verdicts §9.1, dossier d'activation, dette ordonnée

> Vague V6, dernière tâche. Revue **Opus, en lecture seule** — ce fichier est le SEUL
> livrable ; aucun fichier de production, de test ou de configuration n'a été modifié.
>
> **Base** : worktree `/workspace/v6_q145`, `main` = **`81e93f3a`**
> (`[Q-142/croisé] contraste AA deux thèmes étendu aux surfaces du 2026-08-17`).
> Q-140..Q-144, Q-146, R6-2/R6-5/R6-6 et le correctif L16-iOS sont tous mergés.
>
> **Prérequis exécutés ici** : `bun install --ignore-scripts` (racine, 3861 paquets),
> `bunx prisma generate` (`packages/shared`, Prisma Client v6.19.3), `bun run build`
> (`packages/shared`, `tsc` propre).
>
> **Où vit §9.1.** Le numéro `§9.1` n'existe pas dans `tasks/lentille-workshop-execution.md`
> (ce fichier s'arrête au §8 « Suivi d'avancement » + annexes). La section de clôture de la
> phase 1 est **`tasks/lentille-focal-workshop.md` §9.1 « Clôture de la phase 1 — iOS et
> web »**, lignes 442-457 — c'est elle qui porte les dix points, et c'est celle qui est
> instruite ici. `tasks/lentille-workshop-execution.md:265` (la ligne de tâche Q-145) y
> renvoie sans la citer.

---

## 0. Verdict global

**PHASE 1 NON-CLOSE au sens littéral de §9.1 — 4 des 10 points sont rouges (2, 4, 6, 7).**
La dernière phrase de §9.1 ne laisse pas de marge : « si un des dix points est rouge, la
phase 1 n'est pas close, quel que soit l'état visuel ».

**Au sens AMENDÉ par REV-4ter — le seul référentiel que le chantier a réellement tenu et
qui a servi à prononcer la Porte V2 — la phase 1 est CLOSE-AVEC-RÉSERVES** : le périmètre
livré (LWS-0..11 + LWS-3/4 gateway + Rivière R-130..136) est bâti, prouvé, et ses absences
sont NOMMÉES avec une raison typée re-prouvée par grep 0-hit rejouable. Ce que §9.1 exige
en plus du périmètre livré — la parité littérale `id` par `id`, la mesure Instruments/
profiler, et le câblage de l'appel en cours — n'a jamais été livré et n'est pas près de
l'être par une micro-tâche.

**Ce que Q-145 ne tranche pas** : quelle grille gouverne. La grille littérale de §9.1 a été
écrite avant que le référentiel réel soit connu (elle compte « 28 + 16 = 44 id » et « sept
fichiers de vecteurs » ; la réalité re-prouvée est **32 id** et **12 fichiers**). Trois de
ses dix points citent des nombres faux. Décider si l'on clôt sur la grille littérale, sur
la grille amendée, ou sur une grille §9.1bis rédigée à partir de ce document, est une
**décision produit** — elle revient à l'utilisateur.

### Comptes des suites re-exécutées aujourd'hui sur `81e93f3a`

| Suite | Commande | Résultat |
|---|---|---|
| Web (complète) | `apps/web$ npx jest` | **691 suites / 13 435 tests verts**, 21 skip pré-existants, 2 snapshots verts — 169 s |
| Shared (vitest, défaut) | `packages/shared$ npx vitest run` | **82/83 fichiers — 2167/2168 verts, 1 ROUGE** (voir §1 point 7) — 2 exécutions, même échec |
| Shared (vitest, `--testTimeout=60000`) | `packages/shared$ npx vitest run --testTimeout=60000` | **83/83 fichiers — 2168/2168 verts** — 13,7 s |
| Gateway (ciblé pont/mode de lecture) | `services/gateway$ npx jest --config=jest.config.json --testPathPatterns='(ConversationBridgeService\|conversations\.bridge\|conversation-preferences\|readingMode\|emitUnreadCountsToRecipients\|bridge)'` | **10 suites / 148 tests verts** — 43,7 s |
| Agent (complète) | `services/agent$ npx jest --config=jest.config.json` | **36 suites / 286 tests verts** — 40,4 s |
| Garde littéraux de loi | `bash scripts/check-law-literals.sh` | **vert** — `✓ No law literals found in skin files` |
| Auto-test de la garde | `bash scripts/check-law-literals.sh --self-test` | **vert** — littéral attrapé, `Core/**` et `*test*` exclus, docstrings retirées sans aveugler le scan, exclusion Tailwind au jeton (R5-5) |

**iOS** : aucun toolchain Xcode dans cet environnement. Toute suite XCTest citée ci-dessous
est **re-jouable seulement par le CI macOS** — la méthode retenue, identique à celle de
Q-140/Q-141/Q-143, est la lecture du témoin confrontée au code de production qu'il prétend
garder. Aucun chiffre iOS de ce document n'est présenté comme une exécution.

---

## 1. Les dix points de §9.1 — verdict ligne par ligne

Légende : **prouvé** (preuve re-exécutée ici ou rapport cité et re-vérifié) ·
**tenu-avec-réserve** (l'essentiel est tenu, un résidu nommé subsiste) ·
**non-tenu** (le point n'est pas atteint aujourd'hui).

---

### Point 1 — « Les sept fichiers de vecteurs sont verts dans deux suites (Jest, XCTest), sur le même commit de `packages/shared/fixtures/`. »

**Verdict : TENU-AVEC-RÉSERVE.**

**Erratum de compte, à consigner comme C-027 l'a fait pour les 44 id.** Il n'y a pas sept
fichiers de vecteurs mais **douze** — `packages/shared/fixtures/reading-modes/` porte
`accent`, `assist-tier`, `bridge`, `capabilities`, `focus-curve`, `orchestrator`,
`river-headers`, `river-lanes`, `river-step`, `scroll-activity`, `sections`, `sort`. Les
sept du contrat originel sont les sept premiers du chantier ; les cinq autres sont nés des
amendements S1 (`capabilities`, 18 cas, REV-3/B3), de la cascade d'assistance
(`assist-tier`) et de l'amendement R (les trois `river-*`).

**Suite 1 (TS/vitest) — re-exécutée aujourd'hui, verte.** Les douze fichiers ont leur suite
sous `packages/shared/__tests__/vectors/` ; toutes vertes dans le run à
`--testTimeout=60000` (83/83, 2168/2168). Le run au timeout par défaut a un seul rouge, et
ce n'est aucun des douze — c'est la garde d'ensemble de matrice (point 7).

**Suite 2 (XCTest) — présente, non exécutée ici.** Chaque fichier a son miroir Swift :
`AccentVectorTests`, `AssistTierVectorTests`, `BridgeFormatterVectorTests`,
`FocusCurveVectorTests`, `OrchestratorVectorTests` (qui consomme aussi
`capabilities.vectors.json`), `ScrollActivityVectorTests`, `SectionResolverVectorTests`
(qui consomme `sections` **et** `sort`), `RiverLaneVectorTests` (les trois `river-*`, 53
vecteurs — `da67c071`). Aucun fichier de vecteurs n'est orphelin de miroir.

**« Même commit de `fixtures/` » : tenu par construction**, pas par convention — les deux
suites lisent le MÊME arbre de travail (`packages/shared/fixtures`, référencée côté Xcode
en `type: folder`), il n'existe pas de copie à synchroniser.

**La réserve** : la moitié XCTest n'a pas tourné ici et ne peut pas tourner ici. La
dernière exécution verte connue de la suite complète est le run **#100** (`31957691661`,
2026-08-16, `a59c326e`) ; onze commits Lentille/Focal/Rivière ont atterri sur `main`
depuis, dont quatre touchant du Swift (`5f65e41f`, `1f32b312`, `784f3c16`, et le lot
Q-146). **Le CI macOS doit être vert sur `81e93f3a` avant que ce point puisse passer à
« prouvé ».**

---

### Point 2 — « Les treize critères de recette du vol. 5 (§7, R1 → R13) passent sur iOS et web. »

**Verdict : NON-TENU** — 10/13 prouvés, 2 reportés-device, **1 non-tenu**.

Table de Q-141 (`tasks/lentille-recette-q141-r1-r20.md` §2), re-vérifiée ici sur les
suites que j'ai rejouées :

- **Prouvés (10)** : R1 (rangs plats/focus card unique), R3 (pont ✦ ↔ non-lu, jamais de
  badge chiffré), R4 (Prisme par les résolveurs jumeaux + chip 🌐), R5 (temps réel
  identique), R6 (pilule 899/901 ms), R8 (drapeau éteint ⇒ identique), R9 (gestes
  inchangés), R10 (écarts d'audit corrigés), R11 (encoche et modes, 3 chemins,
  multi-appareils), R12 (long press 2 chemins + tap court jamais intercepté).
- **Reportés-device (2)** : **R2** (perspective < 1 ms/frame, zéro allocation —
  Instruments obligatoire, cf. point 6) ; **R7** (VoiceOver / Dynamic Type / AA —
  partiellement soldé aujourd'hui : L16-iOS comblé par `5f65e41f` +
  `LentilleFlatRowBridgeAriaTests`, `nested-interactive` soldé par `11272e9f`,
  `aria-required-children` par `f9f5dc4f` ; **résidu Q142-a et Q142-b**, §2.4).
- **NON-TENU (1)** : **R13**, appel en cours. Le rang SAIT rendre la bannière
  (`test_L13_liveCallBanner_isConsumedByTheRow`) mais **rien ne l'alimente sur aucune
  plateforme** : `ConversationListViewModel.swift:692` passe `liveCall: nil`,
  `LocalLiveCallProvider` (`LentilleProviders.swift:260`) n'est appelé par aucun fichier de
  production, et côté web `use-lentille-sections.ts` / `useConversationSorting.ts` posent
  `liveCall: null` en dur. Ce n'est pas une limite d'outillage : c'est un câblage jamais
  fait. Le contrat le classe hors périmètre (« la liste **affiche** l'existence de la
  Scène ; elle ne l'implémente pas », §8) — mais §9.1 point 2 exige R13, et R13 exige
  l'affichage. **Contradiction interne du contrat à trancher** (§3, dette D-2).

---

### Point 3 — « La matrice de couverture §5.3 du vol. 5 (28 lignes) se comporte à l'identique de l'existant, drapeau on. »

**Verdict : TENU-AVEC-RÉSERVE.**

Erratum de compte à nouveau : **17 lignes** (`L01`..`L17`), pas 28 — C-027, re-prouvé par
`packages/shared/fixtures/conformance/behaviour-matrix.json`.

- **iOS : 17/17 couverts.** Le dernier trou (**L16**, volet contenu de l'aria — VoiceOver
  annonçait l'ancien `lastMessage` là où l'œil voyait le pont ✦) a été découvert par Q-140
  et **fermé le jour même** par `5f65e41f`, avec son témoin dédié
  `LentilleFlatRowBridgeAriaTests.swift`. Exécution CI-only.
- **Web : 11/17 en parité littérale `≡`** — L01, L02, L04, L06, L07, L08, L10, L11, L12,
  L15, L17.
- **Écarts, tous typés et re-prouvés par grep 0-hit rejouable** : L03 (glyphes de kind,
  `hors-périmètre-du-lot`), L05 (`lastMessageLocation` absent du modèle web,
  `absent-structurel`), L09 (`hasPendingSync` absent du modèle web,
  `absent-structurel`), L14 (**asymétrie réelle** — ticker 60 s vivant sur iOS, heure
  relative figée entre deux re-renders web ; cosmétique, non bloquant), L16 web (stickers
  `aria-hidden` par choix LWS-10, écart assumé R5-3).
- **L13 : trou symétrique, les deux OS** — même cause que R13 ci-dessus.

**La réserve** : « se comporte à l'identique » n'est vrai qu'au sens amendé par REV-4ter
(« classé : couvert avec preuve, OU non couvert avec raison typée re-prouvée »). Au sens
littéral — les 17 lignes identiques des deux côtés — c'est 11/17.

---

### Point 4 — « La matrice §5 du vol. 4 (16 lignes temps réel du fil) idem, en Focal et en Script. »

**Verdict : NON-TENU.**

Erratum de compte : **15 lignes** (`F01`..`F15`), pas 16.

- **iOS : 15/15 couverts** (`FocalRealtimeMatrixTests` + les suites exhaustives qu'elle
  cite — `FocalAudioRoutingTests`, `FocalMediaGridLayoutTests`,
  `FocalScrollPassGeometryTests`, `FocalHostInsetCompositionTests`,
  `FocalDynamicTypeTests`).
- **Web : 6/15 en parité `≡`** — F03, F04, F06, F07, F09, F13 (dont trois reclassés
  `false → true` par Q-140 après le lot `focal-parity` `da167d4a`).
- **Neuf écarts**, tous typés : F01 (élection sur message tout juste inséré, non testée),
  F02 (aucune cellule typing web en Focal), F05 (données `≡`, habillage non restylé — le
  chip garde le fond « bulle »), F08 (géométrie exacte des slots 1/2/3/4+ non reproduite),
  F10 (menu long-press + rangée fantôme absents ; seul « modifié » est réel), F11 (3
  badges sur 4 absents, « transféré » présent mais **mal placé** — sous le contenu, pas
  au-dessus de l'identité), F12 (pas d'atterrissage recherche → bande de focus), F14
  (`absent-structurel` **légitime** — le DOM web n'est pas inversé, `headInset` répond à
  un besoin purement `UICollectionView` : jamais un trou), F15 (mentions et notices
  d'appel réelles, **effets bitfield entièrement absents**).
- **« en Focal ET en Script »** : aucune des deux plateformes ne rejoue la matrice une
  seconde fois en Script. Script partage l'hôte de Focal et n'en diffère que par la
  densité ; le contrat en fait pourtant une exigence explicite, et elle n'a **aucun
  témoin**.

**Ce que cela veut dire concrètement** : le fil web sous drapeau ON ne rend pas encore ce
que le fil iOS rend. Ce n'est pas une régression — c'est le périmètre de WF-110..113, qui
n'a jamais couvert ces neuf lignes. Mais §9.1 point 4 les exige.

---

### Point 5 — « Drapeaux éteints ⇒ les deux apps sont bit-à-bit identiques à aujourd'hui (test de snapshot par plateforme). »

**Verdict : PROUVÉ.**

- **Web, re-exécuté aujourd'hui** : `ConversationList.lentille-mux.test.tsx` — drapeau OFF
  ⇒ `ConversationItem` historique rendu, structure identique ; les 2 snapshots du dépôt
  sont verts dans le run complet (691/691). Le mux passe par `next/dynamic` : **le bundle
  Lentille n'est pas téléchargé** quand le drapeau est éteint.
- **iOS** : `LentilleFlagGateTests` (le gate lui-même) + `LentilleScreenNotMountedTests`
  (livré par **Q-144**, `37c330b8`, 129 lignes — l'innocuité OFF prouvée par absence de
  montage sur les trois surfaces, pas seulement par un gate applicatif).
- **Rivière, cas particulier plus fort que le gate** : aucun site de montage ne câble
  `isRiverFlagEnabled` dans `resolveCapabilities` — à drapeau OFF **ou ON**, la Rivière ne
  s'ouvre nulle part. Le snapshot OFF est identique **par construction**.

Le volet `meeshy.sh` du mandat Q-144 (« suites de perf ajoutées à `NON_PHASE_SUITES` ») est
**sans objet** : `apps/ios/meeshy.sh:1591` porte déjà `FocalScrollPassPerfTests`, ajouté en
amont par `69629738` [WS-11/F-090], et Q-143 n'a créé aucune suite de perf iOS (son banc de
mesure est un fichier Jest web). Rien à ajouter — noté pour que la prochaine lecture ne
cherche pas un travail manquant qui n'existe pas.

---

### Point 6 — « Budget de défilement tenu sur les deux écrans : < 1 ms/frame, zéro allocation dans la passe, aucune invalidation de layout — mesuré aux Instruments et au profiler navigateur, pas déduit. »

**Verdict : NON-TENU** — et c'est le point le plus franchement rouge des dix, pour **deux**
raisons indépendantes.

**Raison 1 — la mesure exigée n'a pas eu lieu.** §9.1 nomme les deux instruments (« aux
Instruments et au profiler navigateur ») et interdit la déduction. Q-143
(`tasks/lentille-recette-q143-perf.md` §2) recense honnêtement neuf mesures qui exigent un
device ou un navigateur réel et n'en fournit aucune : coût réel en ms/frame sous compositor,
score CLS observé, 120 Hz ProMotion, Time Profiler iOS, trace ARC, sensation du geste,
ordonnancement intra-frame, promotion de layer, Android. **Ni Instruments ni le profiler
navigateur n'ont jamais tourné sur ce chantier.** « < 1 ms/frame » n'est aujourd'hui
affirmé nulle part sur la foi d'une mesure.

**Raison 2 — la seule mesure possible CONTREDIT le critère.** Le banc jsdom de Q-143
(`apps/web/hooks/lentille/__tests__/use-lentille-perspective.perf.test.ts`, 4/4 verts,
N = 150 rangs) mesure, `Array.prototype.push` instrumenté :

| Mesure | Résultat |
|---|---|
| Appels `.push()` sur `candidates`, par frame | **150** (frame 1) et **150** (frame 2) — jamais 1 |
| Identité du tableau `candidates` entre deux frames | **différente** — un tableau NEUF par tick, jamais un pool |
| Total alloué par frame | **1 + 2N objets** courte-durée (301 pour N=150) |

Le contrat §4.1 écrit « **zéro** allocation dans la passe ». La passe web alloue **O(N)**,
N = rangs visibles. Les objets sont petits, à courte durée de vie, éligibles à la jeune
génération de V8 et strictement bornés par la fenêtre visible — le risque réel est faible.
**Mais l'énoncé du contrat est faux tel qu'écrit**, et le laisser tel quel garantit qu'un
lecteur futur croira une propriété que le code n'a pas.

**Ce qui EST prouvé, et qui vaut la peine d'être dit** : la passe n'écrit jamais qu'`opacity`
et `transform` (proxy générique sur `el.style`, aucune liste blanche devinée) — 300
écritures pour 150 rangs, **zéro** occurrence de `height`/`margin`/`padding`/`top`/`left`/
`right`/`bottom`/`width`/`font-size` ; sous `prefers-reduced-motion`, **zéro** écriture de
style ; exactement **1 rAF en vol par surface** avec deux surfaces chargées simultanément.
C'est la preuve « pas d'invalidation de layout » pour tout ce qu'un moteur JS sans layout
engine peut établir. Ce n'est pas une mesure de temps.

**Deux issues, à trancher (§3, dette D-1)** : amender le contrat (« allocation bornée
O(rangs visibles), jamais O(liste) ») **ou** optimiser la passe (pool de candidats réutilisé
entre frames). L'amendement est honnête et coûte une ligne ; l'optimisation coûte une
tâche et n'est justifiée par aucune mesure — l'optimiser d'abord serait précisément
l'optimisation non prouvée que Q-143 a refusé de faire pour `will-change`.

---

### Point 7 — « Fidélité prouvée, pas affirmée : cotes rendues == `lentille-tokens.json` sur iOS et web, et les 44 `id` de `behaviour-matrix.json` couverts sur les deux, le web comparé à iOS `id` par `id`. »

**Verdict : NON-TENU** — moitié cotes tenue, moitié parité non tenue, **et la garde qui
porte ce point est instable**.

**Moitié « cotes » : TENUE** (= R17 de Q-141). `lentille-tokens-consumption-gate.test.ts`
(vitest, vert aujourd'hui) exige de CHAQUE famille de token un consommateur RÉEL — symbole
`LentilleMetrics.<X>` en Swift hors définition/tests, OU variable CSS
`--lentille-<section>-<x>` hors fichier de déclaration/tests — faute de quoi elle doit
figurer, datée, dans `EXCLUDED_DEAD_FAMILIES`. `LentilleMetricsTests`/`FocalMetricsTests`
prouvent la parité valeur JSON ⇔ Swift. Kotlin n'existe pas : hors scope phase 1, pas un
trou.

**Moitié « parité `id` par `id` » : NON TENUE.** 32 id (jamais 44), **32/32 classés**,
**17/32 en parité littérale `≡`** — 11/17 côté `list`, 6/15 côté `thread`. REV-4ter a
explicitement certifié le périmètre livré et **pas** la parité 32/32, en toutes lettres
(« web 17/32 »). C'est le même chiffre aujourd'hui.

**TROUVAILLE DE CETTE REVUE — la garde d'ensemble est ROUGE au réglage par défaut du
runner.** `packages/shared/__tests__/vectors/behaviour-matrix.test.ts:408`
(« chaque id déclaré dans `behaviour-matrix.json` est référencé par au moins un test du
dépôt ») **échoue par timeout de 5 000 ms dans le run complet de `packages/shared`** —
reproduit **2 fois sur 2**. Discrimination faite, pas supposée :

| Exécution | Résultat |
|---|---|
| `npx vitest run` (complet, timeout par défaut 5 s) — run 1 | **1 échec** — `Test timed out in 5000ms` sur `:408` |
| `npx vitest run` (complet, timeout par défaut 5 s) — run 2 | **même échec**, même ligne |
| `npx vitest run __tests__/vectors/behaviour-matrix.test.ts` (isolé) | **15/15 verts, 2,89 s** |
| `npx vitest run --testTimeout=60000` (complet) | **83/83 fichiers, 2168/2168 verts, 13,7 s** |

**Diagnostic** : le contenu de la garde est JUSTE (isolée, elle passe, et le run à timeout
élargi passe intégralement) ; le défaut est son **budget de temps**. Elle balaie
récursivement `REPO_ROOT` de façon synchrone (`scanBehaviourMatrixCoverage`, `readdirSync`
+ lecture de chaque fichier) sous un budget de 5 s, en parallèle des 82 autres fichiers de
la suite. C'est **exactement le blocker REV-4/B5** (« garde d'ensemble de matrice non
déterministe — scan repo synchrone sous `testTimeout` 5 s, rouge à froid 11 s, vert à
chaud »), dont le correctif V4bis `588b585f` (« index en process, 0,96 s à froid ») n'a
**jamais été porté au jumeau vitest** : il n'avait réparé que la garde Jest côté web.

**Pourquoi cela compte pour la clôture** : c'est LA garde qui porte le point 7 et R18. Une
garde qui rougit pour une raison sans rapport avec son sujet est une garde qu'une équipe
apprend à ignorer — le raisonnement même que le commentaire d'armement de ce fichier tient
sur douze lignes pour justifier son `describe.skip` historique. **Ce n'est pas un
non-tenu de conception, c'est un défaut d'outil, et il se répare en une tâche** (§3, dette
D-3). Il n'était pas visible dans Q-140/Q-141 (83/83 verts, machine moins chargée) et Q-143
l'avait rencontré sous une autre cause (l'échec de contenu L16, depuis corrigé).

---

### Point 8 — « Les portes ont été franchies dans l'ordre : recette iOS intégrale (V1) avant tout travail web, recette web intégrale et parité (V2) avant tout travail gateway. »

**Verdict : TENU-AVEC-RÉSERVE.**

**L'ordre a tenu**, et il a tenu contre la pression : PORTE V1 prononcée le 2026-08-16
(`d2d402a0`, REV-3, 4 blockers soldés) **avant** que V4 démarre ; le chantier web a été
mis EN PAUSE sur décision produit après REV-4 plutôt que de continuer sous une porte non
prononçable ; PORTE V2 prononcée le 2026-08-17 (`6f31ff7d`, REV-4ter) **avant** que V5
gateway soit ouverte ; V6 tenue fermée jusqu'à la levée des 2 blockers REV-5, levés le jour
même (`b3a8803a`, `0c5adf65`).

**La réserve porte sur le mot « et parité »**. REV-4ter a prononcé la Porte V2 en
**amendant son propre critère** : « chaque id classé — couvert avec preuve OU non couvert
avec raison TYPÉE re-prouvée », au lieu de « couvert des deux côtés ». C'est un
assouplissement défendable (une raison typée, re-prouvée par grep 0-hit rejoué par le test
lui-même, vaut mieux qu'une couverture de façade) et il a été écrit noir sur blanc plutôt
que passé sous silence. Mais la clause littérale de §9.1 point 8 — « recette web intégrale
**et parité** » — n'a pas été satisfaite au sens où elle a été écrite : la parité valait
17/32 au moment de la porte, et vaut 17/32 aujourd'hui.

---

### Point 9 — « La bascule des substituts est neutre : quand la gateway remplace les mocks, aucun snapshot de vue ne bouge à données égales. »

**Verdict : PROUVÉ.**

- **TS, re-exécuté aujourd'hui** :
  `packages/shared/__tests__/providers/provider-substitution.test.ts` — la bascule
  Local → stub ne change rien au rendu ; le témoin discriminant fait diverger l'`unreadCount`
  appelant (30) de la couverture cache (3) et vérifie que le pont de référence porte bien
  30.
- **iOS** : `ProviderSubstitutionTests`, `LocalBridgeProviderTests`,
  `GatewayBridgeProviderTests`, `GatewayBridgeProviderCompositionGuardTests` — la traversée
  sans transformation est confirmée, et l'injection réelle est câblée en production
  (`ConversationListViewModel` porte `GatewayBridgeProvider()`, G-124). **P7 est neutre.**
- **Gateway, re-exécuté aujourd'hui** : 10 suites / 148 tests verts, dont les témoins de
  coût non-N+1 (`ConversationBridgeService.test.ts` : `__total` identique à 1 et à 10
  conversations ; `emitUnreadCountsToRecipients.cost.test.ts` : 10 requêtes constantes de 1
  à 10 destinataires, ≤ 12 à 49).

**Nuance honnête, qui ne dégrade pas le verdict** : côté web, le substitut
`LocalBridgeProvider` reçoit `NO_LOCAL_CACHE` en production
(`apps/web/hooks/lentille/use-lentille-bridges.ts:36`) et rend donc `null` pour toute
conversation — le web n'a pas de cache de messages couvrant toute la liste. Ce n'est pas un
pont manquant : depuis la levée de REV-5/B1 (`b3a8803a`), le pont web vient du **payload
serveur** soudé wire → rang, pas du substitut. Le substitut reste le repli honnête d'un
chemin qu'aucune vue n'emprunte, et son injectabilité est prouvée par test.

---

### Point 10 — « `main` n'a jamais été mis en danger : à chaque étape, drapeaux éteints, l'app est identique ; la peau dégrade vers le rendu historique si elle lève ; le bundle n'est pas servi à qui ne l'a pas demandé. »

**Verdict : TENU-AVEC-RÉSERVE.**

**Les trois mécanismes sont prouvés** (= R20 de Q-141, re-exécuté aujourd'hui dans le run
web complet) : `lentille-flag-single-occurrence.test.ts` (le nom du drapeau n'apparaît
qu'une fois hors résolveur — la décision n'a pas fui de son point de branchement) ;
`ConversationList.lentille-mux.test.tsx` (le `FeatureErrorBoundary` retombe sur le rendu
historique, jamais sur une page morte) ; `next/dynamic` (le bundle n'est pas téléchargé
drapeau OFF). S'y ajoute le **verrou Q-146/R6-3** (`95a499a1`) : un témoin par plateforme
lie le VRAI défaut du drapeau `riviere_mode` à la preuve structurelle de montage, sous une
seule implication — `defaultIsOn && !isMounted ⇒ échec`. Basculer la Rivière ON par défaut
casse la build tant que R-137 n'a pas monté l'écran. Le verrou tombe de lui-même le jour où
elle le monte.

> **LEVÉE le 2026-08-18** — la réserve ci-dessous décrit l'état du code entre le 2026-08-16
> et le 2026-08-18. Le palier 0 a été soldé : la cascade bêta est **RETIRÉE**, `reading_modes`
> est de nouveau **OFF** en l'absence d'opt-in explicite, et la clause « le bundle n'est pas
> servi à qui ne l'a pas demandé » redevient vraie sur iOS. Voir §2.2 point 1 et §2.4
> palier 0. Le texte d'origine est conservé tel quel — il documente ce qui a motivé la
> décision.

**La réserve, et elle est réelle : sur iOS, `reading_modes` est DÉJÀ ON pour tout le
monde.** La cascade I-075 (`LentilleFeatureFlag.isEnabled`, second amendement produit du
2026-08-16) résout, pour `.readingModes` : environnement absent → clé
`meeshy.flag.reading_modes` jamais posée → **repli sur `BetaFeaturesPreference.isEnabled`,
dont l'absence de clé vaut `true`**. Conséquence, sur une installation neuve : le tap normal
d'une conversation passe par l'orchestrateur, défaut `.focal`, jamais `.bubbles`. La
clause « le bundle n'est pas servi à qui ne l'a pas demandé » est donc **littéralement
fausse sur iOS aujourd'hui** — pour le fil, pas pour la liste (`lentille_list` reste OFF).

Ce n'est **pas** une mise en danger de `main` par inadvertance : c'est une décision produit
écrite, datée, testée (`BetaFeaturesPreferenceGateTests`,
`BetaFeaturesReadingModesIntegrationTests`), avec son interrupteur utilisateur (section
« Bêta » des Réglages) et sa surcharge process. Mais elle doit être **nommée comme une
activation déjà en cours**, pas découverte au moment de la mise en production — c'est
l'objet du palier 0 du §2.

---

### Récapitulatif

| # | Point de §9.1 | Verdict |
|---|---|---|
| 1 | Vecteurs verts dans deux suites, même commit `fixtures/` | **tenu-avec-réserve** (TS re-exécuté vert ; XCTest CI-only, pas vert sur `81e93f3a` à ce jour) |
| 2 | R1 → R13 sur iOS et web | **non-tenu** (10 prouvés, R2/R7 device, **R13 jamais câblé**) |
| 3 | Matrice `list` identique drapeau ON | **tenu-avec-réserve** (iOS 17/17 ; web 11/17 `≡`, 6 écarts typés) |
| 4 | Matrice `thread` idem, en Focal **et** en Script | **non-tenu** (iOS 15/15 ; web 6/15 ; Script sans aucun témoin) |
| 5 | Drapeaux OFF ⇒ bit-à-bit identique | **prouvé** |
| 6 | < 1 ms/frame, zéro allocation, zéro invalidation — **mesuré** | **non-tenu** (aucune mesure Instruments/profiler ; allocation mesurée O(N) ≠ 0) |
| 7 | Cotes == tokens **et** 32 id en parité `id` par `id` | **non-tenu** (cotes tenues ; parité 17/32 ; **garde d'ensemble rouge au timeout par défaut**) |
| 8 | Portes franchies dans l'ordre | **tenu-avec-réserve** (ordre tenu ; « et parité » satisfait au sens amendé seulement) |
| 9 | Bascule des substituts neutre | **prouvé** |
| 10 | `main` jamais mis en danger | **tenu** depuis le 2026-08-18 (mécanismes prouvés ; la réserve « iOS `reading_modes` déjà ON par la cascade bêta » est **levée** — cascade retirée, palier 0 soldé, §2.2 point 1) |

---

## 2. Dossier d'activation

### 2.1 Les six leviers — état réel aujourd'hui, `81e93f3a`

| Levier | Domicile | Résolution | **Défaut aujourd'hui** |
|---|---|---|---|
| **`lentille_list`** (web) | `hooks/lentille/resolve-lentille-flag.ts` | `?lentille=1\|0` > cookie `meeshy_lentille` > `NEXT_PUBLIC_LENTILLE_DEFAULT === 'true'` > OFF | **OFF** — aucune variable posée dans le dépôt |
| **`reading_modes`** (web) | `hooks/lentille/resolve-reading-modes-flag.ts` | `?reading_modes=1\|0` > cookie `meeshy_reading_modes` > `NEXT_PUBLIC_READING_MODES_DEFAULT` > OFF | **OFF** |
| **`riviere_mode`** (web) | `hooks/lentille/resolve-river-mode-flag.ts` | `?riviere_mode=1\|0` > cookie `meeshy_riviere_mode` > `NEXT_PUBLIC_RIVIERE_MODE_DEFAULT` > OFF | **OFF, et VERROUILLÉ** (R6-3) |
| **`LentilleFeatureFlag.lentilleList`** (iOS) | `Lentille/Core/LentilleFeatureFlag.swift` | `MEESHY_FLAG_LENTILLE_LIST` (`"1"`/`"0"`) > `UserDefaults["meeshy.flag.lentille_list"]` > OFF | **OFF** |
| **`LentilleFeatureFlag.readingModes`** (iOS) | idem, cascade I-075 à 3 étages, **étage 3 restreint le 2026-08-18** | `MEESHY_FLAG_READING_MODES` > clé `meeshy.flag.reading_modes` **si explicitement posée** > `BetaFeaturesPreference` **si explicitement exprimée** | **OFF** — absence de toute clé ⇒ `false` (retrait I-075, 2026-08-18) ; opt-in explicite ⇒ ON |
| **`LentilleFeatureFlag.riviereMode`** (iOS) | idem, 2 étages, jamais la cascade bêta | `MEESHY_FLAG_RIVIERE_MODE` > `UserDefaults["meeshy.flag.riviere_mode"]` > OFF | **OFF, VERROUILLÉ (R6-3) et inerte** (aucun site ne câble `isRiverFlagEnabled`) |
| *(support)* **`BetaFeaturesPreference`** (iOS) | `Lentille/Core/BetaFeaturesPreference.swift` | `MEESHY_FLAG_BETA_FEATURES` > `UserDefaults["meeshy.pref.beta_features_enabled"]` **si écrite** > **TRUE** | **ON, INCHANGÉ par le retrait du 2026-08-18** — toggle « Bêta » des Réglages ; ne gate plus que l'item « Focal (bêta) » du menu d'appui long, sauf opt-in explicite |
| *(hors périmètre)* **`agent_grammar`** (iOS) | `MeeshyFeatureFlags.isAgentGrammarEnabled` | env > `UserDefaults` > OFF | **OFF** — décision produit ÉCRITE exigée par §5.2, non prise |

**Rien n'est posé nulle part.** Aucun `.env`, aucun `docker-compose`, aucun workflow CI, aucun
`Dockerfile` du dépôt ne définit `NEXT_PUBLIC_LENTILLE_DEFAULT`,
`NEXT_PUBLIC_READING_MODES_DEFAULT`, `NEXT_PUBLIC_RIVIERE_MODE_DEFAULT` ni un
`MEESHY_FLAG_*` (grep exhaustif, 2026-08-17). L'activation est donc **entièrement devant
vous** — aucun état hérité à défaire — **à une exception près : la cascade bêta iOS**.

### 2.2 Une décision produit déjà active, à confirmer ou à retirer

Deux décisions ont été prises par des lots d'exécution et sont **vivantes en production
aujourd'hui** :

1. **iOS — `reading_modes` ON par défaut** (I-075, 2026-08-16). Tout appareil qui installe
   l'app et ne touche à rien ouvre ses conversations par l'orchestrateur. C'est le plus gros
   levier du chantier, et il est déjà tiré.
   → **DÉCISION PRISE le 2026-08-18 : RETIRÉE.** La cascade bêta ne vaut plus opt-in
   implicite. Sémantique exacte du retrait, telle qu'implémentée :
   - **Absence de toute clé ⇒ OFF.** Ni `MEESHY_FLAG_READING_MODES`, ni
     `meeshy.flag.reading_modes`, ni `meeshy.pref.beta_features_enabled` ⇒ `false` : une
     installation neuve ouvre ses conversations en **Bulles** (comportement historique).
   - **Les choix explicites survivent, dans les deux sens.** L'environnement
     (`"1"`/`"0"`) prime toujours ; la clé `meeshy.flag.reading_modes` posée explicitement
     est respectée à `true` **comme** à `false`. Étages 1 et 2 de la cascade : INCHANGÉS.
   - **L'opt-in bêta volontaire n'est pas retiré.** Le toggle « Bêta » des Réglages
     EXPLICITEMENT basculé à `true` (clé présente) allume toujours les modes de lecture ;
     explicitement à `false`, il les coupe. Seule l'**ABSENCE** de ce choix ne vaut plus
     opt-in.

   Implémentation : la restriction vit dans la cascade de `LentilleFeatureFlag.isEnabled`
   (nouveau prédicat `BetaFeaturesPreference.isExplicitlySet`), **pas** dans la polarité de
   défaut de `BetaFeaturesPreference` — celle-ci reste ON parce que son autre client, la
   visibilité de l'item « Focal (bêta) » du menu d'appui long, n'est pas visé par la
   décision. Sur les 144 combinaisons de la cascade, **4 seulement changent de verdict** :
   exactement celles où rien n'a jamais été exprimé.
2. **Web — « Bulles » par défaut, PROVISOIRE** (`e87886a9`, 2026-08-17). Sans choix
   explicite du lecteur, le fil ouvert rend les bulles **y compris drapeau ON**, là où
   l'orchestrateur résolvait `auto → focal`. La décision vit à UN SEUL endroit
   (`use-thread-reading-mode.ts`, constante `PROVISIONAL_DEFAULT_RENDER`), datée, commentée
   avec sa procédure de retrait, sans amender aucune loi partagée.

**Les deux vont en sens opposé.** iOS ouvre en Focal par défaut ; le web ouvrirait en Bulles
même drapeau allumé. C'est cohérent comme prudence (le web est moins mûr — cf. point 4,
6/15), mais cela signifie qu'**allumer `reading_modes` sur le web ne montrera Focal à
personne** tant que `PROVISIONAL_DEFAULT_RENDER` est là. Décision à prendre AVANT le palier
web, pas après (c'est Q142-c).

### 2.3 Conditions d'activation tracées — ce qui est levé, ce qui tient encore

| Condition | Origine | État au `81e93f3a` | Ce qu'elle bloque |
|---|---|---|---|
| **R5-7** `nested-interactive` | REV-4ter, « **condition d'activation V6** » | **SOLDÉE** — `11272e9f`, patron « card action » : racine muette, bouton frère en couverture, 4 arrêts de tabulation dans l'ordre d'avant, `axe()` NU sans règle désactivée | plus rien |
| **R5-8** `aria-required-children` grille Rivière | REV-4ter | **SOLDÉE** — `f9f5dc4f`, `role="row"` par rang + `role="gridcell"` par bulle, RED prouvé (2 violations) avant correctif | plus rien |
| **R6-4** « Bulles » ON sans effet | REV-5 couture (d) | **SOLDÉE** — `6efc56ac`, l'entrée `bubble` du `LensSwitcher` est BRANCHÉE (et non masquée : masquer aurait fait du défaut provisoire un aller simple) | plus rien |
| **R6-5** `suggestedMode` 0 consommateur | REV-5 couture (b), Q-141 §4 | **SOLDÉE** — `b62bc163` (web) + `784f3c16` (iOS) : l'encoche de la focus card lit la décision du serveur au lieu de la recalculer. Critère produit A6 satisfait | plus rien |
| **R6-3** Rivière non montée | REV-5 couture (c) | **VERROU EN PLACE** — `95a499a1`, `defaultIsOn && !isMounted ⇒ build rouge`, les deux plateformes | `riviere_mode` ON par défaut, jusqu'à **R-137** |
| **R5-6** scope web sans identité | REV-4ter, « **condition** : LWS-3/G-121 avant activation multi-comptes » | **OUVERTE** | toute activation web de `reading_modes` sur un navigateur multi-comptes |
| **Q142-a** contraste 4,393:1 | Q-142 croisé, `81e93f3a` | **OUVERTE — décision design** | rien techniquement ; un critère AA du contrat |
| **Q142-b** Dynamic Type rangée Lentille | Q-142 | **OUVERTE — aucun substitut** | rien techniquement ; un critère explicite de LWS-13 |
| **Q142-c** défaut Bulles non reflété | Q-142 / `e87886a9` | **OUVERTE — décision produit** | la cohérence de ce que le web montrera au palier 3 |

**R5-6, en clair, parce que c'est la seule condition qui doit gouverner un palier.** La clé
web est `meeshy:reading-mode:<conversationId>` — **sans préfixe d'identité**. iOS a le
sien (`meeshy_readmode_<scope>_<id>`, posé en réponse à une fuite privacy multi-comptes du
2026-05-26). Le type gelé `ReadingModePreferenceScope` ne porte que `{ conversationId }`.
Conséquence : sur un navigateur partagé, deux comptes qui ouvrent la même conversation se
transmettent leur mode de lecture. La colonne serveur existe (G-120, Prisma `readingMode`)
et la route aussi (G-121, avec broadcast versionné) ; **iOS consomme le broadcast** et écrit
dans son magasin scopé (`MeeshyApp` branche `onReadingModePreferenceChanged`, gardé par
`isReadingModesEnabled`) ; **le web, lui, n'écrit ni ne lit la route** — aucun appel réseau
`readingMode` dans `apps/web` (grep 2026-08-17). Le levier de sortie existe et n'est pas
tiré côté web : c'est une tâche, pas un chantier.

**Q142-a, en clair.** Sur un rang portant la focus card, en thème **clair**, le point médian
et l'heure (`text-muted-foreground` sur `--secondary`) mesurent **4,393:1** contre 4,5:1
exigés pour du texte normal — l'heure est cotée 12 px. Déficit **0,107**. Thème sombre :
5,78, tenu. Fond ordinaire : 4,83 clair / 7,93 sombre, tenu. Ce n'est pas une régression
(la couleur préexistait) : ce qui est neuf, c'est la mesure, et le témoin **verrouille le
chiffre mesuré** au lieu d'affirmer une conformité. Trois issues : assombrir d'un cran le
token sur le fond `--secondary` ; monter l'heure à 14 px (elle devient « texte large », seuil
3:1) ; ou consigner l'écart comme accepté et daté. **Aucune n'est prise ici.**

**Q142-b, en clair.** `grep -l 'DynamicTypeSize\|accessibility5'` sur
`apps/ios/MeeshyTests/Unit/Lentille/` → **0 fichier**. Le contrat
(`lentille-implementation-contract.md:522`) exige « Dynamic Type `.accessibility5` sans
troncature sur les 8 branches de contenu du rang ». Le harnais existe et fonctionne — il est
utilisé par `FocalDynamicTypeTests` (fil) et par
`MeeshySDK/Tests/.../DynamicTypeTests.swift` (SDK). **Il n'a simplement jamais été appliqué
à `LentilleConversationRow`.** Ce n'est ni un manque d'outil ni un désaccord : c'est un
travail non fait, sur un critère nommé, et c'est la seule des trois réserves Q-142 dont le
remède est purement mécanique.

### 2.4 Recommandation — activation progressive par paliers

> **La décision est à l'utilisateur.** Ce qui suit est un ordre de bataille : ce qu'on
> allume, pour qui, dans quel ordre, et à quel signal on éteint. Chaque palier est
> réversible par **une seule** variable d'environnement ou **une seule** écriture
> `UserDefaults` — aucun ne demande un déploiement de code pour revenir en arrière.

**Palier 0 — DÉCIDER, ne rien allumer. ~~Aujourd'hui.~~ FAIT le 2026-08-18.**
Confirmer ou retirer la cascade bêta iOS (§2.2 point 1). C'est la seule activation déjà en
cours, et elle porte le levier le plus lourd du chantier.
*Si CONFIRMÉE* : rien à faire, mais l'écrire dans ce document — pour que la mise en
production ne la découvre pas.
*Si RETIRÉE* : `MEESHY_FLAG_READING_MODES=0` dans le schéma de la build (surcharge process,
prime sur tout), ou une écriture explicite de `meeshy.flag.reading_modes` à `false` au
premier lancement. Coût : une ligne.
**Retour arrière** : symétrique, une ligne.

**→ DÉCISION PRISE le 2026-08-18 : RETIRÉE.** Trois points, détaillés au §2.2 point 1 :
- **Absence de toute clé ⇒ OFF** — installation neuve ⇒ ouverture en **Bulles**.
- **Les choix explicites survivent, dans les deux sens** — env `MEESHY_FLAG_READING_MODES`
  (`"1"`/`"0"`) et clé `meeshy.flag.reading_modes` (`true` comme `false`) : INCHANGÉS.
- **L'opt-in bêta volontaire n'est pas retiré** — toggle « Bêta » explicitement ON ⇒ modes
  de lecture ON ; explicitement OFF ⇒ OFF. Seule l'ABSENCE de ce choix cesse de valoir
  opt-in.

Le retrait a été **porté dans le code**, pas dans le schéma de build : ni
`MEESHY_FLAG_READING_MODES=0` ni écriture au premier lancement n'ont été nécessaires. La
cascade de `LentilleFeatureFlag.isEnabled` ne consulte plus l'étage bêta que si la
préférence est explicitement exprimée (`BetaFeaturesPreference.isExplicitlySet`). Deux
avantages sur la variante « une ligne dans le schéma » : le défaut est le même pour TOUTES
les builds (App Store, TestFlight, dev) au lieu de dépendre du schéma utilisé, et la
surcharge process `MEESHY_FLAG_READING_MODES` **reste libre** pour les tests UI et
TestFlight au lieu d'être consommée par le retrait lui-même.
**Retour arrière** : `MEESHY_FLAG_READING_MODES=1` (surcharge process, prime sur tout), ou
revert du commit `[P0-150]`. Le palier 2 ci-dessous en tient compte.

**Palier 1 — Équipe interne, web, opt-in par URL. Rien à déployer.**
`https://…/conversations?lentille=1` et `?reading_modes=1`. Le cookie persiste pour ce
navigateur seulement ; rayon d'action **nul** pour tout autre utilisateur ; aucune variable
d'environnement posée, donc aucun risque de fuite par un build.
**Pré-conditions** : aucune.
**Retour arrière** : `?lentille=0` / `?reading_modes=0` — le résolveur efface le cookie.
**À quoi ce palier sert** : c'est le seul moyen d'obtenir aujourd'hui ce que §9.1 point 6
exige et que personne n'a — une trace du profiler navigateur sur la passe de perspective, en
conditions réelles. **Faire cette mesure ici**, pas plus tard.

**Palier 2 — Bêta iOS TestFlight, liste comprise.**
`MEESHY_FLAG_LENTILLE_LIST=1` dans l'environnement du schéma de build TestFlight
uniquement. `reading_modes` reste sur la cascade bêta — **désormais OFF en l'absence
d'opt-in explicite** (retrait du 2026-08-18, palier 0) : pour que la population TestFlight
voie les modes de lecture, il faut ajouter `MEESHY_FLAG_READING_MODES=1` au schéma
TestFlight, ou compter sur le toggle « Bêta » que chaque testeur bascule lui-même. À
trancher au moment d'ouvrir ce palier. `riviere_mode` reste OFF.
**Pré-conditions, dans cet ordre** :
  (a) CI macOS vert sur le SHA embarqué (point 1 — ce n'est pas une formalité : quatre
  commits Swift ont atterri depuis le dernier run complet vert connu) ;
  (b) **Q142-b soldée** — la population bêta contient des utilisateurs Dynamic Type, et la
  rangée qu'ils verront est précisément celle qui n'a aucun témoin ;
  (c) **Q142-a tranchée** (corrigée ou acceptée-datée) ;
  (d) le résidu R13/L13 nommé dans les notes de version : la bannière d'appel en cours
  **n'existe pas**, sur aucune plateforme — mieux vaut le dire que le faire découvrir.
**Retour arrière** : retirer la variable du schéma → build suivant ; en urgence sur un
appareil, `LentilleFeatureFlag.setForDebug(.lentilleList, enabled: false)` via la bascule
cachée des réglages.
**Critère de retour** : un crash sur le chemin liste ; une plainte VoiceOver ou Dynamic Type
sur la rangée ; un jank perçu au défilement (c'est aussi la seule façon d'obtenir la trace
Instruments qui manque au point 6).

**Palier 3 — Web `reading_modes` en général.**
`NEXT_PUBLIC_READING_MODES_DEFAULT=true`.
**Pré-conditions** :
  (a) **R5-6 fermée** — ou la population restreinte à des navigateurs mono-compte. Sans
  cela, deux comptes partageant un navigateur se transmettent leur mode de lecture. C'est
  une fuite de préférence, pas de contenu ; elle reste inacceptable sur un poste partagé.
  (b) **Q142-c tranchée** : tant que `PROVISIONAL_DEFAULT_RENDER` est là, ce palier
  n'affiche Focal à **personne** — il ouvre seulement le menu de modes. Décider si c'est
  l'intention (activation « silencieuse » du choix, sans changer le défaut) ou un
  contresens.
  (c) Le résidu du point 4 accepté par écrit : le fil web ne rend pas 9 des 15 lignes de
  matrice que le fil iOS rend (effets bitfield, menu long-press, 3 badges sur 4, saut de
  recherche, typing, insertion live). Ce sont des **absences visibles**, pas des bugs.
**Retour arrière** : retirer la variable → redéploiement.
**Piège à prévoir dès maintenant** : les cookies posés au palier 1 **survivent** au retrait
de la variable (le cookie prime sur l'env dans la précédence). Prévoir l'interrupteur —
soit un lien `?reading_modes=0` diffusé, soit une purge de cookie côté serveur. **À écrire
avant d'allumer, pas pendant l'incident.**

**Palier 4 — Web `lentille_list` en général.**
`NEXT_PUBLIC_LENTILLE_DEFAULT=true`.
**Pré-conditions** : palier 3 stabilisé ; **L14** tranchée (l'heure relative du web est
figée entre deux re-renders — visible sur une liste laissée ouverte) ; Q142-a soldée pour
de bon (la focus card **est** l'objet central de la Lentille, son contraste ne peut pas
rester un constat verrouillé indéfiniment).
**Retour arrière** : retirer la variable ; même piège cookie qu'au palier 3.

**Palier 5 — Rivière. NON ACTIVABLE, et c'est voulu.**
Le verrou R6-3 fait rougir la build si le défaut passe ON sans écran monté, et aucun site
ne câble `isRiverFlagEnabled` : la Rivière est inerte à OFF **comme à ON**. Elle s'ouvre
avec **R-137** (montage de l'écran Rivière au fil), pas avant. Le verrou tombe alors de
lui-même.

**Jamais dans cette phase** : `agent_grammar` (le chemin serveur non écrivant est prouvé
depuis G-126/`03b4eaea`, mais §5.2 exige **en plus** une décision produit ÉCRITE, que
Q-143 a explicitement refusé de prendre à la place de l'équipe) ; Android/LWS-12 (phase 2,
fermée tant que Q-145 n'est pas actée).

### 2.5 Les trois choses à lire si vous n'en lisez que trois

1. **Un levier est déjà tiré** : sur iOS, les modes de lecture sont ON pour tout le monde
   depuis le 2026-08-16. Confirmez-le ou retirez-le — mais décidez-le.
2. **Le web est mûr pour la liste, pas pour le fil** : 11/17 sur la liste contre 6/15 sur
   le fil. L'ordre des paliers 3 et 4 est peut-être à inverser selon ce que vous voulez
   montrer en premier.
3. **Trois pré-conditions sont mécaniques et peu coûteuses** (Q142-b : appliquer un harnais
   existant ; D-3 : porter un correctif existant ; R5-6 : brancher une route existante).
   Aucune n'est un chantier. Les faire avant le palier 2 coûte moins que les expliquer
   après.

---

## 3. La dette restante, ordonnée

Ordre = ce qui bloque un palier d'abord, puis ce qui coûte le plus cher à laisser pourrir.
Tailles : **S** ≈ une micro-tâche Sonnet · **M** ≈ 2-4 micro-tâches · **L** ≈ une vague.

| # | Dette | Origine | Bloque | Propriétaire suggéré | Taille |
|---|---|---|---|---|---|
| **D-1** | **Q142-b — Dynamic Type `.accessibility5` sur les 8 branches de la rangée Lentille.** Le harnais existe (`FocalDynamicTypeTests`, `MeeshyUITests/.../DynamicTypeTests.swift`) ; il n'a jamais été pointé sur `LentilleConversationRow`. 0 fichier sous `MeeshyTests/Unit/Lentille` ne cite `DynamicTypeSize`. | Q-142 / contrat §LWS-13 | **palier 2** | Sonnet (iOS) | **S** |
| **D-2** | **Q142-a — contraste 4,393:1 (point médian + heure sur focus card, thème clair).** Déficit 0,107. Trois issues chiffrées au §2.3. **Décision design** puis, le cas échéant, un token à bouger. | Q-142 / `81e93f3a` | **palier 2** | Design + Sonnet (web/iOS) | **S** |
| **D-3** | **Garde d'ensemble `behaviour-matrix` rouge au timeout par défaut de vitest.** Rouge 2/2 en suite complète, verte isolée et à `--testTimeout=60000`. Porter le correctif V4bis `588b585f` (index en process, 0,96 s à froid) au jumeau vitest — ou, a minima, un `testTimeout` explicite sur ce seul `it`. La garde porte le point 7 et R18 : un rouge parasite la rend ignorable. | **Q-145 (cette revue)** — récurrence de REV-4/B5 | rien formellement, **la crédibilité du point 7** | Sonnet (shared) | **S** |
| **D-4** | **R5-6 — le magasin web de mode de lecture n'a pas d'identité.** Clé `meeshy:reading-mode:<conversationId>`, sans préfixe. La colonne (G-120) et la route (G-121) existent ; iOS consomme déjà le broadcast ; le web n'appelle jamais la route. | REV-4ter | **palier 3** | Sonnet (web + gateway) | **M** |
| **D-5** | **Q142-c — le défaut « Bulles » provisoire n'est reflété ni par l'encoche ni par `LensSwitcher`.** L'écran fait une chose, les affordances en annoncent une autre. **Décision produit** : garder le défaut (et l'annoncer), ou le retirer (une constante et une branche, procédure écrite dans `use-thread-reading-mode.ts`). | `e87886a9` / Q-142 | **palier 3** | Produit, puis Sonnet (web) | **S** (après décision) |
| **D-6** | **Point 6 — la mesure qui n'a jamais eu lieu.** Aucune trace Instruments (iOS), aucune trace de profiler navigateur (web). Le palier 1 la rend possible sans rien déployer. Neuf items device-only recensés en Q-143 §2. | §9.1 point 6 / Q-143 | **la clôture littérale** | QA + Sonnet | **M** |
| **D-7** | **« Zéro allocation » : l'énoncé du contrat §4.1 est faux.** Mesuré : 1 + 2N objets par frame, N = rangs visibles. Amender le texte (« allocation bornée O(rangs visibles) ») **ou** poser un pool. L'amendement est le geste honnête tant que D-6 n'a rien mesuré. | Q-143 §1.b | rien | Rédacteur du contrat | **S** (amendement) / **M** (pool) |
| **D-8** | **R13 / L13 — l'appel en cours n'est câblé nulle part.** `liveCall: nil` en dur sur les deux OS ; `LocalLiveCallProvider` existe et n'est appelé par aucun fichier de production. **Contradiction à trancher** : §8 du workshop met la Scène hors périmètre, §9.1 point 2 exige R13. Soit on câble, soit on retire R13 de la grille — mais pas les deux. | Q-140, Q-141, REV-3 | **le point 2** | Produit (arbitrage) puis Sonnet ×2 | **M** |
| **D-9** | **Parité `thread` web : 9 lignes sur 15 manquantes.** F15 (effets bitfield, absents), F10 (menu long-press + rangée fantôme), F11 (3 badges sur 4, et « transféré » mal placé — sous le contenu au lieu d'au-dessus de l'identité), F12 (saut recherche → bande de focus), F01/F02 (insertion live, typing), F05 (habillage des réactions non restylé), F08 (géométrie des slots). F14 est **légitimement** absent (DOM non inversé). | Q-140, REV-4ter | **le point 4** | Vague web dédiée | **L** |
| **D-10** | **Matrice en mode Script : aucun témoin, aucune plateforme.** §9.1 point 4 exige « en Focal **et** en Script ». Script partage l'hôte de Focal ; la question est de savoir si la matrice doit être rejouée ou si la clause doit disparaître. | §9.1 point 4 | **le point 4** | Sonnet ×2 (ou amendement) | **M** |
| **D-11** | **R-137 — montage de la Rivière au fil.** Choisir Rivière au menu ⇒ voir Focal. Le verrou R6-3 tient la porte fermée et tombe le jour du montage. Les trois lois (`river-lanes`/`river-step`/`river-headers`, 53 vecteurs, 2 miroirs) et les deux peaux (Canvas iOS, SVG web) sont **déjà là** : c'est un montage, pas une conception. | REV-5 couture (c) | **palier 5** | Vague dédiée | **L** |
| **D-12** | **L14 — l'heure relative du web ne vit pas.** iOS a son `TimelineView(.periodic(by: 60))` ; le web calcule `time` une fois par rendu. Une liste laissée ouverte affiche une heure périmée. | Q-140 | **palier 4** (cosmétique) | Sonnet (web) | **S** |
| **D-13** | **Le mapper Jest mort — décision d'équipe pendante.** `apps/web/jest.config.js:33` mappe `@meeshy/shared/*` vers `dist/` ; `next/jest` régénère son propre mapper depuis les `paths` du `tsconfig.json`, qui pointent vers la SOURCE, **et cette génération l'emporte**. Toute suite web qui importe `@meeshy/shared/...` charge la source, jamais le build — le contraire de ce que dit le commentaire. Piège aggravant : `require.resolve` rend pourtant un chemin `dist/`. **Deux issues** : réparer le mapper (⇒ toutes les suites web basculent sur `dist/`, casse potentiellement large) ou retirer la ligne et assumer « le web teste la source ». La parité `dist/` elle-même est déjà garantie par ailleurs (`shared-law-dist-parity.test.ts`, 46 vecteurs, import par chemin relatif explicite, discrimination prouvée dans les deux sens). | Cycle 61 / REV-4ter | rien (mensonge de configuration) | Équipe web | **S** (retrait) / **M** (réparation) |
| **D-14** | **R6-7 — l'étage agent est mono-langue de fait.** Réserve neuve de REV-5, jamais instruite depuis. À qualifier avant d'être chiffrée. | REV-5 | rien | Sonnet (agent) — audit d'abord | **S** (audit) |
| **D-15** | **`agent_grammar` — décision produit ÉCRITE manquante.** La condition technique du contrat §5.2 (chemin serveur C3 non écrivant) est **TENUE** depuis G-126 (`03b4eaea`, clôture d'imports prouvée, durcie en allowlist exacte par Q-146/R6-1). Le site d'appel iOS lit enfin le vrai drapeau (R6-2, `1f32b312`). Il ne manque **que** la décision écrite — que ni Q-143 ni Q-145 ne prennent à la place de l'équipe. | Contrat §5.2 / #3010 WS-10 | l'activation d'`agent_grammar` | Produit | **S** |
| **D-16** | **L03 / L05 / L09 web — écarts `absent-structurel` du modèle.** `lastMessageLocation`, `hasPendingSync` et les glyphes de kind n'existent pas dans le modèle `Conversation` web. Ce ne sont pas des oublis d'UI : ce sont des données absentes. À ouvrir avec le modèle, pas avec la peau. | Q-140 | rien | Backlog produit | **M** |
| **D-17** | **Phase 2 — Android, LWS-12.** Fermée par construction tant que Q-145 n'est pas actée. Sur un cœur figé, l'estimation du plan tient : **~15 tâches Sonnet + 1 revue Opus**. Les cinq critères de §9.2 n'ont **rien de neuf à décider** — miroirs Kotlin sur les mêmes vecteurs, `LentilleDimens` == tokens, 32 id en JUnit, R1→R20 rejouée, et les deux divergences Android connues (sectionnement `PINNED/CATEGORY/ALL` → loi partagée ; miroir manquant du résolveur d'aperçu du Prisme). **Point d'attention** : §9.2 hérite du compte faux (« les 44 id ») — le corriger dans l'avenant, pas au milieu de la vague. | Contrat LWS-12 / §9.2 | — | Vague Android | **L** |

---

## 4. Ce que Q-145 n'a pas fait

- **Aucune décision d'activation prise.** Les paliers du §2.4 sont une recommandation
  argumentée ; la décision est à l'utilisateur, et aucune variable d'environnement, aucun
  défaut, aucun drapeau n'a été touché par cette tâche.
- **Aucun correctif.** La trouvaille D-3 (garde d'ensemble rouge au timeout par défaut) est
  **nommée et diagnostiquée**, pas réparée — le mandat de cette revue est la lecture seule,
  et la réparer aurait mélangé un correctif à un dossier de clôture.
- **Aucune exécution XCTest.** Pas de toolchain Xcode ici. Toute affirmation iOS de ce
  document est une lecture confrontée au code de production, jamais une exécution
  présentée comme telle.
- **Aucune mesure Instruments ni profiler navigateur.** C'est précisément la dette D-6 :
  la nommer une troisième fois ne la comble pas.
- **Aucun amendement de §9.1.** Les trois errata de compte (7 fichiers → 12 ; 28 lignes →
  17 ; 16 lignes → 15 ; et le « 44 id » de §9.2) sont **consignés** ici. Réécrire la
  définition de « fini » pendant qu'on la mesure serait le geste le moins honnête de tout
  ce chantier.

---

## 5. Fichiers touchés

- `tasks/lentille-cloture-phase1.md` — ce document, seul fichier créé ou modifié.
