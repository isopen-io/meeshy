# Workshop — Lentille × Focal : un seul chantier, deux écrans, trois frontends

> **Statut** : contrat d'orchestration. C'est le document qui *séquence* ; les contrats d'exécution sont `tasks/focal-implementation-contract.md` (le fil) et `tasks/lentille-implementation-contract.md` (la liste).
> **Branche** : `claude/lentille-conversations-view-8silmf`.
> **Sources normatives** : `docs/design/2026-08-14-conversation-views-brainstorm.html` (vol. 1), `2026-08-15-conversation-modes-use-cases.html` (vol. 2), `2026-08-15-conversation-modes-verdict.html` (vol. 3), `2026-08-15-focal-spec-integration.html` (vol. 4), `2026-08-15-conversation-list-lentille.html` (vol. 5).
> **Maquettes de référence** (font foi sur les **cotes** ; les documents font foi sur les **règles**) : `la-lentille.html` — https://claude.ai/code/artifact/d068fe38-e4ab-4b11-aa9c-f9c0585aef33 · `focal-grandeur-nature.html` — https://claude.ai/code/artifact/83621c34-e472-4b2e-be75-0a06dbebc2ad. Relevées et confirmées : les constantes des deux écrans (§2.2) sont exactement celles de leur CSS. Cotes détaillées en §4.3 du contrat Lentille.
> **Portée** : les **deux** écrans (liste des conversations + fil de messages), les **trois** frontends (iOS, web, Android), plus gateway et `packages/shared`.

---

## 0. Les trois décisions que ce document prend

1. **La liste et le fil sont un seul chantier.** L'orchestrateur des modes de lecture décide *dans* la liste (encoche de la focus card, chip du mode mémorisé) et s'applique *dans* le fil. Le pont ✦ affiché en ligne 2 d'un rang est la même phrase que celle qui accueille le lecteur en tête de Focal. Livrer l'un sans l'autre produit deux écrans qui se contredisent.
2. **Les lois pures quittent Swift pour `packages/shared`.** Le contrat #3010 héberge quatorze fichiers de lois dans `apps/ios/Meeshy/Features/Main/Focal/Core/*.swift`. Tenu tel quel, il rend l'unification des frontends **structurellement impossible** : web et Android réimplémenteraient les mêmes seuils, et ils divergeraient. Les lois deviennent TypeScript dans `packages/shared/`, avec miroirs Swift et Kotlin tenus honnêtes par des **vecteurs de test partagés**. C'est le patron que le dépôt applique déjà trois fois (`resolveUserLanguage`, présence 1/3/5, accent conversationnel) et que `CLAUDE.md` impose déjà en toutes lettres.
3. **Le contrat #3010 est amendé, pas dupliqué.** §3 de ce document liste les amendements liants. Aucun agent ne réimplémente en TypeScript ce que le contrat Focal décrit en Swift : il déplace, puis miroite.

---

## 1. L'état réel du chantier — reconnaissance sur le dépôt

