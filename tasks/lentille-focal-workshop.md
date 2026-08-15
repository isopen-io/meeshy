# Workshop — Lentille × Focal : un seul chantier, deux écrans, trois frontends

> **Statut** : contrat d'orchestration. C'est le document qui *séquence* ; les contrats d'exécution sont `tasks/focal-implementation-contract.md` (le fil) et `tasks/lentille-implementation-contract.md` (la liste).
> **Branche** : `claude/lentille-conversations-view-8silmf`.
> **Sources normatives** : `docs/design/2026-08-14-conversation-views-brainstorm.html` (vol. 1), `2026-08-15-conversation-modes-use-cases.html` (vol. 2), `2026-08-15-conversation-modes-verdict.html` (vol. 3), `2026-08-15-focal-spec-integration.html` (vol. 4), `2026-08-15-conversation-list-lentille.html` (vol. 5).
> **Maquettes de référence** (font foi sur les **cotes** ; les documents font foi sur les **règles**) : `la-lentille.html` — https://claude.ai/code/artifact/d068fe38-e4ab-4b11-aa9c-f9c0585aef33 · `focal-grandeur-nature.html` — https://claude.ai/code/artifact/83621c34-e472-4b2e-be75-0a06dbebc2ad. Relevées et confirmées : les constantes des deux écrans (§2.2) sont exactement celles de leur CSS. Cotes détaillées en §4.3 du contrat Lentille.
> **Portée** : les **deux** écrans (liste des conversations + fil de messages), plus gateway et `packages/shared`.
> **Priorité produit** : **iOS d'abord, web ensuite, et rien d'autre avant.** Android est une **phase 2**, ouverte seulement quand la phase 1 est close (§5). Le noyau partagé est conçu pour trois frontends — il n'en sert que deux tant que la phase 1 dure.

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

> **Les miroirs Kotlin ne sont pas écrits en phase 1.** Le domicile TypeScript et le miroir Swift suffisent à servir web et iOS. Écrire le miroir Kotlin maintenant reviendrait à le maintenir à travers chaque ajustement d'un cœur que deux frontends n'ont pas encore éprouvé — un coût récurrent pour une plateforme qui n'en tire rien avant des semaines. La colonne « Miroir Kotlin » ci-dessous est donc la **cible de la phase 2**, pas une livraison de la phase 1.

| Loi | Domicile (nouveau sauf mention) | Miroir Swift — **phase 1** | Miroir Kotlin — **phase 2** | Consommée par |
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

| Plateforme | Suite | Accès au fichier | Phase |
|---|---|---|---|
| shared / web | Jest — `packages/shared/__tests__/vectors/*.test.ts` | import direct | **1** |
| iOS | XCTest — `apps/ios/MeeshyTests/Unit/Vectors/*.swift` | ressource de bundle copiée par XcodeGen depuis `packages/shared/fixtures/` | **1** |
| Android | JUnit — `apps/android/sdk-core/src/test/.../vectors/` | ressource de test symlinkée par Gradle | **2** |

En phase 1, « les vecteurs sont verts » signifie **deux** suites, pas trois. La troisième rejoint en phase 2 — et c'est précisément ce que les vecteurs rendent possible sans douleur : Android arrivera sur un cœur figé, prouvé, et sa conformité se vérifiera en exécutant des fichiers qui existent déjà.

**Trois règles dures sur les vecteurs.**

1. Un vecteur ne se **modifie** jamais pour faire passer un test. Il se modifie quand la **loi** change — et alors les trois suites rougissent ensemble, ce qui est exactement l'effet recherché.
2. Un fichier de vecteurs vide, ou une suite qui charge **zéro** cas, doit **échouer**. Le vert silencieux d'un harnais débranché est le mode de panne le plus coûteux du dépôt (cf. leçon 257 : une capacité câblée de bout en bout et jamais montée, que rien ne pouvait faire rougir).
3. Les flottants se comparent à 1e-4. Une courbe qui diverge au cinquième chiffre est identique à l'œil et identique en intention ; une tolérance plus lâche laisserait passer une constante fausse.

### 2.4 La fidélité entre frontends — l'exigence, et ce qu'elle recouvre

> **Exigence produit** : les trois frontends doivent être fidèles **visuellement et comportementalement**. Le web sur téléphone ne doit plus se distinguer d'iOS, et Android suivra à l'identique.

Cette exigence porte sur trois plans, et chacun a son moyen de preuve. Elle **n'est pas** une invitation à partager un moteur de rendu : SwiftUI reste SwiftUI, React reste React, Compose reste Compose, et les idiomes d'interaction propres à chaque OS sont conservés (long press à deux chemins sur iOS, clic droit + appui long pointeur sur le web, `combinedClickable` sur Android). Ce qui converge, ce sont les **valeurs**, les **règles** et les **états**.

| Plan | Ce qui doit être identique | Ce qui reste propre à la plateforme | Preuve |
|---|---|---|---|
| **Cotes** | Chaque nombre : rang 64, avatar 44, anneau 1,5, point 8, nom 15, heure 12, ligne 2 13, opacité sourdine 0,55, ring interne 1,5, sticker 10,5/800/.1em… (§4.3 du contrat Lentille) | L'**unité** et la mise à l'échelle accessible : `MeeshyFont.relative` → Dynamic Type ; `rem`/`clamp` → réglage navigateur ; `sp` → police système Android | Fichier de tokens partagé + **test de conformité d'anatomie** par plateforme (§2.5) |
| **Comportement** | Chaque règle et chaque transition d'état : quand le pont apparaît, quand la pilule s'efface, quel rang gagne le focus, dans quel ordre les sections tombent, quelle ligne 2 l'emporte (typing > brouillon > pont > préview) | Le **geste** qui déclenche, et lui seul | Vecteurs partagés (§2.3) + **matrice de conformité comportementale** (§2.5) |
| **Rendu** | La hiérarchie perçue : même chose au premier coup d'œil, mêmes états visibles, mêmes absences (aucun badge chiffré, aucun dot hors ligne, aucune carte hors focus) | Le sous-pixel, l'anticrénelage, la courbe d'animation native | Recette visuelle sur la **même planche de 25 cas** que la maquette, rejouée sur les trois (§6.3) |

**Sur la mise à l'échelle accessible.** Un utilisateur en Dynamic Type XL sur iOS et un utilisateur en zoom 200 % sur le web ne verront pas le même nombre de pixels — c'est le comportement correct, et l'exiger identique casserait l'accessibilité. La fidélité porte sur la valeur **au réglage par défaut** : à 100 %, les trois rendent 64, 44, 15, 12. C'est cette valeur-là qui est testée.

### 2.5 Les trois mécanismes de fidélité

Le dépôt a déjà inventé le bon patron, et il est meilleur que tout ce qu'on écrirait de neuf. `apps/android/sdk-ui/src/test/.../MeeshyTokenParityTest.kt` le formule ainsi :

> *« Non-regression contract: every design token must stay byte-identical to the iOS source of truth… If a palette or dimen drifts, this test fails. **Never "fix" the test by copying the drifted value; fix the token.** »*

Les trois mécanismes ci-dessous étendent ce patron des couleurs vers les cotes, les comportements et les états.

**① Tokens de cotes partagés.** `packages/shared/design/lentille-tokens.json` devient le domicile de tous les nombres de §4.3. Trois consommateurs (`LentilleMetrics.swift`, tokens CSS, `LentilleDimens.kt`), trois tests de parité sur le modèle de `MeeshyTokenParityTest`. Le web est le seul à lire le JSON directement ; iOS et Android le mirroir et le **prouvent**.

**② Test de conformité d'anatomie.** Comparer des captures d'écran entre trois OS n'est ni stable ni utile en CI. À la place, chaque plateforme **interroge son propre rendu** et compare aux tokens : hauteur de rang, taille d'avatar, épaisseur d'anneau, tailles de police résolues, opacités appliquées. C'est testable sans image, ça tourne en CI, et ça attrape exactement ce qu'une capture attraperait — une cote qui a dérivé.

**③ Matrice de conformité comportementale.** Les 28 lignes de la matrice vol. 5 §5.3 et les 16 lignes de vol. 4 §5 deviennent un fichier **identifié** : `packages/shared/fixtures/conformance/behaviour-matrix.json`, une ligne = un `id` + son comportement attendu. Chaque plateforme référence les `id` dans ses tests, et une garde **échoue si un `id` n'est couvert par aucun test**. C'est ce qui transforme « on a tout testé » en une affirmation vérifiable plutôt qu'en une intention — et c'est directement la leçon 257 du dépôt : une garde d'ensemble (déclarés == couverts) attrape le membre ajouté demain et oublié, là où une garde de présence individuelle ne le voit pas.

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
| **A8** | WS-10 : surfaces agent stubées, `assist:*` inexistant, provider **nul** par défaut | Inchangé côté fil. Le **pont ✦ de la liste** ne dépend pas de `assist:*` : son étage déterministe est calculé par la **gateway** (lot L1) et livré à tous les clients. **Le provider nul cesse d'être l'horizon** : `services/agent` fournit déjà le résumé, l'attachement par conversation et le transport (§4.3) — l'étage agent est un chemin **réel**, au reste-à-faire court et énumérable | Le pont est le cœur du vol. 5 ; le suspendre à une API inexistante l'aurait vidé de sa raison d'être. Mais l'inventaire réel montre que l'API « inexistante » était surtout un **nom d'événement** absent, pas une capacité absente |

> Les amendements **ne réécrivent pas** les onze écarts du §0 de #3010 (géométrie inversée, anchorPoint, `UICellConfigurationState`, `ConversationViewModel` intouchable, `MessageDayStickyOverlay` intouchable, …). Ces écarts sont des faits sur le code iOS ; ils restent valides mot pour mot.

---

## 4. La carte du chantier — les lots