La reconnaissance a été menée sur `main` à `ab6c173d` (merge de #3010). Elle contredit l'hypothèse de travail naturelle — « la liste réutilise le code du fil ».

| # | Fait établi | Vérification | Conséquence |
|---|---|---|---|
| F1 | **Aucune ligne de Focal n'est implémentée.** #3010 a mergé 9 fichiers : 4 documents, un renommage CI, un test CI, un fix d'overlay d'effets sans rapport. `apps/ios/Meeshy/Features/Main/Focal/` **n'existe pas** ; `MeeshyFeatureFlags` non plus | `git diff ab6c173d^1 ab6c173d --stat` ; `ls apps/ios/Meeshy/Features/Main/Focal` → absent | La Lentille ne peut pas « réutiliser » le code Focal. Les deux écrans **co-définissent** leur noyau. WS-0 (Focal) et LWS-0 (Lentille) sont **le même lot**, écrit une fois |
| F2 | Le contrat #3010 se déclare explicitement iOS-only : « *Le web et Android sont hors périmètre de ce contrat* » (§ en-tête) | `tasks/focal-implementation-contract.md:5` | Contradiction frontale avec l'objectif d'unification. Levée par §3 ci-dessous |
| F3 | Aucun code Lentille n'existe non plus — le vol. 5 est une spec, pas une implémentation | `grep -ril lentille` sur `apps/`, `packages/` → 0 fichier de code | Les deux écrans partent de zéro **en même temps**. C'est une chance : le noyau se conçoit une fois, pas en rétro-ingénierie |
| F4 | **Le portage TypeScript de l'accent conversationnel n'existe pas**, alors que Swift (`ColorGeneration.swift`) et Kotlin (`sdk-core/theme/DynamicColorGenerator.kt`, `ConversationAccent.kt`) existent | `ls packages/shared/utils/` → pas de `conversation-colors.ts` | Le web est le **seul** frontend aveugle à l'accent. Son portage est un **prérequis** de la peau Lentille web, pas un raffinement |
| F5 | **Aucun mécanisme de vecteurs de test inter-plateformes n'existe.** Les trois miroirs actuels (langue, présence, accent) tiennent par la discipline et une phrase dans `CLAUDE.md` | Aucun `fixtures/*.json` partagé dans le dépôt ; `MeeshyTokenParityTest.kt` teste des tokens, pas des lois | Le mécanisme est introduit par ce workshop (§2.3). C'est ce qui rend la règle « toute évolution touche les 3 sites » **vérifiable** au lieu d'espérée |
| F6 | Le web a **deux** surfaces de liste : `components/conversations/*` (vivante, routée par `app/conversations/[[...id]]/page.tsx` → `ConversationLayout`) et `components/v2/*` (`SplitViewLayout` **routé nulle part**) | `grep -rln SplitViewLayout apps/web/app` → aucun résultat | Le contrat Lentille cible la surface vivante et **interdit** de toucher `components/v2/`. Sans cette borne, un agent « unifie » dans l'arbre mort |
| F7 | Android possède déjà des sections de conversation — mais un jeu **différent** : `PINNED / CATEGORY / ALL`, sans section temporelle ni EN DIRECT | `apps/android/.../ConversationSections.kt:10` | La loi de sectionnement est une **troisième** divergence à unifier, pas seulement iOS↔web |
| F8 | Android n'a **aucun** miroir du résolveur d'aperçu du Prisme. `ConversationPreviewMessages.kt` documente la règle en commentaire et la ré-applique localement | `grep -rln resolveUserLanguage apps/android --include=*.kt` → aucun site de liste | Le Prisme est déjà à 2,5 sites sur 3. La loi partagée le referme |
| F9 | La liste iOS est un `LazyVStack(spacing: 8)` de `SectionHeaderView` **non épinglés**, avec repli/dépli (`expandedSections`), `SectionDropDelegate` et `SectionFrameRegistry` accrochés à cette structure | `ConversationListView.swift:358, 380, 405, 441` | Les stickers *sticky* du vol. 5 exigent `Section {} header: {}` + `pinnedViews:` — une **restructuration**, pas un remplacement de vue. C'est le point le plus risqué du lot iOS (détaillé dans le contrat Lentille, écart E5) |
| F10 | Les deux rangs (`ThemedConversationRow`, `ConversationRowItem`) partagent le portillon `renderFingerprint`, défini **dans le SDK** (`CoreModels.swift:281`) | `grep -rn renderFingerprint packages/MeeshySDK` | Étendre le portillon au pont ✦ touche un **package** hors `apps/`. Le contrat #3010 n'a pas de propriétaire SDK ; ce workshop en crée un (§4, lot L0) |

> **La conséquence de F1 vaut d'être dite en clair** : le plan naturel — « d'abord le fil (#3010), puis la liste » — est le mauvais ordre. Il ferait écrire deux fois la courbe de perspective, deux fois la loi de pilule, deux fois l'orchestrateur, dans deux langages, avec deux jeux de constantes. L'ordre correct est : **le noyau d'abord, les deux peaux ensuite, en parallèle**.

---

## 2. L'unification — comment trois frontends tiennent le même contrat

### 2.1 Le principe

> Une loi a **un domicile** et des **miroirs**. Le domicile est TypeScript dans `packages/shared/`. Les miroirs sont Swift et Kotlin. Aucun miroir n'a le droit de contenir une constante qui n'est pas dans le domicile.

Ce n'est pas une nouveauté d'architecture : `CLAUDE.md` l'impose déjà pour la résolution de langue (« *Source de vérité : `resolveUserLanguage()`* »), pour la présence (« *toute évolution touche les 3 sites* ») et pour l'accent conversationnel. Ce workshop **applique** la règle existante à un domaine qui allait y échapper, et lui donne enfin un moyen de contrôle (§2.3).

### 2.2 Les lois, leur domicile et leurs miroirs

| Loi | Domicile (nouveau sauf mention) | Miroir Swift | Miroir Kotlin | Consommée par |
|---|---|---|---|---|
| `resolveOrchestratorDecision` — seuils ≤ 25 / > 25 / absence > 24 h ∧ ≥ 10 / choix collant | `packages/shared/utils/reading-modes.ts` | `ReadingModeOrchestrator` | `ReadingModeOrchestrator.kt` | **Liste** (chip, encoche) + **fil** (ouverture) |
| `resolveReadingModeAvailability` — catalogue, capacités invité/inscrit, éligibilité Rivière (≥ 5 actifs, jamais en DM) | idem | `ReadingModeCatalog`, `ConversationCapabilitySet` | idem | Menu de mode (3 points d'entrée) + feuille Lentille |
| `focusCurve` — **paramétrée**, deux jeux de constantes : `.thread` (d/380, 1−0.40f, 1−0.82f) et `.list` (d/520, 1−0.45f, 1−0.04f, sous-focus d/160 plafonné −0.35) | `packages/shared/utils/focus-curve.ts` | `FocalFocusCurve` | `FocusCurve.kt` | Passe de défilement des **deux** écrans |
| `electFocusRow` — hystérésis, bande de focus | idem | `FocalFocusElector` | idem | idem |
| `scrollActivityLaw` — visible au premier événement, effacée 900 ms après l'arrêt, **jamais à l'ouverture** | `packages/shared/utils/scroll-activity.ts` | `ScrollTimePillLaw` | `ScrollActivityLaw.kt` | Pilule jour·heure (fil) **et** pilule de section (liste) — une loi, deux libellés |
| `resolveConversationSections` — Épinglées → En direct → catégories utilisateur (ordre déclaré) → Aujourd'hui / Hier / Cette semaine / Plus ancien | `packages/shared/utils/conversation-sections.ts` | `LentilleSectionResolver` | remplace `ConversationSections.kt` (F7) | Liste, 3 plateformes |
| `sortConversations` — épinglées → live → catégorie → `lastMessageAt` desc (**jamais** `lastMessage.createdAt`) | idem | consommé par `ConversationListViewModel` | consommé par `ConversationListViewModel.kt` | Liste, 3 plateformes |
| `buildDeterministicBridge` — auteurs (2 max + « +N ») · volume · types de médias, **en données, pas en phrase** (§5 du contrat Lentille) | `packages/shared/utils/conversation-bridge.ts` | `ConversationBridgeFormatter` | idem | Gateway (fallback) **et** clients (rendu i18n) |
| `resolveLastMessagePreview` — **existe déjà** | `packages/shared/utils/conversation-helpers.ts:187` | `resolvedLastMessagePreview` (`CoreModels.swift:247`) | **manquant** (F8) — à créer | Ligne 2 du rang, 3 plateformes |
| `conversationAccent` — `blend(langue×0.30, type×0.30, thème×0.40)` + décalages ±30° | **`packages/shared/utils/conversation-colors.ts` — manquant** (F4) | `ColorGeneration.swift` (existe) | `DynamicColorGenerator.kt` (existe) | Anneau d'avatar, ring de focus card, teinte du pont |
| `getUserPresenceStatus` — 1/3/5 — **existe déjà** | `packages/shared/utils/user-presence.ts` | `UserPresence.state(now:)` | `Presence.kt` | Dot de présence du rang |

### 2.3 Le mécanisme qui rend les miroirs vérifiables — les vecteurs partagés

Aujourd'hui, rien n'empêche un miroir de dériver : la règle « touche les 3 sites » est une phrase dans un fichier Markdown. Ce workshop introduit le contrôle qui manquait.

```
packages/shared/fixtures/reading-modes/
├── orchestrator.vectors.json      # {input, expected} × branches de la règle
├── focus-curve.vectors.json       # {distance, variant} → {scale, alpha} à 1e-4
├── scroll-activity.vectors.json   # séquences d'événements horodatées → visibilité
├── sections.vectors.json          # conversations → sections ordonnées
├── sort.vectors.json              # conversations → ordre attendu
├── bridge.vectors.json            # messages → données de pont
└── accent.vectors.json            # (nom, type, langue, thème) → hex primary/secondary/accent
```

**Un fichier, trois lecteurs.** Chaque plateforme lit le **même** JSON dans **sa** suite de tests :

| Plateforme | Suite | Accès au fichier |
|---|---|---|
| shared / web | Jest — `packages/shared/__tests__/vectors/*.test.ts` | import direct |
| iOS | XCTest — `apps/ios/MeeshyTests/Unit/Vectors/*.swift` | ressource de bundle copiée par XcodeGen depuis `packages/shared/fixtures/` |
| Android | JUnit — `apps/android/sdk-core/src/test/.../vectors/` | ressource de test symlinkée par Gradle |

**Trois règles dures sur les vecteurs.**

1. Un vecteur ne se **modifie** jamais pour faire passer un test. Il se modifie quand la **loi** change — et alors les trois suites rougissent ensemble, ce qui est exactement l'effet recherché.
2. Un fichier de vecteurs vide, ou une suite qui charge **zéro** cas, doit **échouer**. Le vert silencieux d'un harnais débranché est le mode de panne le plus coûteux du dépôt (cf. leçon 257 : une capacité câblée de bout en bout et jamais montée, que rien ne pouvait faire rougir).
3. Les flottants se comparent à 1e-4. Une courbe qui diverge au cinquième chiffre est identique à l'œil et identique en intention ; une tolérance plus lâche laisserait passer une constante fausse.

### 2.4 Ce que l'unification **ne** signifie **pas**

- **Pas de moteur de rendu partagé.** SwiftUI reste SwiftUI, React reste React, Compose reste Compose. Ce sont les **lois** qui convergent, pas les vues.
- **Pas de gel des idiomes de plateforme.** Le long press iOS garde ses deux chemins OS ; le web garde clic droit + appui long pointeur ; Android garde son `combinedClickable`. La spec vol. 5 §5.3/§6.2 le dit déjà — ce workshop ne l'élargit pas.
- **Pas d'alignement pixel entre plateformes.** Les cotes du vol. 5 (rang 64, avatar 44, nom 15) sont un **design commun**, appliqué avec l'échelle de chaque OS (`MeeshyFont.relative` côté iOS suit Dynamic Type ; `rem`/`clamp` côté web ; `sp` côté Compose). Le critère est « même hiérarchie », pas « même nombre de pixels ».

---

## 3. Amendements liants au contrat #3010

Le contrat `tasks/focal-implementation-contract.md` reste la référence d'exécution du fil. Les amendements suivants s'y appliquent, dans cet ordre de priorité sur son texte d'origine.

| A | Ce que dit #3010 | Amendement | Motif |
|---|---|---|---|
| **A1** | « Portée : iOS uniquement. Le web et Android sont hors périmètre » (§ en-tête) | La portée devient **iOS d'abord, web et Android en suivant**, sur le même noyau. Les cotes et gestes restent iOS-spécifiques ; les **lois** ne le sont plus | F2 vs objectif d'unification |
| **A2** | WS-0 publie 14 fichiers de lois en Swift sous `Focal/Core/` | WS-0 est **scindé** : les lois pures partent en TypeScript (lot **L0**, §2.2) ; `Focal/Core/*.swift` devient un jeu de **miroirs** adossés aux vecteurs partagés. Les fichiers *non-lois* de `Focal/Core` (`FocalRowInput`, `ComposerRichTextContracts`, `LivingSummaryModels`) restent Swift, purement iOS | Sans cela, l'unification est impossible (§2.1) |
| **A3** | `FocalFocusCurve` porte les constantes du fil en dur | La courbe devient **paramétrée par variante** (`.thread` / `.list`). Une seule forme, deux jeux de constantes, un seul fichier de vecteurs | La liste et le fil ont la même courbe à des constantes près (vol. 4 §3 vs vol. 5 §3) |
| **A4** | `ScrollTimePillLaw` est décrite comme propre au fil (WS-2) | La loi devient `scrollActivityLaw`, partagée. Le fil en tire « Mercredi · 17:42 », la liste en tire « Aujourd'hui ». Les 900 ms sont **une** constante | Vol. 5 §3 exige explicitement « identique au Focal » |
| **A5** | `ReadingModePreferenceStore` persiste le mode en `UserDefaults` local, clé `(scope, conversationId)` | La préférence devient **serveur et multi-appareils**, portée par `UserConversationPreferences` (le canal versionné de pin/mute). Le store local devient un **cache optimiste** devant ce canal, pas la source de vérité | Vol. 5 §4 exige la synchronisation multi-appareils ; sans elle, l'encoche ment sur le second appareil |
| **A6** | WS-7 : l'orchestrateur décide dans `ConversationView.init` | Inchangé **pour le fil**. S'y **ajoute** une décision côté liste, alimentée par `bridge.suggestedMode` — précalculée serveur, jamais recalculée à l'affichage du rang | La liste doit annoncer la décision **avant** le tap (vol. 5 §4) ; recalculer par rang à chaque frame de défilement est hors budget |
| **A7** | §1.2 : tableau des propriétaires, uniquement des fichiers de `apps/ios/` | Le tableau accueille un **propriétaire SDK** et un **propriétaire shared**. `CoreModels.swift` (`renderFingerprint`) est possédé par le lot L0 | F10 : le portillon de re-render vit dans un package, pas dans l'app |
| **A8** | WS-10 : surfaces agent stubées, `assist:*` inexistant | Inchangé côté fil. Le **pont ✦ de la liste** ne dépend pas de `assist:*` : son étage déterministe est calculé par la **gateway** (lot L1) et livré à tous les clients. L'enrichissement agent reste derrière le même protocole nul | Le pont est le cœur du vol. 5 ; le suspendre à une API inexistante viderait la Lentille de sa raison d'être |

> Les amendements **ne réécrivent pas** les onze écarts du §0 de #3010 (géométrie inversée, anchorPoint, `UICellConfigurationState`, `ConversationViewModel` intouchable, `MessageDayStickyOverlay` intouchable, …). Ces écarts sont des faits sur le code iOS ; ils restent valides mot pour mot.

---

## 4. La carte du chantier — cinq lots

```
L0  NOYAU PARTAGÉ ······ packages/shared + miroirs Swift/Kotlin + vecteurs
     │                    (lois, types, accent TS, renderFingerprint étendu)
     ├──────────────┬──────────────┬──────────────┐
     ▼              ▼              ▼              ▼
L1  GATEWAY       L2  iOS        L3  WEB        L4  ANDROID
    pont ✦          Lentille       Lentille       Lentille + Focal
    préférence      + Focal        + Focal        (dernier)
    de mode         (#3010)        (portage)
     │              │              │              │
     └──────────────┴──────────────┴──────────────┘
                            ▼
                   L5  RECETTE CROISÉE
                   (vecteurs verts × 3, matrices, a11y, perf)
```

| Lot | Périmètre | Contrat d'exécution | Peut démarrer quand |
|---|---|---|---|
| **L0** | Lois TS + vecteurs + miroirs Swift/Kotlin + `conversation-colors.ts` + extension `renderFingerprint` | `lentille-implementation-contract.md` §2, LWS-0 → LWS-2 | immédiatement |
| **L1** | Gateway : champ `bridge` sur `GET /conversations` et `conversation:unread-updated` ; `readingMode` sur `UserConversationPreferences` ; fallback déterministe | idem, LWS-3 → LWS-4 | dès que les **types** de L0 sont figés (pas besoin des miroirs) |
| **L2** | iOS : peau Lentille (liste) + Focal (fil), derrière deux drapeaux distincts | `lentille-…` LWS-5 → LWS-8 **et** `focal-…` WS-1 → WS-11 amendés | dès que le miroir Swift de L0 est mergé |
| **L3** | Web : peau Lentille + Focal, derrière un drapeau | `lentille-…` LWS-9 → LWS-11 | dès que L0 est mergé (le web consomme le domicile **directement**, sans miroir) |
| **L4** | Android : peau Lentille + Focal | `lentille-…` LWS-12 | après L2 — Android suit iOS par convention de parité (`tasks/android-parity-ios-debt-agent-prompt.md`) |
| **L5** | Recette croisée : vecteurs verts sur 3 plateformes, matrices de couverture, a11y, perf | `lentille-…` §7 + `focal-…` WS-11 | en continu ; **bloquant** pour la fermeture |

### 4.1 Propriété des fichiers — la règle d'or élargie

#3010 impose : *un fichier, un propriétaire ; deux workstreams ne modifient jamais le même fichier*. Le workshop l'étend au **cross-package** :

- `packages/shared/**` → **L0 uniquement**. Un agent iOS qui veut changer un seuil ouvre une demande d'extension de contrat ; il ne l'édite pas.
- `packages/MeeshySDK/**` → **L0 uniquement** (via son sous-lot SDK). En particulier `CoreModels.swift`.
- `services/gateway/**` → **L1 uniquement**.
- `apps/ios/**` → **L2**. `apps/web/**` → **L3**. `apps/android/**` → **L4**.
- `packages/shared/fixtures/**` → **L0** écrit, tout le monde **lit**. Un lot qui a besoin d'un vecteur nouveau le **demande** à L0.

**Fichiers explicitement interdits** (au-delà de ceux de #3010 §1.2) :

| Fichier / arbre | Statut | Motif |
|---|---|---|
| `apps/web/components/v2/**` | **interdit** | Arbre mort, non routé (F6). Y porter la Lentille produit du code invisible |
| `apps/ios/.../Bubble/BubbleStandardLayout.swift` | **interdit** | Déjà gelé par #3010 §1.2 — le rendu bulle reste bit-à-bit identique hors drapeau |
| `apps/ios/.../ViewModels/ConversationViewModel.swift` | **interdit** | Déjà gelé par #3010 §1.2 (écart #5) |
| `apps/ios/.../MessageDayStickyOverlay.swift` | **interdit** | Déjà gelé par #3010 §1.2 (écart #7) |
| `packages/shared/utils/conversation-helpers.ts` → `resolveLastMessagePreview` | **lecture seule** | Source de vérité du Prisme. La Lentille la **consomme**, ne la réécrit pas |
| `packages/shared/utils/user-presence.ts` | **lecture seule** | Idem, présence 1/3/5 |

---

## 5. Séquencement — l'ordre qui évite d'écrire deux fois

```
Semaine-lot 1 ── L0.a  lois TS + vecteurs (orchestrateur, courbe, pilule, sections, tri)
                 L0.b  conversation-colors.ts (débloque L3)
                 L1.a  types du pont + préférence readingMode (schéma Prisma + route)
                        └─ L0.a et L1.a sont parallèles : L1 code contre les TYPES, pas les lois

Semaine-lot 2 ── L0.c  miroirs Swift + suite de vecteurs iOS
                 L0.d  miroirs Kotlin + suite de vecteurs Android
                 L1.b  fallback déterministe du pont + enrichissement des payloads
                 L3.a  web — peau Lentille (rang plat, stickers, perspective) derrière drapeau

Semaine-lot 3 ── L2.a  iOS — peau Lentille (LWS-5 → LWS-8)
                 L2.b  iOS — Focal (WS-1 → WS-6 de #3010, amendés)
                        └─ L2.a et L2.b sont DISJOINTS en fichiers : liste vs fil
                 L3.b  web — Focal (fil)

Semaine-lot 4 ── L2.c  iOS — coquille : encoche actionnable, menu de mode, aperçu (WS-7)
                 L3.c  web — menu de mode + aperçu
                 L4    Android — les deux peaux, sur des lois déjà vertes

Semaine-lot 5 ── L5    recette croisée, perf, a11y, levée progressive des drapeaux
```

**Les deux points de synchronisation durs.**

- **S1 — après L0.a** : les lois et les vecteurs sont figés. Tout lot qui code une constante après S1 est en violation de contrat. Un seuil qui doit bouger repasse par L0, et les trois plateformes rougissent ensemble.
- **S2 — après L1.b** : le contrat du pont ✦ est figé (forme *et* sémantique de langue, cf. contrat Lentille §5). Les trois peaux peuvent l'afficher. Avant S2, elles affichent le préview résolu du Prisme, ce qui est le comportement de repli permanent — jamais un écran vide.

**Ce qui peut se paralléliser sans risque** : L2.a ⊥ L2.b (fichiers disjoints : `ConversationListView*` vs `MessageListView*`), L3 ⊥ L2 (langages disjoints), L1 ⊥ tout (service disjoint). **Ce qui ne le peut pas** : deux agents sur `ConversationListView.swift`, deux agents sur `packages/shared/utils/`.

**Worktrees** (convention `CLAUDE.md` § Parallel Worktree Strategy) :

```bash
git worktree add ../v2_meeshy-lentille-core   -b feat/lentille-core   claude/lentille-conversations-view-8silmf
git worktree add ../v2_meeshy-lentille-gw     -b feat/lentille-gateway claude/lentille-conversations-view-8silmf
git worktree add ../v2_meeshy-lentille-ios    -b feat/lentille-ios    claude/lentille-conversations-view-8silmf
git worktree add ../v2_meeshy-lentille-web    -b feat/lentille-web    claude/lentille-conversations-view-8silmf
```

Ordre de merge : **core → gateway → web → iOS → android**. `project.pbxproj` est géré par le **dernier** worktree iOS à merger, jamais édité à la main (XcodeGen globe récursivement, `project.yml:146`).

---

## 6. Portes de qualité

| Porte | Commande | Bloque |
|---|---|---|
| Lois TS | `cd packages/shared && bun test` | tout lot |
| Vecteurs web/shared | `bun test -- vectors` — échoue si **zéro** cas chargé | S1 |
| Gateway | `cd services/gateway && bun run test:coverage` (249 suites, lignes ~62,9 % sous bun) | L1 |
| Web | `cd apps/web && bun test` + `bun run build` | L3 |
| iOS | `./apps/ios/meeshy.sh test` — **fait foi en CI macOS** ; `xcodebuild` n'existe pas sous Linux | L2 |
| Android | `./gradlew test` | L4 |
| Parité des miroirs | les trois suites de vecteurs vertes sur le **même** commit de `fixtures/` | fermeture |

> **Prérequis de parité locale bun** (`CLAUDE.md`) : `cd packages/shared && npx prisma generate --generator client` puis `bun run build`, sans quoi ~17 suites gateway échouent pour des raisons sans rapport avec ce chantier.

**Réversibilité — trois drapeaux, indépendants.**

| Drapeau | Portée | Défaut | Off ⇒ |
|---|---|---|---|
| `reading_modes` (#3010) | fil | OFF | rendu bulle historique, bit-à-bit identique |
| `lentille_list` | liste | OFF | `ThemedConversationRow` (iOS) / `ConversationItem` (web) inchangés |
| `agent_grammar` (#3010 WS-10) | grammaire ✦ | OFF | l'agent rend comme un humain — activation soumise à décision produit écrite |

Les drapeaux sont **indépendants** : la Lentille sans Focal est un état livrable (la liste annonce une décision que le fil applique aujourd'hui en bulles), et l'inverse aussi.

---

## 7. Hors périmètre — dit une fois, pour ne pas y revenir

- **La Scène** (couche live d'appel). La liste **affiche** son existence (section EN DIRECT, « n voix · depuis X », bouton Rejoindre) ; elle ne l'implémente pas. Chantier séparé.
- **La Rivière.** Présente dans le catalogue et le menu de mode, **toujours grisée avec sa raison réelle** (« s'ouvrira à 5 personnes actives — 3 aujourd'hui »). Elle n'entre que si elle gagne son procès (vol. 3).
- **L'API Agent** (`assist:*`, rôle `observer`, `POST /conversations/:id/agents`). Zéro occurrence dans le dépôt (#3010 écart #10). Le pont ✦ vit sans elle, par son étage déterministe.
- **Le Résumé Vivant côté liste.** La liste **annonce** la décision « Résumé Vivant » ; l'écran de résumé est livré par WS-8/WS-9 de #3010, pas par la Lentille.
- **La refonte du pipeline de données.** ViewModels, cache, delta-sync, temps réel, gestes : **conservés à l'identique** sur les trois plateformes. La Lentille est une peau (vol. 5 §5.1, §6.1). Toute envie d'« améliorer au passage » est hors contrat.

---

## 8. La définition de « fini »

Le chantier ferme quand, et seulement quand :

1. Les sept fichiers de vecteurs sont verts dans **trois** suites (Jest, XCTest, JUnit), sur le même commit de `packages/shared/fixtures/`.
2. Les treize critères de recette du vol. 5 (§7, R1 → R13) passent sur iOS **et** web — Android suit sur son propre calendrier, avec la même grille.
3. La matrice de couverture §5.3 du vol. 5 (28 lignes : typing, brouillons, kinds, pièces jointes, localisation, épingle, mute, verrou, outbox, mood, sélection iPad, long press, appel, ticker, VoiceOver, pagination, branches vides…) se comporte **à l'identique** de l'existant, drapeau on.
4. La matrice §5 du vol. 4 (16 lignes temps réel du fil) idem, en Focal **et** en Script.
5. Drapeaux éteints ⇒ les trois apps sont **bit-à-bit identiques** à aujourd'hui (test de snapshot par plateforme).
6. Budget de défilement tenu sur les deux écrans : < 1 ms/frame, zéro allocation dans la passe, aucune invalidation de layout — **mesuré** aux Instruments et au profiler navigateur, pas déduit.

Une régression silencieuse vaut mieux qu'un joli effet : si un des six points est rouge, le chantier n'est pas fini, quel que soit l'état visuel.