```
╔═ PHASE 1 ═══════════════════════════════════════════════════════════╗
║                                                                     ║
║ L0  NOYAU PARTAGÉ ····· packages/shared + miroir SWIFT + vecteurs   ║
║      │                  + tokens (PAS de Kotlin — cf. §2.2)         ║
║      ▼                                                              ║
║ LM  SUBSTITUTION ······ providers mockés (pont ✦, préférence, appel) ║
║      │                  — MÊME protocole que le futur backend       ║
║      ▼                                                              ║
║ L2  iOS ··············· Lentille + Focal                            ║
║      ▼                  ▸ PORTE V1 — recette iOS INTÉGRALE          ║
║ L3  WEB ··············· Lentille + Focal, dormant sur main          ║
║      ▼                  ▸ PORTE V2 — recette web + parité ↔ iOS     ║
║ L1  GATEWAY+AGENT ····· pont déterministe, readingMode, appel,      ║
║      ▼                  puis étage agent NON ÉCRIVANT (§4.3)        ║
║      ▼                                                              ║
║ L5  RECETTE CROISÉE iOS+web, puis ACTIVATION                        ║
║                                                                     ║
╚═════════════════════════ clôture de phase 1 ════════════════════════╝
                                  ▼
╔═ PHASE 2 ═══════════════════════════════════════════════════════════╗
║ L0b  miroirs KOTLIN + vecteurs JUnit   →   L4  ANDROID              ║
║      (sur un cœur figé et déjà prouvé par deux frontends)           ║
╚═════════════════════════════════════════════════════════════════════╝
```

| Lot | Ph. | Périmètre | Contrat d'exécution | Peut démarrer quand |
|---|---|---|---|---|
| **L0** | 1 | Lois TS + vecteurs + **tokens de cotes** + miroir **Swift seul** + `conversation-colors.ts` + extension `renderFingerprint` | `lentille-implementation-contract.md` §2, LWS-0 → LWS-2 | immédiatement |
| **LM** | 1 | Providers de substitution derrière le protocole définitif (§4.2) | idem, LWS-2bis | dès que les **types** de L0 sont figés |
| **L2** | 1 | **iOS** : peau Lentille (liste) + Focal (fil), derrière deux drapeaux distincts | `lentille-…` LWS-5 → LWS-8 **et** `focal-…` WS-1 → WS-11 amendés | dès que le miroir Swift de L0 est mergé |
| **L3** | 1 | **Web** : peau Lentille + Focal, derrière un drapeau, **déployable dormant sur `main`** (§6.2) | `lentille-…` LWS-9 → LWS-11 | **après la porte V1** — le web ne démarre pas avant qu'iOS soit intégralement vert |
| **L1** | 1 | **Gateway + agent** : champ `bridge` réel, `readingMode` serveur, payload d'appel live, puis l'étage agent du pont (§4.3) | idem, LWS-3 → LWS-4 | après la porte V2 |
| **L5** | 1 | Recette croisée iOS + web, puis activation progressive | `lentille-…` §7 + `focal-…` WS-11 | **bloquant** pour l'activation et pour la clôture de phase 1 |
| **L0b** | **2** | Miroirs **Kotlin** + suite de vecteurs JUnit + `LentilleDimens` | `lentille-…` LWS-12 | **après clôture de la phase 1** |
| **L4** | **2** | **Android** : peau Lentille + Focal | idem | après L0b — sur un cœur figé, prouvé par deux frontends et servi par un vrai backend |

> **Android n'est pas un lot parallèle qu'on retarde — c'est une phase distincte.** Aucun agent n'ouvre `apps/android/**` tant que la phase 1 n'est pas close. Un lot Android mené en parallèle paierait chaque ajustement du noyau trois fois au lieu de deux, et diluerait l'attention sur les deux frontends qui, eux, sont sur le chemin critique. Quand la phase 2 s'ouvre, elle démarre dans les meilleures conditions possibles : lois figées, vecteurs écrits, tokens arrêtés, backend réel, et deux implémentations de référence à imiter. La convention de parité du dépôt (`tasks/android-parity-ios-debt-agent-prompt.md`) s'applique alors normalement.

### 4.2 Inventaire du backend — ce qui en a besoin, et son substitut

> **Exigence produit** : toute fonctionnalité qui demande une retouche backend est **signalée**, et **faite en dernier** ; en attendant, elle est **mockée** derrière le protocole définitif.

Trois surfaces seulement demandent la gateway. Elles sont isolées ici pour que rien d'autre n'attende.

| Surface | Retouche backend requise | Substitut pendant l'attente | Le substitut est-il honnête ? |
|---|---|---|---|
| **Pont ✦** (ligne 2 des rangs non lus) | `bridge` dans le mapping de `GET /conversations` et dans `conversation:unread-updated` — **LWS-4** | `LocalBridgeProvider` : le client exécute `buildBridgeData` (la **même** loi partagée, LWS-1) sur les messages qu'il a déjà en cache | **Oui** — c'est la même loi sur moins de données. Le provider marque `isComplete: false` quand sa fenêtre ne couvre pas tout l'intervalle non lu, et l'UI dit alors « sur les N derniers messages ». Aucun chiffre extrapolé, aucune phrase fabriquée — la contrainte d'honnêteté de #3010 WS-8, appliquée telle quelle |
| **Préférence de mode** (encoche actionnable, multi-appareils) | `readingMode` sur `UserConversationPreferences` + route + broadcast — **LWS-3** | Le store local de #3010 WS-1 (`UserDefaults` iOS / store web), clé `(scope, conversationId)` | **Oui, avec une limite affichée** — le mode est mémorisé **par appareil**, pas encore synchronisé. C'est exactement l'amendement A5 en deux temps : le store local n'est pas du travail jeté, il **devient** le cache optimiste devant le canal serveur quand L1 atterrit |
| **Appel en cours sur le rang** (● pulsant, « n voix · depuis X », Rejoindre) | Payload `ConversationLiveCall` — aucun champ d'appel n'existe aujourd'hui sur le modèle de conversation (vérifié : `CoreModels.swift` n'a ni `activeCall`, ni `callState`) | `LocalLiveCallProvider` : dérivé de l'état d'appel que le client connaît **déjà** pour la conversation ouverte ; **absent** pour les autres | **Oui** — un appel non connu est un appel **non affiché**, jamais un appel inventé. La section EN DIRECT reste vide plutôt que fausse |

### 4.3 Le service agent — une quatrième surface, déjà largement bâtie

`services/agent` n'est pas une API à inventer : c'est un service en production qu'il faut **brancher sur un nouveau débouché**. L'inventaire (contrat Lentille E15 et §5.1) :

| Déjà là | À faire |
|---|---|
| Graphe LangGraph `observer → strategist → generator → quality-gate` | **Portée du résumé** : le borner à une plage de messages, que la gateway intersecte avec la fenêtre non lue du lecteur |
| Fabrique LLM (Anthropic/OpenAI, routeur, repli, retry, coût) | **Format** : une ligne au lieu de 200 mots — une contrainte de génération |
| **Résumé de conversation** déjà produit et persisté par l'observer, avec ton et profils | **Conversations directes** : élargir `eligibleConversationTypes` — une valeur de configuration, pas une limite structurelle |
| **Attachement par conversation** : `AgentConfig.conversationId`, `enabled`, `agentType` | **Chemin non écrivant** — le seul vrai manque structurel |
| Transport gateway ↔ agent (HTTP + ZMQ + relais admin) | |
| `GET /conversations/:id/analysis`, déjà consommé par le SDK | |

**Ce que cela change au plan — et ce que cela ne change pas.**

- **L'ordre ne bouge pas.** C'est du backend : il se fait **en dernier**, après les portes V1 et V2, avec le lot L1. Le pont déterministe couvre l'UX entière d'ici là.
- **Le plancher ne bouge pas.** L'étage déterministe reste permanent, pas transitoire. L'agent enrichit ; il ne devient jamais le seul fournisseur, sans quoi une panne LLM viderait la liste.
- **Une contrainte se durcit.** Le service produit aujourd'hui pour **livrer**, et l'animateur poste **sous l'identité d'utilisateurs réels**. Le pont, lui, ne doit **jamais** écrire dans le fil. Il faut donc un chemin de production **non écrivant**, adossé à l'observer, sans file de livraison ni identité d'emprunt — pour qu'allumer les ponts n'allume jamais l'impersonation. Tant que cette séparation n'est pas faite, `agent_grammar` reste OFF, et son activation garde la décision produit écrite qu'exigeait déjà #3010 WS-10.

### 4.4 Assistance **locale d'abord**, service en repli — et une exception non négociable

> **Exigence produit** : par défaut le système utilise `services/agent` **si l'appareil local ne permet pas** de faire tourner un agent local capable d'analyser, de résumer et de conseiller des réponses.
> **Horizon** : l'agent **local** est une vision de **moyen terme**. Elle n'est pas construite dans ce chantier — mais la **couture** qui permettra de l'insérer sans rien casser, elle, se pose maintenant.

C'est donc une **cascade de capacité**, pas un choix binaire. Elle se pose exactement là où le contrat de providers l'attend déjà (§4.2) : un protocole, plusieurs implémentations, l'UI ignorante de laquelle sert.

| Rang | Fournisseur | Quand | Confidentialité | **Horizon** |
|---|---|---|---|---|
| 1 | **Agent local** (modèle sur l'appareil) | dès que l'appareil en est capable | le contenu ne quitte **jamais** l'appareil | **moyen terme** — non construit ici |
| 2 | **`services/agent`** (§4.3) | appareil incapable **et** politique le permettant | contenu traité côté serveur | **ce chantier**, lot L1, après V2 |
| 3 | **Pont déterministe** | toujours, et **seul recours** quand 1 et 2 sont exclus | aucune analyse, que du comptage | **ce chantier**, dès la phase 1 |

**Ce qui se construit maintenant : les rangs 3 puis 2, et la place du rang 1.** Aujourd'hui, la sonde de capacité locale répond simplement « incapable » — une implémentation d'une ligne. Ce qui compte est que `resolveAssistTier` et `AssistCapabilityProbing` **existent** et soient consultés dès maintenant : le jour où le rang 1 arrive, on remplace une sonde, pas une architecture. Une cascade ajoutée après coup se paie en refonte de tous les appelants ; une cascade posée d'emblée avec un seul rang actif ne coûte rien.

**L'exception non négociable — les conversations `e2ee`.** Le schéma distingue trois modes (`encryptionMode` : `null`, `"server"`, `"e2ee"` en `signal_v3`). Dans une conversation **`e2ee`**, le serveur ne détient pas le clair : lui faire produire un résumé exigerait de rompre la promesse de bout en bout. Le repli du rang 1 vers le rang 2 y est donc **interdit**, pas seulement déconseillé — un appareil incapable retombe directement au **rang 3**.

Autrement dit : la cascade est gouvernée par **deux** conditions, la capacité *et* la politique. Formuler « si l'appareil ne peut pas, alors le serveur » sans la seconde ferait du chiffrement de bout en bout une promesse à trous — et c'est le genre de trou qui ne se voit pas en recette, parce que tout **fonctionne**.

**Le choix du rang est une loi partagée**, `resolveAssistTier({ deviceCapability, encryptionMode, userConsent, conversationType })`, vectorisée comme les autres (§2.3). Sans quoi trois frontends inventeraient trois politiques de confidentialité différentes — la pire chose à laisser diverger.

**La capacité locale se sonde, elle ne se suppose pas.** `AssistCapabilityProbing` est défini maintenant et renvoie `false` partout ; à moyen terme, chaque plateforme le remplace par une vraie sonde (résultat mis en cache, réévalué au changement d'OS ou de réglages). Le dépôt a déjà un précédent d'analyse sur l'appareil — `TextAnalyzer`, `LanguageDetection`, l'onglet sentiment — donc le chemin local sera une montée en puissance, pas une nouveauté d'architecture.

**Ce que cela ne change pas au séquencement.** Rien. Le rang 3 couvre l'UX entière dès la phase 1 ; le rang 2 est un enrichissement livré après les portes V1 et V2 ; le rang 1 viendra à son horizon. Un agent local qui n'existe pas encore n'a jamais pour conséquence un écran vide — c'est précisément ce que le plancher déterministe garantit.

**Trois règles qui font que ce détour ne coûte rien.**

1. **Un seul protocole, deux implémentations.** `ConversationBridgeProviding`, `ReadingModePreferenceStoring`, `ConversationLiveCallProviding` sont écrits **une fois**, par L0. Le mock et le futur client gateway s'y conforment tous les deux. Quand L1 atterrit, on **change l'injection**, pas les vues. Aucune ligne d'UI ne sait d'où vient sa donnée.
2. **Zéro donnée fabriquée, jamais.** Un substitut calcule moins, ou renvoie `nil` — il n'invente pas. Une heuristique client déterministe est honnête ; un pont codé en dur ne l'est pas. C'est la même frontière que #3010 §6 trace pour les surfaces agent.
3. **Le mock est testé comme le vrai.** Les deux implémentations passent le **même** fichier de vecteurs. Un substitut qui divergerait de la loi serait un piège : on validerait une UI sur un comportement que le backend ne reproduira pas.

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
PHASE 1 — iOS puis WEB, et rien d'autre

Étape 1 ── L0.a  lois TS + vecteurs (orchestrateur, courbe, pilule, sections, tri)
           L0.b  tokens de cotes + conversation-colors.ts (débloquent la fidélité)
           L0.c  les TROIS protocoles (pont, préférence, appel live) — figés ici

Étape 2 ── L0.d  miroir SWIFT + suite de vecteurs iOS + test de parité des tokens
           LM    providers de substitution (§4.2), testés sur les MÊMES vecteurs

Étape 3 ── L2.a  iOS — peau Lentille (LWS-5 → LWS-8)
           L2.b  iOS — Focal (WS-1 → WS-6 de #3010, amendés)
                  └─ disjoints en fichiers : ConversationListView* vs MessageListView*
           L2.c  iOS — coquille : encoche, menu de mode, aperçu (WS-7)
           ▸▸ PORTE V1 — recette iOS INTÉGRALE sur mocks (§6.1)

Étape 4 ── L3.a  web — peau Lentille, déployée DORMANTE sur main (§6.2)
           L3.b  web — Focal (fil)
           L3.c  web — menu de mode + aperçu
           ▸▸ PORTE V2 — recette web INTÉGRALE + parité web↔iOS (§6.1)

Étape 5 ── L1.a  GATEWAY — pont ✦ déterministe réel, readingMode serveur, appel live
           ▸ bascule d'injection : les mocks cèdent la place, les vues ne bougent pas
           L1.b  AGENT — débouché non écrivant + résumé borné 1 ligne (§4.3)
           ▸ enrichissement seul : le plancher déterministe reste sous lui

Étape 6 ── L5    recette croisée iOS + web, perf, a11y, ACTIVATION progressive
           ▸▸▸ CLÔTURE DE PHASE 1 (§9)

──────────────────────────────────────────────────────────────────────
PHASE 2 — Android, seulement maintenant

Étape 7 ── L0b   miroirs Kotlin + vecteurs JUnit + LentilleDimens
           L4    Android — les deux peaux, sur un cœur figé et un backend réel
```

**Pourquoi la gateway est en dernier.** Elle ne bloque personne : les trois surfaces qui la demandent ont un substitut honnête derrière le protocole définitif (§4.2). L'y placer tôt aurait figé un contrat de données **avant** que trois interfaces l'aient éprouvé — le meilleur moyen de livrer un champ dont la forme ne convient à personne. En la plaçant après V2, elle implémente un protocole déjà validé par deux frontends en usage réel.

**Les trois points de synchronisation durs.**

- **S1 — après l'étape 1** : lois, vecteurs, tokens et **protocoles** sont figés. Tout lot qui code une constante ou invente une signature après S1 est en violation de contrat. Un seuil qui doit bouger repasse par L0, et toutes les plateformes rougissent ensemble.
- **S2 — porte V1** : rien ne commence sur le web tant que la recette iOS n'est pas intégralement verte. C'est l'exigence produit, et c'est aussi ce qui rend la parité web↔iOS mesurable : on compare à une référence figée, pas à deux cibles mouvantes.
- **S3 — porte V2** : la gateway ne démarre qu'une fois les deux frontends validés. Le contrat de données qu'elle implémente est alors éprouvé, pas supposé.
- **S4 — clôture de phase 1** : `apps/android/**` reste fermé jusqu'ici. C'est la priorité produit, et c'est aussi l'économie la plus simple du chantier — chaque ajustement du noyau se paie deux fois au lieu de trois.

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

## 6. Validation par étapes et mise sur `main`

> **Exigence produit** : les vues sont testées **intégralement sur iOS, puis sur le web**, avant déploiement ; et la version web doit pouvoir vivre sur `main` avec un **accès à la nouvelle vue de conversation**, **sans casser le reste**.

### 6.0 Une distinction qui lève la tension apparente

« Déployer sur `main` » et « activer » sont deux choses différentes, et les confondre est ce qui rendrait l'exigence contradictoire.

- **Poser le code sur `main`** est sûr et continu, dès l'étape 3 : drapeau éteint, la peau Lentille est du code inerte, l'app rend exactement ce qu'elle rend aujourd'hui. Rien à retenir sur une branche longue — les branches longues sont elles-mêmes un risque.
- **Activer** — changer le défaut pour les utilisateurs — n'arrive qu'après les portes V1 et V2, puis la recette croisée L5.

Entre les deux vit le **chemin d'accès** : un moyen d'atteindre la nouvelle vue, sur `main`, sans l'imposer à personne (§6.2).

### 6.1 Les deux portes — ce que « testé intégralement » veut dire

Une porte n'est pas une impression : c'est une liste close, et chaque ligne a sa preuve.

| | **Porte V1 — iOS** | **Porte V2 — web** |
|---|---|---|
| Vecteurs partagés | 7 fichiers verts en XCTest | 7 fichiers verts en Jest |
| Parité des tokens | `LentilleMetrics` == `lentille-tokens.json` | tokens CSS == `lentille-tokens.json` |
| Conformité d'anatomie | cotes rendues == tokens (§2.5 ②) | idem |
| Matrice comportementale | **28** `id` de la liste + **16** `id` du fil couverts, garde d'ensemble verte | idem, **plus** : chaque `id` se comporte comme sur iOS |
| Planche des 25 cas | rejouée à l'écran, les 25 conformes (§6.3) | rejouée, **comparée à la planche iOS** |
| Accessibilité | VoiceOver, Dynamic Type XL sans troncature, reduce motion, contrastes AA | lecteur d'écran, zoom 200 %, `prefers-reduced-motion`, axe-core |
| Performance | < 1 ms/frame, zéro allocation, aucun relayout — **aux Instruments** | idem, **au profiler navigateur** (Performance + Layout Shift à 0) |
| Réversibilité | drapeau éteint ⇒ snapshot identique à aujourd'hui | idem |
| Non-régression | matrice §5.3 rejouée : swipes, menus, drag & drop, pagination, pull-to-refresh | idem + le test de câblage Prisme existant reste vert |

**V2 porte une exigence que V1 n'a pas** : la parité. Le web ne se valide pas seul, il se valide **contre iOS**, planche contre planche et `id` contre `id`. C'est pour cela que l'ordre est imposé : on ne compare pas deux cibles mouvantes.

### 6.2 Le web sur `main` : dormant, accessible, et incapable de casser le reste

Trois propriétés à tenir simultanément. Chacune a son mécanisme, et tous réutilisent ce qui existe.

**① Dormant par défaut.** Le drapeau `lentille_list` est éteint ; le mux de rang rend `ConversationItem`, exactement comme aujourd'hui. Un test de snapshot drapeau éteint le prouve à chaque CI.

**② Accessible sans build spécial.** Le `useFeatureFlags` actuel ne lit que `process.env.NEXT_PUBLIC_*` — c'est un drapeau de **build**, tout-ou-rien, qui ne peut pas donner accès à une personne sans l'imposer à toutes. Il est donc **étendu**, pas contourné, avec une résolution à trois niveaux :

```
resolveLentilleFlag({ searchParam, cookie, env })
  ?lentille=1  → active pour CE navigateur, et pose le cookie meeshy_lentille=1
  ?lentille=0  → désactive et efface le cookie
  cookie       → persiste entre les visites
  env          → NEXT_PUBLIC_LENTILLE_DEFAULT, le jour de l'activation générale
  défaut       → OFF
```

Une seule fonction, pure, testée. C'est le **seul** endroit du web qui décide — toute autre lecture du drapeau est un bug de contrat.

**③ Incapable de casser le reste.** C'est la propriété la plus importante, et elle ne s'obtient pas par de la prudence mais par de la structure :

- **Un seul point de branchement.** Le drapeau n'est lu qu'au mux de rang et au conteneur de sections. Le pipeline de données, les handlers socket, le cache, les préférences, le routage : **aucun** ne le connaît. Un drapeau qui ne traverse pas la couche de données ne peut pas corrompre la couche de données.
- **Dégradation au lieu d'écran blanc.** La sous-arborescence Lentille est enveloppée dans un `FeatureErrorBoundary` — qui existe déjà et **accepte un `fallback`** — dont le repli est le rendu **historique**. Si la peau lève une exception en production, l'utilisateur retombe sur la liste d'aujourd'hui ; il ne voit pas une page morte. C'est ce qui rend le déploiement dormant réellement sûr, et pas seulement improbable.
- **Coût nul pour qui ne l'active pas.** La sous-arborescence est chargée en `next/dynamic`, drapeau off ⇒ le bundle n'est pas téléchargé. Un utilisateur qui ne demande rien ne paie rien, ni en octets ni en risque.
- **Aucune route nouvelle.** `/conversations/[[...id]]` reste la seule route. Le paramètre est un modificateur de rendu, pas une destination — donc ni duplication de câblage, ni deuxième chemin à maintenir, ni divergence possible entre deux copies de l'écran.

> **Garde de contrat, vérifiée en CI** : le nom du drapeau n'apparaît **qu'une fois** hors de son résolveur et de ses tests. Une seconde occurrence signifie que la logique a fui hors du mux — c'est le moment où « sans casser le reste » cesse d'être garanti par construction.

Côté iOS, le même besoin est servi par `MeeshyFeatureFlags` (`UserDefaults` + surcharge `ProcessInfo`), plus une bascule cachée dans les réglages pour les builds TestFlight. Aucun mécanisme neuf.

### 6.3 La planche des 25 cas — l'instrument de la fidélité visuelle

La maquette Lentille embarque **25 rangs qui couvrent l'intégralité de la matrice §5.3** : épinglé, live, pont ✦ (≤ 25 et > 25), typing, brouillon, pièces jointes sans texte, vocal, localisation, éphémère, vue unique, expiré, masqué, sourdine, verrou, agent ✦, outbox, mood vs présence, anneau story, tags, préview traduit 🌐, présence online/away/hors-ligne, mode mémorisé, et le cas de base.

Cette planche devient l'**instrument de recette partagé** : le même jeu de 25 conversations est monté sur les trois frontends, dans les deux thèmes, et comparé rang par rang à la maquette. Elle sert aussi de jeu de données aux tests de conformité d'anatomie — les mêmes 25 cas, mesurés au lieu d'être regardés.

---

## 7. Portes de qualité

| Porte | Commande | Bloque |
|---|---|---|
| Lois TS | `cd packages/shared && bun test` | tout lot |
| Vecteurs web/shared | `bun test -- vectors` — échoue si **zéro** cas chargé | S1 |
| Gateway | `cd services/gateway && bun run test:coverage` (249 suites, lignes ~62,9 % sous bun) | L1 |
| Web | `cd apps/web && bun test` + `bun run build` | L3 |
| iOS | `./apps/ios/meeshy.sh test` — **fait foi en CI macOS** ; `xcodebuild` n'existe pas sous Linux | L2 |
| Android *(phase 2)* | `./gradlew test` | L4 |
| Parité des miroirs | phase 1 : **deux** suites de vecteurs (Jest, XCTest) vertes sur le **même** commit de `fixtures/` — phase 2 : les trois | clôture de chaque phase |

> **Prérequis de parité locale bun** (`CLAUDE.md`) : `cd packages/shared && npx prisma generate --generator client` puis `bun run build`, sans quoi ~17 suites gateway échouent pour des raisons sans rapport avec ce chantier.

**Réversibilité — trois drapeaux, indépendants.**

| Drapeau | Portée | Défaut | Off ⇒ |
|---|---|---|---|
| `reading_modes` (#3010) | fil | OFF | rendu bulle historique, bit-à-bit identique |
| `lentille_list` | liste | OFF | `ThemedConversationRow` (iOS) / `ConversationItem` (web) inchangés |
| `agent_grammar` (#3010 WS-10) | grammaire ✦ | OFF | l'agent rend comme un humain — activation soumise à décision produit écrite |

Les drapeaux sont **indépendants** : la Lentille sans Focal est un état livrable (la liste annonce une décision que le fil applique aujourd'hui en bulles), et l'inverse aussi.

---

## 8. Hors périmètre — dit une fois, pour ne pas y revenir

- **La Scène** (couche live d'appel). La liste **affiche** son existence (section EN DIRECT, « n voix · depuis X », bouton Rejoindre) ; elle ne l'implémente pas. Chantier séparé.
- **La Rivière.** Présente dans le catalogue et le menu de mode, **toujours grisée avec sa raison réelle** (« s'ouvrira à 5 personnes actives — 3 aujourd'hui »). Elle n'entre que si elle gagne son procès (vol. 3).
- **L'API Agent** (`assist:*`, rôle `observer`, `POST /conversations/:id/agents`). Zéro occurrence dans le dépôt (#3010 écart #10). Le pont ✦ vit sans elle, par son étage déterministe.
- **Le Résumé Vivant côté liste.** La liste **annonce** la décision « Résumé Vivant » ; l'écran de résumé est livré par WS-8/WS-9 de #3010, pas par la Lentille.
- **La refonte du pipeline de données.** ViewModels, cache, delta-sync, temps réel, gestes : **conservés à l'identique** sur les trois plateformes. La Lentille est une peau (vol. 5 §5.1, §6.1). Toute envie d'« améliorer au passage » est hors contrat.

---

## 9. La définition de « fini »

### 9.1 Clôture de la **phase 1** — iOS et web

C'est la seule clôture qui compte pour livrer. Elle est atteinte quand, et seulement quand :

1. Les sept fichiers de vecteurs sont verts dans **deux** suites (Jest, XCTest), sur le même commit de `packages/shared/fixtures/`.
2. Les treize critères de recette du vol. 5 (§7, R1 → R13) passent sur iOS **et** web.
3. La matrice de couverture §5.3 du vol. 5 (28 lignes : typing, brouillons, kinds, pièces jointes, localisation, épingle, mute, verrou, outbox, mood, sélection iPad, long press, appel, ticker, VoiceOver, pagination, branches vides…) se comporte **à l'identique** de l'existant, drapeau on.
4. La matrice §5 du vol. 4 (16 lignes temps réel du fil) idem, en Focal **et** en Script.
5. Drapeaux éteints ⇒ les **deux** apps sont **bit-à-bit identiques** à aujourd'hui (test de snapshot par plateforme).
6. Budget de défilement tenu sur les deux écrans : < 1 ms/frame, zéro allocation dans la passe, aucune invalidation de layout — **mesuré** aux Instruments et au profiler navigateur, pas déduit.
7. **Fidélité prouvée, pas affirmée** : cotes rendues == `lentille-tokens.json` sur iOS **et** web (§2.5 ①②), et les 44 `id` de `behaviour-matrix.json` couverts sur les deux, le web comparé à iOS `id` par `id` (§2.5 ③).
8. **Les portes ont été franchies dans l'ordre** : recette iOS intégrale (V1) avant tout travail web, recette web intégrale et parité (V2) avant tout travail gateway.
9. **La bascule des substituts est neutre** : quand la gateway remplace les mocks, aucun snapshot de vue ne bouge à données égales — la preuve que le protocole était le bon et que l'UI n'a jamais dépendu de la provenance.
10. **`main` n'a jamais été mis en danger** : à chaque étape, drapeaux éteints, l'app est identique ; la peau dégrade vers le rendu historique si elle lève ; le bundle n'est pas servi à qui ne l'a pas demandé.

Une régression silencieuse vaut mieux qu'un joli effet : si un des dix points est rouge, la phase 1 n'est pas close, quel que soit l'état visuel.

### 9.2 Clôture de la **phase 2** — Android

Ouverte seulement après 9.1. Même grille, sans rien de neuf à décider :

1. Les miroirs Kotlin passent les **mêmes** sept fichiers de vecteurs — la troisième suite rejoint les deux autres sur le même commit de `fixtures/`.
2. `LentilleDimens` == `lentille-tokens.json` (test de parité, modèle `MeeshyTokenParityTest`).
3. Les 44 `id` de `behaviour-matrix.json` sont couverts en JUnit, et Android se compare à iOS `id` par `id`.
4. La grille R1 → R20 est rejouée sur Android ; drapeau éteint ⇒ rendu identique.
5. Les deux divergences Android relevées à la reconnaissance sont fermées : le sectionnement `PINNED/CATEGORY/ALL` (F7) cède la place à la loi partagée, et le miroir manquant du résolveur d'aperçu du Prisme (F8) est créé.

Android n'a aucune décision à prendre en phase 2 : tout ce qu'il implémente a déjà été tranché, écrit et prouvé deux fois.
