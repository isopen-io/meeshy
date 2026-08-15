# Contrat d'implémentation — La Lentille (listing des conversations)

> **Statut** : contrat d'ingénierie. Branche `claude/lentille-conversations-view-8silmf`.
> **Document parent** : `tasks/lentille-focal-workshop.md` — il séquence, celui-ci exécute. Les amendements au contrat Focal (#3010) y sont déclarés (§3 du workshop) et **liants** ici.
> **Source normative** : `docs/design/2026-08-15-conversation-list-lentille.html` (vol. 5), adossée aux vol. 2 (seuils de l'orchestrateur), vol. 3 (verdict) et vol. 4 (spec Focal).
> **Références pixel** — les maquettes interactives font foi sur les cotes, et leur CSS est la source des valeurs de §4.4 :
> · Lentille (liste) — `la-lentille.html`, https://claude.ai/code/artifact/d068fe38-e4ab-4b11-aa9c-f9c0585aef33
> · Focal (fil, avec la densité Script) — `focal-grandeur-nature.html`, https://claude.ai/code/artifact/83621c34-e472-4b2e-be75-0a06dbebc2ad
> Les deux maquettes ont été relevées et **confirment** toutes les constantes de ce contrat. Là où une maquette et un document HTML divergent, la maquette gagne sur la **cote**, le document gagne sur la **règle**.
> **Portée** : `packages/shared`, `packages/MeeshySDK`, `services/gateway`, `apps/ios`, `apps/web`, `apps/android`.
> **Public** : agents TDD travaillant en parallèle. Chaque fichier a **un seul propriétaire**. Deux workstreams ne modifient jamais le même fichier.

---

## 0. Préambule — ce que ce contrat corrige dans la spec

Le vol. 5 a été écrit contre un audit sérieux du code : les douze symboles qu'il nomme côté iOS (`ConversationListBottomBar`, `PinnedStoryTrailBand`, `SectionHeaderView`, `SwipeableRow`, `RowPressBounceModifier`, `ConversationPreviewView`, `UserCategoryStore`, `nativeContextMenuView`, `FreeFloatingButtonsContainer`, `ConversationListEmptyBranch`, `TypingDotsView`, `CollapsibleHeader`) **existent tous**, et les cotes qu'il attribue au rang actuel (`MeeshySpacing.md` = 12, `MeeshyRadius.md` = 14, avatar `.conversationList` = 52, nom et préview tous deux à `subheadSize` = 13 différenciés à la graisse seule) sont **exactes**.

La reconnaissance révèle néanmoins **treize écarts** qui, laissés tels quels, coûteraient des jours ou produiraient trois implémentations divergentes. Aucun agent ne revient à la formulation d'origine sans repasser par ce document.

| # | Ce que dit la spec (ou ce qu'on suppose) | Ce que dit le code réel | Décision de ce contrat |
|---|---|---|---|
| **E1** | La Lentille « réutilise les concepts introduits par #3010 » | **#3010 n'a mergé aucune ligne de code.** `apps/ios/Meeshy/Features/Main/Focal/` n'existe pas ; `MeeshyFeatureFlags` non plus | Le noyau est **co-défini**, pas réutilisé. LWS-0/LWS-1 **sont** le WS-0 de #3010, réécrit en TypeScript partagé (workshop §3, A2) |
| **E2** | Les lois vivent en Swift (`Focal/Core/*.swift`, 14 fichiers) | Trois frontends doivent les appliquer | Domicile TypeScript dans `packages/shared/`, miroirs Swift/Kotlin, **vecteurs partagés** (workshop §2) |
| **E3** | §6.3 : « portage TS de `DynamicColorGenerator`… (déjà spécifié Vol.4 §6) » — présenté comme une correction d'écart | `packages/shared/utils/conversation-colors.ts` **n'existe pas**, alors que Swift **et** Kotlin existent | Ce n'est pas une correction annexe mais un **prérequis dur** du rang web : sans accent, ni anneau, ni ring de focus card, ni teinte de pont. Il passe en LWS-2, avant toute peau web |
| **E4** | §5.2 : les stickers sticky « remplacent les `SectionHeaderView` » | La liste iOS est un `LazyVStack(spacing: 8)` de sections **non épinglées**, avec repli/dépli (`expandedSections`), `SectionDropDelegate` et `SectionFrameRegistry` accrochés à cette topologie (`ConversationListView.swift:358, 380, 405, 441`) | Le sticky exige `Section {} header: {}` + `pinnedViews:` — une **restructuration** du conteneur, pas un échange de vue. Elle est isolée dans **LWS-6**, seule et unique, avec un test de non-régression du drag & drop et du pliage |
| **E5** | §5.2 : les sections deviennent Épinglées / En direct / catégories / Aujourd'hui / Hier / Cette semaine / Plus ancien | **Aucune plateforme n'a de section temporelle.** iOS : `pinned` + catégories utilisateur + `other` (`expandedSections` par défaut `["pinned","other"]`) ; Android : `PINNED / CATEGORY / ALL` ; web : `pinned / category / uncategorized` | La loi de sectionnement est **neuve sur les trois**. Elle vit en TS (LWS-1) et s'insère dans le point de greffe pur de chaque plateforme (§4.3) |
| **E6** | §5.1 : « ViewModel & pipeline — ne pas toucher » | Le sectionnement iOS est produit par `ConversationListViewModel.groupConversations`, appelée depuis le pipeline `CombineLatest4` + debounce 16 ms (`:496-510`) | La promesse est tenable **parce que** `groupConversations` est déjà `nonisolated private static` — une fonction pure (`:554`). Seul son **corps** est remplacé par un appel au miroir de la loi. Aucune `@Published` nouvelle, aucun changement de pipeline |
| **E7** | §6.4 : `bridge.text` est « 1 ligne, déjà dans la langue du lecteur (Prisme appliqué serveur) » | Une chaîne unique **ne peut pas** être re-résolue par le client. `lastMessagePreview` ne s'en contente jamais : il voyage avec `lastMessageTranslations` + `lastMessageOriginalLanguage` précisément pour que le client réapplique le Prisme quand les préférences changent ou qu'une traduction atterrit tardivement | **Le pont se dédouble** (§5) : l'étage déterministe voyage en **données structurées** (auteurs, volumes, types de médias) et se **formate côté client par i18n** — il n'a jamais besoin d'être traduit ; l'étage agent voyage avec la **même paire** `translations` + `originalLanguage` que le préview et se résout par `resolveLastMessagePreview`. Zéro nouvelle loi de langue |
| **E8** | §6.4 : « `bridge?: ConversationBridge` sur `ConversationListItem` » | **`ConversationListItem` n'existe pas** dans `packages/shared/types/` | Le champ se pose sur le type réellement renvoyé par `GET /conversations` (`services/gateway/src/routes/conversations/core.ts:537-583`) et sur `MeeshyConversation` (SDK). Le nom `ConversationListItem` est abandonné |
| **E9** | §4 : la préférence de mode est « mémorisée par conversation et synchronisée multi-appareils » ; #3010 la persiste en `UserDefaults` local | Deux modèles Prisma coexistent : `ConversationPreference` (clé/valeur générique) et `UserConversationPreferences` (colonnes typées, **porteur du `version` monotone** sur lequel tous les clients arbitrent, et canal de `user-preferences:updated`) | `readingMode` va sur **`UserConversationPreferences`**, jamais sur le clé/valeur. Le store local de #3010 devient un **cache optimiste** devant ce canal (workshop §3, A5) |
| **E10** | §6.1 : le pipeline web est « déjà conforme Instant App » | Vrai pour le cache. Mais `useInfiniteConversationsQuery` pagine par **offset** sur un tri serveur `lastMessageAt` desc, et son propre commentaire documente la ligne **dupliquée** en frontière de page quand un message arrive entre deux pages (`use-conversations-query.ts`) | La remontée FLIP de la Lentille **rend le défaut visible** (un rang qui apparaît deux fois pendant un bump). Déduplication par `id` **obligatoire** à la sélection du cache (LWS-9), et migration curseur documentée comme suite, hors périmètre |
| **E11** | §6.3 : « tri liste sur `lastMessage.createdAt` alors que le serveur trie sur `lastMessageAt` » | Confirmé : `useConversationSorting.ts:43-44` | Corrigé par la loi de tri partagée (LWS-1), pas par un patch local |
| **E12** | §6.2 : la peau web s'insère dans `ConversationGroup` / `ConversationItem` | Le web a **deux** arbres : `components/conversations/*` (vivant, routé par `app/conversations/[[...id]]/page.tsx`) et `components/v2/*` (`SplitViewLayout` **routé nulle part**) | La peau cible l'arbre vivant. `apps/web/components/v2/**` est **interdit** — y porter la Lentille produit du code invisible |
| **E13** | §5.3 : « `renderFingerprint` étendu : + `bridge` » | `renderFingerprint` est défini dans le **SDK** (`CoreModels.swift:281`), consommé par les deux portillons `.equatable()` (`ThemedConversationRow.swift:673`, `ConversationListView+Rows.swift:383`) | L'extension touche un **package**, pas l'app. Propriétaire : LWS-2. Sans elle, le portillon **gèlerait** le pont sur sa première valeur — exactement la régression B1 déjà documentée dans ce fichier pour les traductions tardives |
| **E14** | §6.3 : « clé i18n `noConversationsFound` **absente** de `locales/fr/conversations.json` » | La clé **existe** — en `fr`, `en`, `es`, `pt` — mais au chemin `conversations.conversationSearch.noConversationsFound`, alors que `EmptyConversations.tsx:19` interroge le nom **plat** `t('noConversationsFound')` avec un `t` injecté depuis `ConversationList` puis `ConversationLayout` | Le défaut est un **désaccord de chemin**, pas une clé manquante. Le correctif est d'aligner l'appel sur le chemin réel (ou de remonter la clé), **après** avoir confirmé la portée effective de `t` à l'exécution — pas d'ajouter un doublon. La branche recherche-vide est la seule concernée ; `noConversations` (`conversations.noConversations`) suit le même chemin et se vérifie en même temps |

**Trois écarts de design, actés hors code.**

- **« nom 15 extrabold »** — `Font.Weight.extrabold` n'existe pas en SwiftUI (déjà acté par #3010 §0). Rendu : `MeeshyFont.relative(MeeshyFont.bodySize /* 15 */, weight: .heavy)`.
- **« avatar 44 »** — inutile de créer un `.custom(44)` : `MeeshyAvatarContext.conversationHeaderCollapsed` vaut déjà 44 pt (`MeeshyAvatar.swift:25`). Le rang Lentille réutilise ce contexte ; `.conversationList` (52) reste au rang historique.
- **« point accent 8 px »** — la valeur est un diamètre de design, pas un token. Elle vit dans `LentilleMetrics`, centralisée, jamais écrite en dur dans une vue.

---

## 1. Carte des modules

### 1.1 Nouveaux fichiers — noyau partagé (lot L0)

```
packages/shared/
├── utils/
│   ├── reading-modes.ts              ← LWS-0  orchestrateur, catalogue, capacités
│   ├── focus-curve.ts                ← LWS-0  courbe paramétrée .thread/.list + élection
│   ├── scroll-activity.ts            ← LWS-0  loi de la pilule (900 ms)
│   ├── conversation-sections.ts      ← LWS-1  sectionnement + tri
│   ├── conversation-bridge.ts        ← LWS-1  données du pont ✦ + formatage i18n
│   └── conversation-colors.ts        ← LWS-2  portage TS de l'accent (E3)
├── types/
│   ├── reading-modes.ts              ← LWS-0  ConversationReadingMode, préférence
│   └── conversation-bridge.ts        ← LWS-1  ConversationBridge (§5)
└── fixtures/reading-modes/           ← LWS-0/1/2 — écrits ici, lus par les 3 plateformes
    ├── orchestrator.vectors.json
    ├── focus-curve.vectors.json
    ├── scroll-activity.vectors.json
    ├── sections.vectors.json
    ├── sort.vectors.json
    ├── bridge.vectors.json
    └── accent.vectors.json
```

### 1.2 Nouveaux fichiers — iOS (lot L2, peau liste)

```
apps/ios/Meeshy/Features/Main/Lentille/
├── Core/                                   ← LWS-5  miroirs Swift + métriques
│   ├── LentilleMetrics.swift
│   ├── LentilleSectionResolver.swift       (miroir de conversation-sections.ts)
│   ├── LentilleBridgeFormatter.swift       (miroir de conversation-bridge.ts)
│   └── LentilleFeatureFlag.swift
├── Row/                                    ← LWS-7
│   ├── LentilleConversationRow.swift
│   ├── LentilleBridgeLine.swift
│   └── LentilleSkeletonRow.swift
├── Chrome/                                 ← LWS-6
│   ├── LentilleSticker.swift
│   ├── SectionScrollPill.swift
│   └── StoriesVivantsRail.swift
├── Perspective/                            ← LWS-8
│   └── LentillePerspective.swift
└── Mode/                                   ← LWS-8
    ├── LentilleModeMenu.swift
    └── LentillePeekView.swift
```

### 1.3 Nouveaux fichiers — web (lot L3)

```
apps/web/components/conversations/lentille/     ← LWS-10 / LWS-11
├── LentilleRow.tsx
├── LentilleBridgeLine.tsx
├── LentilleSticker.tsx
├── LentilleSkeletonRow.tsx
├── SectionScrollPill.tsx
├── LivesRail.tsx
├── ReadingModeMenu.tsx
└── LentillePeek.tsx
apps/web/hooks/lentille/
├── useLentillePerspective.ts
└── useScrollActivity.ts                        ← factorisé, consommé aussi par le Focal web
```

### 1.4 Fichiers EXISTANTS modifiés — propriétaire unique

| Fichier existant | Propriétaire | Nature exacte de la modification |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift` | **LWS-2** | `bridge` sur `MeeshyConversation` + repli dans `renderFingerprint` (E13). **Rien d'autre** |
| `packages/shared/prisma/schema.prisma` | **LWS-3** | `readingMode String @default("auto")` sur `UserConversationPreferences`. Aucun booléen compagnon (règle « pas de paire booléen + timestamp ») |
| `services/gateway/src/routes/conversations/core.ts` | **LWS-4** | `bridge` dans le `select`/mapping de la liste. Le tri `lastMessageAt desc` et le curseur `before` **ne bougent pas** |
| `services/gateway/src/routes/conversation-preferences.ts` | **LWS-3** | `readingMode` dans schéma, `PUT`, payload de broadcast. Le `version: { increment: 1 }` atomique **reste tel quel** |
| `apps/ios/.../ViewModels/ConversationListViewModel.swift` | **LWS-5** | **Corps** de `groupConversations` (`:554`) → appel au miroir. Le pipeline `CombineLatest4` + debounce 16 ms (`:496-510`) est **interdit de modification** |
| `apps/ios/.../Views/ConversationListView.swift` | **LWS-6** | Conteneur `LazyVStack` → `Section`/`pinnedViews` (E4), mux de rang dans `conversationRow` (`:473`), montage pilule + rail |
| `apps/ios/.../Views/ConversationListView+Rows.swift` | **LWS-7** | Mux `ConversationRowItem` → `LentilleConversationRow` sous drapeau. `SwipeableRow` (`:90`) et le portillon `.equatable()` (`:214, :381`) **inchangés autour** |
| `apps/ios/.../Views/ConversationListView+Overlays.swift` | **LWS-8** | Sous-menu « Mode de lecture » dans `nativeContextMenuView`, preview → `LentillePeekView`. Timings de `RowPressBounceModifier` **gelés** |
| `apps/web/components/conversations/hooks/useConversationSorting.ts` | **LWS-9** | Tri → loi partagée (E11) |
| `apps/web/components/conversations/hooks/useConversationFiltering.ts` | **LWS-9** | Recherche sur le préview **résolu** en plus du titre |
| `apps/web/components/conversations/ConversationList.tsx` | **LWS-10** | Mux de rang + abonnement typing (E-audit vol. 5 §6.3) |
| `apps/web/locales/fr/conversations.json` | **LWS-9** | Clé `noConversationsFound` manquante + clés du pont et des modes |
| `apps/ios/.../Views/ThemedConversationRow.swift` | *(personne)* | **Interdit.** Le rang historique est le rendu hors drapeau, bit-à-bit identique |
| `apps/web/components/conversations/conversation-item/ConversationItem.tsx` | *(personne)* | **Interdit.** Même raison. Son test de câblage Prisme (`__tests__/ConversationItem.prisme.test.tsx`) est un test de **non-régression**, conservé vert |
| `apps/web/components/v2/**` | *(personne)* | **Interdit.** Arbre mort, non routé (E12) |
| `packages/shared/utils/conversation-helpers.ts` | *(personne)* | **Lecture seule.** `resolveLastMessagePreview` est la source de vérité du Prisme — consommée, jamais réécrite |
| `packages/shared/utils/user-presence.ts` | *(personne)* | **Lecture seule.** Présence 1/3/5 |

> **Règle d'or** : un agent qui doit éditer un fichier dont il n'est pas propriétaire **s'arrête** et ouvre une demande d'extension de contrat. Il n'édite pas.

### 1.5 Fichiers existants LUS mais jamais modifiés

`ConversationListHelpers.swift` (pour `SectionHeaderView`, `ConversationPreviewView`), `StoryTrayView.swift` (pour `PinnedStoryTrailBand`, `StoryTrayView`), `RootView.swift` (pour `FreeFloatingButtonsContainer`), `MeeshyAvatar.swift`, `PresenceStyle.swift`, `MeeshyColors.swift`, `DesignTokens.swift`, `ColorGeneration.swift`, `use-conversations-query.ts`, `use-socket-cache-sync.ts`, `use-conversations-delta-sync.ts`, `conversation-preferences-store.ts`, `ParticipantPresenceIndicator.tsx`, `ConversationGroup.tsx`, `emitConversationPreviewUpdate.ts`.

Réutilisés **verbatim**. Toute envie de les « améliorer au passage » est hors contrat.

---

## 2. Workstreams

Ordre = ordre de dépendance. Un workstream ne démarre que quand ses dépendances sont mergées.

```
LWS-0 ── LWS-1 ── LWS-2 ── LWS-2bis ─┬─ LWS-5 ─ LWS-6 ─ LWS-7 ─ LWS-8 ─▸ PORTE V1 (iOS)
  lois     liste    tokens    mocks   │                                        │
                              (§4.2)  └─ LWS-9 ─ LWS-10 ─ LWS-11 ─────────▸ PORTE V2 (web)
                                                                                │
                                        LWS-3 ── LWS-4  ◂── GATEWAY, EN DERNIER ┘
                                                    │
                                        LWS-12 (android) ── LWS-13 (recette + activation)
```

> **L'ordre des lots gateway a changé.** LWS-3 et LWS-4 étaient initialement placés tôt ; ils passent **après les portes V1 et V2**, conformément à l'exigence produit « les features qui nécessitent une retouche backend se font en dernier, mockées en attendant ». Le substitut est LWS-2bis. Voir workshop §4.2 et §5.

---

### LWS-0 — Lois de lecture : orchestrateur, courbe, activité de défilement

**But.** Publier en TypeScript, en une PR, les lois que les deux écrans et les trois frontends partagent. Aucune vue, aucun I/O, aucun singleton, aucune dépendance à React ou à un modèle de plateforme.

**Fichiers possédés.** `packages/shared/utils/{reading-modes,focus-curve,scroll-activity}.ts`, `packages/shared/types/reading-modes.ts`, et les trois fichiers de vecteurs correspondants.

**Lois à extraire.**

- `resolveOrchestratorDecision({ unreadCount, lastOpenedAt, now, stickyChoice, capabilities, isFlagEnabled })` — les quatre branches de la règle : `≤ 25` → Focal + pont ✦ ; `> 25` → Résumé Vivant ; absence `> 24 h` **et** `≥ 10` non-lus → Résumé Vivant ; choix collant → il gagne toujours. `isFlagEnabled === false` → mode historique.
- `resolveCapabilities({ identity, isFlagEnabled, conversationType, activeParticipantCount })` — **l'unique** point de branchement invité/inscrit. Toute autre lecture d'un `isAnonymous` dans le code des modes est un bug de contrat. Porte aussi l'éligibilité Rivière (≥ 5 participants actifs, jamais en `direct`).
- `focusCurve(distance, variant)` — `variant: 'thread' | 'list'`. `thread` : `f = min(1, d/380)`, `scale = 1 − 0.40f`, `alpha = 1 − 0.82f`. `list` : `f = min(1, d/520)`, `alpha = 1 − 0.45f`, `scale = 1 − 0.04f`, plus un fondu court sous le focus (`d/160`, plafonné à `−0.35`). Une forme, deux jeux de constantes (workshop A3).
- `electFocusRow({ candidates, focusY, currentId, hysteresis })` — élection stable ; le gagnant ne change pas tant que le courant reste dans la bande.
- `scrollActivityLaw` — machine à états `{ idle → active → idle }` : invisible à l'ouverture, visible au premier `scrolled`, invisible exactement 900 ms après le dernier, timer réarmé par chaque `scrolled` (workshop A4).

**Fichiers de test.** `packages/shared/__tests__/reading-modes.test.ts`, `focus-curve.test.ts`, `scroll-activity.test.ts`, `__tests__/vectors/*.test.ts`.

**Critères d'acceptation.**
- Les quatre branches de l'orchestrateur sont couvertes, plus `isFlagEnabled === false`.
- Le choix collant **prime** sur les quatre branches — y compris `> 25` non-lus.
- `focusCurve('thread')` à `d = 400` rend `alpha ≤ 0.20` (`1 − 0.82·min(1, 400/380) = 0.18`) — reprise littérale du critère §7 de #3010.
- `focusCurve('list')` à `d = 520` rend `alpha = 0.55` et `scale = 0.96` ; la hauteur du rang **n'apparaît nulle part** dans la loi (invariant : la perspective ne touche pas la géométrie).
- `electFocusRow` : une suite de positions oscillant de ±40 px autour de `focusY` ne change **jamais** de gagnant tant que le courant reste dans la bande d'hystérésis.
- `scrollActivityLaw` : état initial invisible ; `scrolled` → visible ; `tick(t+0.899)` → visible ; `tick(t+0.901)` → invisible ; un `scrolled` intercalé réarme.
- **Garde de harnais** : une suite de vecteurs qui charge zéro cas **échoue** (leçon 257 — le vert silencieux est le pire mode de panne).

---

### LWS-1 — Sectionnement, tri, données du pont

**But.** Les lois propres à la liste. Neuves sur les trois plateformes (E5).

**Fichiers possédés.** `packages/shared/utils/{conversation-sections,conversation-bridge}.ts`, `packages/shared/types/conversation-bridge.ts`, vecteurs `sections`, `sort`, `bridge`.

**Lois à extraire.**

- `resolveConversationSections({ conversations, categories, now, locale })` → sections **ordonnées** : `pinned` → `live` → catégories utilisateur *dans l'ordre déclaré par l'utilisateur* → `today` → `yesterday` → `thisWeek` → `older`. **Aucune section vide n'est émise.** Les bornes temporelles sont calculées dans le calendrier du lecteur, jamais en UTC.
- `sortConversations` — épinglées → live → catégorie (`orderInCategory`) → `lastMessageAt` desc, avec repli `updatedAt`. **Jamais** `lastMessage.createdAt` (E11). Tri secondaire déterministe par `id` pour départager : aucun `hashValue`, aucune graine non déterministe entre processus.
- `buildBridgeData({ messages, viewerId, unreadCount })` → **données**, pas une phrase : `{ authors: string[], extraAuthorCount: number, messageCount: number, mediaCounts: { images, audio, files } }`. Deux auteurs nommés au plus, le reste en `+N`.
- `formatBridge(data, t)` → la phrase, composée par l'**i18n du client**. C'est ce qui rend l'étage déterministe insensible à la langue (E7).

**Fichiers de test.** `packages/shared/__tests__/conversation-sections.test.ts`, `conversation-bridge.test.ts`, plus les vecteurs.

**Critères d'acceptation.**
- Partition : chaque conversation apparaît dans **exactement une** section ; l'union couvre l'entrée sans doublon ni perte.
- Une catégorie utilisateur vide n'émet pas de section ; une catégorie non vide conserve **sa** position déclarée, entre `live` et `today`.
- `sortConversations` est **stable** : deux appels sur la même entrée rendent le même ordre, sur trois exécutions de processus distinctes.
- Une conversation avec `lastMessage.createdAt` récent mais `lastMessageAt` ancien se classe sur `lastMessageAt` (test de non-régression de E11).
- `formatBridge` avec le **même** `data` et deux `t` de langues différentes rend deux phrases différentes — preuve que l'étage déterministe n'a jamais besoin d'être traduit.
- `buildBridgeData` sur zéro message non lu rend `null`, jamais un pont vide.

---

### LWS-2 — Accent TypeScript, extension du portillon SDK

**But.** Fermer les deux trous qui empêchent respectivement le web de voir les couleurs et les rangs de se rafraîchir.

**Fichiers possédés.** `packages/shared/utils/conversation-colors.ts`, `packages/shared/design/lentille-tokens.json`, `packages/shared/fixtures/conformance/behaviour-matrix.json`, vecteurs `accent`, `packages/MeeshySDK/Sources/MeeshySDK/Models/CoreModels.swift`.

**Ajout de fidélité (workshop §2.5).** Ce workstream publie aussi les deux instruments de conformité :
- `lentille-tokens.json` — domicile de **tous** les nombres de §4.3. Trois consommateurs (`LentilleMetrics.swift`, tokens CSS, `LentilleDimens.kt`), trois tests de parité sur le modèle de `MeeshyTokenParityTest.kt`, dont la règle est reprise mot pour mot : *« ne jamais réparer le test en y recopiant la valeur qui a dérivé — réparer le token »*.
- `behaviour-matrix.json` — les 28 lignes de la matrice vol. 5 §5.3 et les 16 de vol. 4 §5, chacune avec un `id`. Chaque plateforme référence les `id` dans ses tests ; une **garde d'ensemble** échoue si un `id` n'est couvert par aucun test (et non pas une garde de présence individuelle — leçon 257).

**Travaux.**

1. **Portage TS de l'accent** (E3) : `blend(langue × 0.30, type × 0.30, thème × 0.40)`, `secondary = hueShift(+30°)`, `accent = hueShift(−30°)`, repli `colorForName(name)` sur la palette de 20. La **troncature** est `Math.trunc`, jamais un arrondi — #3010 §0 documente que l'arrondi donne `#31B6BB` là où la vraie formule donne `#31B6BA`.
2. **Vecteurs d'accent** : le fichier est généré depuis les valeurs Swift existantes, puis vérifié par les trois suites. Le TS est le nouveau venu : c'est lui qui doit s'aligner, jamais l'inverse.
3. **`bridge` sur `MeeshyConversation`** + repli dans `renderFingerprint` (E13) : `bridge?.text`, `bridge?.unreadCount`, `bridge?.suggestedMode`, et — comme pour les traductions du préview — les **valeurs** des traductions du pont, clés triées, chaque clé et chaque valeur combinées **séparément**.

**Fichiers de test.** `packages/shared/__tests__/conversation-colors.test.ts`, `apps/ios/MeeshyTests/Unit/Lentille/BridgeFingerprintTests.swift`.

**Critères d'acceptation.**
- Les hex TS sont **identiques** aux hex Swift et Kotlin sur les 20 cas du fichier de vecteurs, sans tolérance (ce sont des entiers).
- Un pont dont seul le **texte traduit** change (même clé, même `unreadCount`) fait **changer** le `renderFingerprint` — sans quoi le portillon gèlerait la ligne, régression jumelle de B1 déjà documentée dans ce fichier.
- Un pont `nil` rend le même `renderFingerprint` qu'aujourd'hui : drapeau éteint ⇒ aucune invalidation nouvelle.

---

### LWS-2bis — Providers de substitution *(le backend est mocké jusqu'à LWS-3/4)*

**But.** Rendre les trois surfaces qui dépendent de la gateway utilisables **maintenant**, derrière le protocole définitif, sans jamais fabriquer de donnée.

**Fichiers possédés.** `packages/shared/providers/{ConversationBridgeProviding,ReadingModePreferenceStoring,ConversationLiveCallProviding}.ts` (les **protocoles**, figés ici et implémentés deux fois), plus les implémentations locales et leurs miroirs Swift.

**Les trois substituts** (détail et justification : workshop §4.2).

| Protocole | Implémentation de substitution | Implémentation définitive (LWS-3/4) |
|---|---|---|
| `ConversationBridgeProviding` | `LocalBridgeProvider` — exécute `buildBridgeData` (LWS-1) sur les messages **déjà en cache**, et pose `isComplete: false` quand la fenêtre ne couvre pas tout l'intervalle non lu | `GatewayBridgeProvider` — lit le champ `bridge` du payload |
| `ReadingModePreferenceStoring` | Store local (`UserDefaults` iOS / store web), clé `(scope, conversationId)` — mémorisé **par appareil** | Le même store, **rétrogradé en cache optimiste** devant `UserConversationPreferences` |
| `ConversationLiveCallProviding` | `LocalLiveCallProvider` — l'état d'appel que le client connaît déjà ; `nil` sinon | Lit le payload `ConversationLiveCall` |

**Contraintes dures.**
- **Un seul protocole, deux implémentations.** Aucune vue ne sait laquelle est injectée. La bascule de LWS-3/4 change **l'injection**, jamais une ligne d'UI. Garde source : aucun fichier de peau ne nomme `Local…Provider` ni `Gateway…Provider`.
- **Zéro donnée fabriquée.** Un substitut calcule moins, ou rend `nil`. Il n'invente pas. Un pont incomplet **se déclare** incomplet et l'UI dit « sur les N derniers messages » ; un appel inconnu n'est pas affiché, et la section EN DIRECT reste vide plutôt que fausse.
- **Le mock passe les mêmes vecteurs que le vrai.** Un substitut qui divergerait de la loi validerait une UI sur un comportement que le backend ne reproduira pas — c'est le piège que ce workstream doit éviter, pas créer.

**Fichiers de test.** `packages/shared/__tests__/providers/local-bridge-provider.test.ts`, `apps/ios/MeeshyTests/Unit/Lentille/LocalBridgeProviderTests.swift`, `ProviderSubstitutionTests.swift`.

**Critères d'acceptation.**
- `LocalBridgeProvider` et `GatewayBridgeProvider` rendent le **même** objet sur le même jeu de vecteurs, quand la fenêtre du client est complète.
- Fenêtre incomplète ⇒ `isComplete === false` **et** l'UI porte la mention de partialité — vérifié par un test de vue, pas seulement de modèle.
- Aucun appel réseau nouveau : garde — les providers de substitution ne montent aucune requête.
- Basculer l'injection ne change **aucun** snapshot de vue à données égales.

---

### LWS-3 — Préférence de mode de lecture (gateway) — *après la porte V2*

**But.** Faire du mode une préférence **serveur**, multi-appareils, dans le canal versionné existant (E9, workshop A5).

**Fichiers possédés.** `packages/shared/prisma/schema.prisma`, `services/gateway/src/routes/conversation-preferences.ts`.

**Travaux.**
- `readingMode String @default("auto")` sur `UserConversationPreferences` — **jamais** sur `ConversationPreference` (clé/valeur), qui ne porte ni `version` ni le canal de broadcast.
- Schéma de route + `PUT` + payload de `USER_PREFERENCES_UPDATED`, exactement comme `isPinned`/`isMuted`.
- Le `version: { increment: 1 }` **atomique** existant reste tel quel : c'est lui qui rend l'arbitrage optimiste correct, et il a déjà été corrigé une fois d'un read-then-write.

**Fichiers de test.** `services/gateway/src/__tests__/routes/conversation-preferences.readingMode.test.ts`.

**Critères d'acceptation.**
- Valeur hors énumération → 400, la ligne n'est pas écrite.
- Écriture → `version` incrémenté, broadcast émis à **l'utilisateur** (pas aux participants : c'est une préférence privée).
- Un client dont le snapshot local porte un `version` supérieur **ignore** le payload entrant (comportement existant, testé de nouveau ici parce que le champ est neuf).
- `readingMode` absent d'une requête ne l'efface pas (patch partiel).

---

### LWS-4 — Le pont ✦ côté gateway — *après la porte V2*

**But.** Calculer l'étage déterministe et l'attacher aux deux surfaces existantes. Aucun événement nouveau.

**Fichiers possédés.** `services/gateway/src/routes/conversations/core.ts`, `services/gateway/src/socketio/` (émission de `conversation:unread-updated`), plus un service `ConversationBridgeService`.

**Travaux.**
- Composer `bridge` avec `buildBridgeData` (LWS-1) sur les messages non lus du lecteur, **avec ses droits de lecture** — rien de nouveau n'est exposé.
- L'attacher au mapping de `GET /conversations` (`core.ts:537-583`, dans le mapping `:721-842`) et au payload de `conversation:unread-updated`.
- `suggestedMode` = `resolveOrchestratorDecision` (LWS-0) précalculé serveur (workshop A6) — la liste ne le recalcule pas par rang.
- **Le tri et le curseur `before` ne bougent pas.** Le pont est un enrichissement, pas un changement de requête.

**Fichiers de test.** `services/gateway/src/__tests__/services/ConversationBridgeService.test.ts`, `__tests__/routes/conversations.bridge.test.ts`.

**Critères d'acceptation.**
- `unreadCount === 0` ⇒ `bridge` **absent** (pas un objet vide) : un client ancien l'ignore, la Lentille n'affiche rien.
- Le pont ne cite **que** des messages que le lecteur a le droit de voir (test avec un message effacé pour lui, et un message d'avant `clearHistoryBefore`).
- Le coût de la liste ne régresse pas : le pont se calcule **dans** la passe de comptage des non-lus déjà présente (`unreadCountMap`), jamais en N+1.
- Aucun texte de pont n'est **fabriqué** : sans agent, le champ agent est absent et seul l'étage déterministe voyage.

---

### LWS-5 — iOS : miroirs, métriques, greffe du sectionnement

**But.** Poser côté iOS ce dont toutes les vues Lentille dépendront, et brancher la loi de sections sans toucher au pipeline (E6).

**Fichiers possédés.** `Lentille/Core/*.swift`, `ConversationListViewModel.swift` (corps de `groupConversations` **uniquement**).

**Travaux.**
- Miroirs Swift de `conversation-sections.ts` et `conversation-bridge.ts` + suite de vecteurs iOS (ressource de bundle copiée depuis `packages/shared/fixtures/`).
- `LentilleMetrics` : rang 64, avatar 44 (`.conversationHeaderCollapsed`, cf. §0), anneau 1,5, point accent 8, marge 8, padding 10/16, nom `bodySize` heavy, heure 12, ligne 2 `subheadSize`.
- `LentilleFeatureFlag.isEnabled` — `UserDefaults` + surcharge `ProcessInfo` (`MEESHY_FLAG_LENTILLE_LIST`), défaut **OFF**.
- **Corps** de `groupConversations` → appel au miroir. Signature, `nonisolated`, staticité : **inchangées**.

**Fichiers de test.** `apps/ios/MeeshyTests/Unit/Lentille/SectionResolverVectorTests.swift`, `BridgeFormatterVectorTests.swift`, `LentilleMetricsTests.swift`, `LentilleFlagGateTests.swift`.

> **Nommage** — comme pour #3010 WS-0, ces noms de suite ne contiennent aucun des jetons qui basculent une suite en phase 2 du gate (`meeshy.sh:1584`). `SectionResolverVectorTests`, pas `ConversationSectionResolverTests` : le jeton `Conversation` change de phase.

**Critères d'acceptation.**
- Les vecteurs `sections` et `sort` passent **à l'identique** en Swift et en TS.
- Drapeau OFF ⇒ `groupConversations` rend **exactement** les sections d'aujourd'hui (`pinned` + catégories + `other`) : test de snapshot sur un jeu de 30 conversations.
- Le pipeline `CombineLatest4` est intact : garde source — `ConversationListViewModel.swift` contient toujours **une** occurrence de `debounce(for: .milliseconds(16)`.

---

### LWS-6 — iOS : le conteneur sticky *(le workstream le plus risqué)*

**But.** Passer d'un `LazyVStack` de sections plates à un `LazyVStack(pinnedViews: [.sectionHeaders])` de `Section`, **sans perdre** le pliage, le drag & drop ni la mesure de frames (E4).

**Fichiers possédés.** `ConversationListView.swift`, `Lentille/Chrome/*.swift`.

**Travaux, dans cet ordre.**
1. Restructuration `LazyVStack(spacing: 8) { ForEach … }` → `LazyVStack(spacing: 8, pinnedViews: [.sectionHeaders]) { ForEach … { Section { rows } header: { sticker } } }`.
2. `LentilleSticker` en `header:` sous drapeau, `SectionHeaderView` sinon. `expandedSections`, `toggleSection`, `persistCategoryExpansion` : **consommés inchangés**.
3. `SectionDropDelegate` et `SectionFrameRegistry` re-câblés sur le `header:` — le `.onDrop` doit rester sur la **même** vue logique, sinon la cible de drop se décale d'une section.
4. `SectionScrollPill` montée sur le **signal de défilement existant** (`isScrollingDown`), celui qui masque déjà `ConversationListBottomBar` et les boutons flottants. **Un seul détecteur, trois consommateurs** — aucun observateur de scroll nouveau.
5. `StoriesVivantsRail` : fusion `StoryTrayView` + vivants, ≤ 6 entrées, masquée si vide. `PinnedStoryTrailBand` et le routage tap story : **inchangés**.

**Fichiers de test.** `apps/ios/MeeshyTests/Unit/Lentille/StickySectionStructureTests.swift`, `SectionDropTargetTests.swift`, `ScrollPillStateTests.swift`, `LentilleChromeSourceGuardTests.swift`.

**Critères d'acceptation.**
- Pliage : replier une catégorie masque ses rangs et **conserve** son sticker ; l'état survit à un rechargement (`persistCategoryExpansion` appelé une fois, pas deux).
- Drag & drop : déposer une conversation sur le sticker de la catégorie *n* la range dans la catégorie *n* — test sur 4 sections, chacune ciblée.
- Pilule : invisible à l'ouverture, visible au premier événement, invisible 900 ms après l'arrêt (loi LWS-0, pas une réimplémentation).
- Garde source : `ConversationListView.swift` ne contient **aucun** `ScrollViewReader`/observateur de scroll nouveau — le signal existant est réutilisé.
- Drapeau OFF ⇒ rendu identique : les sections ne sont pas épinglées, `SectionHeaderView` est rendu.

---

### LWS-7 — iOS : le rang plat

**But.** Le rang du vol. 5 : plat, sans carte, avatar 44 + anneau accent, `Nom · heure`, ligne 2 = pont ✦ / préview / typing / live.

**Fichiers possédés.** `Lentille/Row/*.swift`, `ConversationListView+Rows.swift` (mux **uniquement**).

**Contrat d'entrée.** `LentilleConversationRow` prend **les mêmes entrées** que `ThemedConversationRow`. Le `==` est **copié puis étendu** au champ `bridge` — pas réécrit : sous-comparer, c'est geler une ligne ; sur-comparer, c'est perdre le portillon.

**Contraintes dures.**
- Le mux vit dans `conversationRow` (`ConversationListView.swift:473`) et dans `ConversationRowItem`. `SwipeableRow` (`+Rows.swift:90`), les menus contextuels des deux chemins OS et le portillon `.equatable()` (`:214`, `:381`) restent **inchangés autour**.
- Tout contrôle interne est un `Button(.plain)` + `.contentShape(Rectangle())`, **jamais** `.onTapGesture` — avalé par le long press du conteneur (régression déjà documentée côté bulle par #3010 WS-4).
- Le rang **ne porte aucun `@State` de langue** : la résolution vient de `resolvedLastMessagePreview(preferredLanguages:)`, jamais d'un cache local.
- **Aucune carte** : ni `backgroundSecondary`, ni gradient de chaleur, ni bordure — la focus card (LWS-8) est la seule carte de l'écran.

**Fichiers de test.** `LentilleRowEquatableTests.swift`, `LentilleRowPrismeTests.swift`, `LentilleRowSourceGuardTests.swift`, `LentilleSkeletonGeometryTests.swift`.

**Critères d'acceptation.**
- **Prisme, règle 3** : prisme `['fr','en']`, message original `en`, traduction `fr` disponible ⇒ la ligne 2 affiche **« Bonjour »**, jamais « Hello ». Aucune traduction correspondante ⇒ l'original, jamais `translations.first`.
- Pont : `unreadCount > 0` **et** `bridge != nil` ⇒ ligne 2 = pont ✦ + point accent 8 ; **aucun badge chiffré nulle part** (garde source : le fichier ne contient pas `unreadBadgeBackground`).
- Précédence de ligne 2 **inchangée** : typing > brouillon > pont > préview.
- Sourdine ⇒ rang à 0,55 d'opacité + 🔕 après le nom (l'affordance manquante relevée à l'audit).
- Squelette : géométrie **exacte** du rang Lentille (avatar 44, deux barres) — aucun saut à l'hydratation, et affiché **uniquement** sur cache vide (règle Instant App).
- Garde source : aucun `.font(.system(size:` dans `Lentille/**` — tout passe par `MeeshyFont.relative` et suit donc Dynamic Type.
- Drapeau OFF ⇒ `ThemedConversationRow` rendu, bit-à-bit identique.

---

### LWS-8 — iOS : perspective, focus card, encoche actionnable, aperçu

**But.** La couche vivante : la perspective au défilement, la carte de focus et son encoche, le menu de mode par trois chemins, l'aperçu long press.

**Fichiers possédés.** `Lentille/Perspective/*.swift`, `Lentille/Mode/*.swift`, `ConversationListView+Overlays.swift`.

**Travaux.**
- `LentillePerspective` par `.visualEffect { content, proxy in }` — **pur, compositor, sans état**. Courbe = `focusCurve(_, .list)` (LWS-0), jamais réécrite.
- Élection de la focus card : `onScrollGeometryChange` (iOS 18+) ; repli iOS 17 par `PreferenceKey` throttlée à 60 Hz. Bande : `bottom − 140 ± 45`.
- Focus card : fond `backgroundSecondary` + ring 1,5 à l'accent **de cette conversation** + chip du mode mémorisé. **Hauteur inchangée** — zéro relayout.
- `LentilleModeMenu` : Auto / Focal / Script / Résumé / Rivière, Rivière **grisée avec sa raison et son seuil réels** (« s'ouvrira à 5 personnes actives — 3 aujourd'hui »), jamais un placeholder. Écriture via le canal préférences (LWS-3), optimiste + rollback.
- Trois points d'entrée, **une** préférence : encoche de la focus card, sous-menu « Mode de lecture » ajouté à `nativeContextMenuView` **après** « Marquer lu », et l'aperçu.
- `LentillePeekView` en `preview:` des **deux** chemins OS. Timings, spring 0.55/0.25 et zone d'exclusion avatar 70 pt : **gelés**.

**Fichiers de test.** `LentillePerspectiveCurveTests.swift`, `FocusCardElectionTests.swift`, `ModeMenuModelTests.swift`, `ModePreferenceRoundTripTests.swift`, `PeekViewModelTests.swift`.

**Critères d'acceptation.**
- Perspective : opacité et échelle **seules** ; garde source — `Lentille/Perspective/` ne contient ni `frame(height:`, ni `invalidate`, ni `layoutIfNeeded`.
- Reduce motion ⇒ toutes les opacités à 1, focus card = **fond seul**, élection conservée.
- La focus card suit le **défilement**, pas les événements : un `message:new` pendant que le pouce est immobile ne déplace pas la carte.
- Encoche : elle affiche « AUTO · <décision courante> » — l'utilisateur voit ce qui **va** se passer, pas une étiquette générique.
- Un mode forcé débraye l'orchestrateur pour cette conversation ; revenir sur 🪄 Auto le réengage — vérifié par aller-retour complet sur le canal préférences.
- Rivière : entrée **toujours présente**, **toujours grisée**, avec la valeur courante réelle composée dans la raison.

---

### LWS-9 — Web : corrections d'écarts, indépendantes du drapeau

**But.** Les corrections que l'audit a révélées et qui n'ont pas à attendre la peau. Livrables immédiatement.

**Fichiers possédés.** `useConversationSorting.ts`, `useConversationFiltering.ts`, `locales/fr/conversations.json`, sélection du cache infini.

**Travaux.**
- Tri → `sortConversations` (LWS-1) sur `lastMessageAt` (E11).
- Recherche → matcher le **préview résolu par le Prisme** en plus du titre : chercher ce que l'utilisateur voit, pas le contenu original.
- **Déduplication par `id`** à la sélection du cache infini (E10) : la pagination par offset duplique une ligne en frontière de page quand un message arrive entre deux pages, et la remontée FLIP de la Lentille rend le défaut visible.
- Désaccord de chemin i18n sur `noConversationsFound` (E14) : aligner l'appel de `EmptyConversations` sur le chemin réel, **après** avoir confirmé la portée effective du `t` injecté. Ne pas ajouter un doublon de clé. Plus les clés neuves du pont et des modes.

**Fichiers de test.** `apps/web/__tests__/hooks/conversations/useConversationSorting.test.ts`, `useConversationFiltering.prisme.test.ts`, `__tests__/hooks/queries/use-conversations-query.dedupe.test.tsx`.

**Critères d'acceptation.**
- Une conversation dont `lastMessage.createdAt` et `lastMessageAt` divergent se classe sur `lastMessageAt`.
- Recherche « Bonjour » trouve une conversation dont l'original est « Hello » et la traduction lue « Bonjour ».
- Deux pages se recouvrant d'une ligne rendent **une** ligne.
- Ces quatre corrections passent **drapeau éteint** : elles ne dépendent pas de la Lentille.

---

### LWS-10 — Web : la peau

**But.** Le rang plat, les stickers, le rail, la pilule, le squelette — derrière le drapeau `lentille_list`.

**Fichiers possédés.** `components/conversations/lentille/*.tsx`, `hooks/lentille/*.ts`, `hooks/use-feature-flags.ts` (extension), `ConversationList.tsx` (mux + typing).

**Le drapeau et sa mise sur `main`** (workshop §6.2 — l'exigence « déployable sur `main`, accessible, sans casser le reste »).

1. **Extension de `useFeatureFlags`.** Le hook actuel ne lit que `process.env.NEXT_PUBLIC_*` : un drapeau de **build**, tout-ou-rien, incapable de donner accès à une personne sans l'imposer à toutes. Il gagne un résolveur pur, **unique décideur** du web :
   ```
   resolveLentilleFlag({ searchParam, cookie, env })
     ?lentille=1 → actif pour ce navigateur + pose le cookie meeshy_lentille=1
     ?lentille=0 → efface le cookie
     cookie      → persiste entre les visites
     env         → NEXT_PUBLIC_LENTILLE_DEFAULT, le jour de l'activation générale
     défaut      → OFF
   ```
2. **Aucune route nouvelle.** `/conversations/[[...id]]` reste la seule route : le paramètre est un modificateur de rendu, pas une destination. Ni câblage dupliqué, ni deuxième copie de l'écran à maintenir.
3. **Dégradation au lieu d'écran blanc.** La sous-arborescence Lentille est enveloppée dans `FeatureErrorBoundary` — qui existe et **accepte un `fallback`** (`FeatureErrorBoundary.tsx:10, :93`) — dont le repli est le rendu **historique**. Une exception en production ramène l'utilisateur à la liste d'aujourd'hui ; il ne voit jamais une page morte.
4. **Coût nul pour qui n'active pas.** Sous-arborescence chargée en `next/dynamic` : drapeau off ⇒ bundle non téléchargé.

> **Garde de contrat, vérifiée en CI** : hors de son résolveur et de ses tests, le nom du drapeau n'apparaît **qu'une fois** — au mux. Une seconde occurrence signifie que la logique a fui hors du point de branchement, et « sans casser le reste » cesse alors d'être garanti par construction.

**Travaux.**
- `LentilleRow` : rang plat 64, avatar 44 + anneau `--row-accent` (issu de `conversation-colors.ts`, LWS-2), dot de présence par `ParticipantPresenceIndicator` réutilisé — **dots aussi pour les groupes** (« quelqu'un d'actif »), offline = **aucun dot**.
- Ligne 2 par `resolveLastMessagePreview` — **exactement** le chemin de `ConversationItem`, dont le test de câblage Prisme reste vert.
- Abonnement typing dans la liste (aujourd'hui `typingUsers` n'atteint jamais `ConversationList`) : même service que le fil, ligne 2 « X écrit… », dot **forcé vert** (typing = preuve d'activité).
- Badge rouge `variant="destructive"` (`ConversationItem.tsx:321`) → **supprimé** : point accent 8 px + pont ✦.
- `useLentillePerspective` : **un seul** `requestAnimationFrame` sur le conteneur, style inline sur un wrapper interne — ne touche ni au layout ni aux mesures.
- `useScrollActivity` : hook factorisé sur `scrollActivityLaw`, consommé par la pilule de section **et** par la pilule du Focal web.

**Fichiers de test.** `__tests__/components/conversations/lentille/LentilleRow.test.tsx`, `LentilleRow.prisme.test.tsx`, `useLentillePerspective.test.ts`, `LentilleSticker.test.tsx`.

**Critères d'acceptation.**
- Drapeau OFF ⇒ `ConversationItem` rendu, snapshot **identique** à aujourd'hui.
- Aucune requête réseau nouvelle : garde — la peau ne monte aucun `useQuery`.
- `prefers-reduced-motion` ⇒ perspective désactivée, focus card = fond seul.
- Contraste : le pont teinté accent (`color-mix(accent 80 %, texte)`) reste ≥ 4,5:1 sur le fond, dans les **deux** thèmes.
- Le rang reste `role="button"` + Enter/Espace ; `aria-label` = « {nom}, {heure}, {n} non lus, {pont ou préview} » ; pilule et stickers `aria-hidden` (l'information de section existe dans l'ordre du DOM).

---

### LWS-11 — Web : menu de mode et aperçu

**But.** L'encoche actionnable et l'aperçu, avec les idiomes du web.

**Fichiers possédés.** `ReadingModeMenu.tsx`, `LentillePeek.tsx`.

**Travaux.**
- Menu : trois entrées, une préférence — encoche de la focus card, item « Mode de lecture » ajouté au dropdown ⋮ existant (`ConversationItemActions`), et l'aperçu. Écriture par `conversation-preferences-store` (optimiste versionnée, comme pin/mute), propagée par `onPreferencesUpdated` multi-onglets et multi-appareils.
- Aperçu : clic droit (`onContextMenu`) **et** appui long tactile (pointer 420 ms, annulé par scroll ou mouvement). Sur desktop, le ⋮ au survol **reste** — l'aperçu s'y ajoute, il ne le remplace pas.

**Fichiers de test.** `ReadingModeMenu.test.tsx`, `LentillePeek.test.tsx`, `conversation-preferences-store.readingMode.test.ts`.

**Critères d'acceptation.**
- Écriture optimiste immédiate, rollback sur échec, réconciliation par `version` (un payload de `version` inférieure est **ignoré**).
- Rivière désactivée avec sa raison réelle si `< 5` participants actifs ou conversation directe.
- Appui long annulé par un scroll de plus de quelques pixels — le tap court n'est **jamais** intercepté.

---

### LWS-12 — Android

**But.** La même Lentille, sur des lois déjà vertes.

**Fichiers possédés.** `apps/android/feature/conversations/**`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/lentille/**`.

**Travaux.**
- Miroirs Kotlin de `conversation-sections.ts` (qui **remplace** `ConversationSections.kt`, aujourd'hui `PINNED/CATEGORY/ALL` — E5/F7), `conversation-bridge.ts`, `reading-modes.ts`, `focus-curve.ts`, `scroll-activity.ts`, plus la suite de vecteurs JUnit.
- **Miroir Kotlin manquant du résolveur d'aperçu du Prisme** (F8) : `ConversationPreviewMessages.kt` documente la règle en commentaire et la ré-applique localement. Il consomme désormais le miroir.
- Peau Compose : rang plat, stickers `stickyHeader`, perspective par `graphicsLayer` (alpha + scale uniquement), pilule, menu de mode.

**Critères d'acceptation.** Les sept fichiers de vecteurs verts en JUnit ; la grille R1 → R13 (§7) rejouée sur Android ; drapeau éteint ⇒ rendu identique.

---

### LWS-13 — Recette croisée

**But.** Livrer les preuves, pas des features. Rien ne ferme tant que ce workstream est rouge.

**Fichiers possédés.** Les suites de recette des trois plateformes, plus `apps/ios/meeshy.sh` (**uniquement** l'ajout des suites de perf à `NON_PHASE_SUITES`).

**Contenu.** Matrice §5.3 du vol. 5 (28 lignes) rejouée drapeau on ; les 13 critères §7 ; Dynamic Type `.accessibility5` sans troncature sur les 8 branches de contenu du rang ; VoiceOver ; contrastes AA ; perf aux Instruments et au profiler navigateur ; snapshots drapeau éteint sur les trois plateformes.

---

## 3. Contrats partagés gelés

> Ces types vivent dans `packages/shared/types/`, propriété LWS-0/LWS-1. Ils sont figés dès leur PR : toute évolution est une modification de contrat, annoncée, pas une édition silencieuse. Les miroirs Swift et Kotlin en dérivent, jamais l'inverse.

### 3.1 Mode de lecture et préférence

```ts
export type ConversationReadingMode =
  | 'focal'    // rangée plate + perspective — défaut sous drapeau
  | 'script'   // même rangée plate, densité uniforme, aucune perspective
  | 'summary'  // Résumé Vivant — l'état d'abord, la preuve à un tap
  | 'river'    // en sursis : présent au catalogue, jamais sélectionnable
  | 'bubbles'; // rendu bulle historique — uniquement drapeau éteint

/** Ce que l'utilisateur a choisi. `auto` rend la main à l'orchestrateur. */
export type ReadingModePreference = 'auto' | 'focal' | 'script' | 'resume' | 'riviere';
```

### 3.2 Le pont ✦ — la forme qui survit au Prisme

C'est ici que ce contrat s'écarte le plus du vol. 5, et la raison mérite d'être lue avant d'être appliquée (E7).

Le vol. 5 fait voyager `text: string` « déjà dans la langue du lecteur ». Une chaîne unique est un **instantané** : elle ne peut pas être re-résolue quand le lecteur change de langue principale, ni quand une traduction atterrit tardivement. Le préview du dernier message ne s'en contente jamais — il voyage avec `translations` **et** `originalLanguage` pour que le client réapplique le Prisme. Le pont doit tenir la même promesse, sans quoi il serait le seul contenu de l'écran figé dans une langue.

```ts
export type ConversationBridgeData = {
  authors: string[];            // 2 au plus
  extraAuthorCount: number;     // le « +N »
  messageCount: number;
  mediaCounts?: { images?: number; audio?: number; files?: number };
};

export type ConversationBridge = {
  kind: 'agent' | 'fallback';
  unreadCount: number;                    // le chiffre vit ICI, plus dans un badge
  suggestedMode: 'focal' | 'resume';      // décision d'orchestrateur précalculée

  /** kind === 'fallback' — des DONNÉES, formatées par l'i18n du client.
   *  Rien à traduire : la phrase naît déjà dans la langue du lecteur. */
  data?: ConversationBridgeData;

  /** kind === 'agent' — une vraie phrase, donc soumise au Prisme.
   *  MÊME paire que `lastMessagePreview` : le client réapplique
   *  `resolveLastMessagePreview()`. Aucune loi de langue nouvelle. */
  text?: string;
  translations?: Record<string, string>;
  originalLanguage?: string;
};
```

**Conséquences, à respecter partout.**
1. L'étage `fallback` n'est **jamais** traduit — il n'a pas de langue. Un changement de langue du lecteur le reformate instantanément, sans aller-retour serveur.
2. L'étage `agent` se résout **exclusivement** par `resolveLastMessagePreview()`. Aucun code du chantier n'écrit une seconde résolution de langue.
3. `bridge` est **absent** — pas vide — quand `unreadCount === 0`. Un client ancien l'ignore ; la Lentille n'affiche rien. Zéro rupture de compatibilité.
4. Les deux étages replient dans `renderFingerprint` (LWS-2), **valeurs de traductions comprises**, clés triées.

### 3.3 Appel en cours (Scène) sur le rang

```ts
export type ConversationLiveCall = {
  voices: number;      // participants qui parlent ou écoutent
  startedAt: string;   // ISO — le client calcule « depuis 12 min » via le ticker 60 s existant
  joined: boolean;     // false → bouton Rejoindre ; true → rien de plus
};
```

Le ticker 60 s (`TimelineView`) existe déjà pour l'heure du rang : il sert la durée d'appel **sans** nouvelle horloge.

---

## 4. Algorithmes cotés

### 4.1 Perspective de liste

```
d      = distance verticale au-dessus de la bande de focus
f      = min(1, d / 520)
alpha  = 1 − 0.45 · f
scale  = 1 − 0.04 · f            (origine horizontale 16 %)
sous la bande : fondu court sur d / 160, plafonné à −0.35
reduce motion : alpha = 1, scale = 1, focus card = fond seul
```

**Invariants.** `transform` et `opacity` **seuls** — jamais une hauteur, jamais une police. Coût O(rangs visibles), zéro allocation dans la passe, aucune invalidation de layout. La hauteur du rang (64) n'apparaît **nulle part** dans la loi : c'est ce qui garantit le « zéro relayout ».

### 4.2 Élection de la focus card

Bande : `bottom − 140 ± 45`. Gagnant : le rang dont le `midY` tombe dans la bande. Hystérésis : le courant garde la main tant qu'il y reste. La carte suit **le défilement**, jamais les événements — un `message:new` ne la déplace pas.

### 4.3 Cotes relevées sur les maquettes

Valeurs lues dans le CSS des deux maquettes. Elles sont **normatives** et vivent dans `LentilleMetrics` (iOS) / les tokens CSS (web) / `LentilleDimens` (Android) — jamais écrites en dur dans une vue.

| Élément | Liste (Lentille) | Fil (Focal) |
|---|---|---|
| Rang | padding `10/16`, marge latérale `8`, radius `16`, `transform-origin: 16% 50%` | padding `5/16` |
| Avatar | `44`, anneau `1.5` à l'accent (55 % d'opacité) | pastille `22` |
| Dot de présence | `11`, bordure `2.5` couleur de fond, **aucun dot hors ligne** | — |
| Nom | `15` extrabold (`800` CSS → `.heavy` Swift) | `13` extrabold |
| Heure | `12`, poids `700` | `12`, poids `600` |
| Ligne 2 / texte | `13` | `15`, interligne `1.42`, retrait `29` |
| Point de non-lu | `8`, couleur accent | — |
| Carte de focus | fond `bg2` + ring **interne** `1.5` accent, radius `16` | idem, marge `3/8`, padding `8/12` |
| Encoche de mode | `9.5` poids `900`, ancrée `top −9`, `right 14` | — |
| Sticker de section / date | `10.5` poids `800`, `letter-spacing .1em`, majuscules, padding `4/13`, sticky | capsule matériau, bord `0.5`, sticky `top 4` |
| Pilule de défilement | ancrée `top 64`, fondu `250 ms`, effacement **900 ms** après l'arrêt | ancrée `top 72`, fondu `280 ms`, idem |
| Rail vivants & stories | pastille `48`, anneau `3.5` (pulsé si live), ≤ 6 entrées | — |
| Citation | — | filet `2.5` couleur de l'auteur cité |
| Médias | — | radius `16` |
| Chrome masqué au défilement | `translateY(94)` + opacité 0, `easeOut .25` — barre de recherche **et** boutons flottants, **un seul signal** | — |
| Tags / favori | pastilles `6` (≤ 3), émoji favori `11`, après le nom | — |
| Sourdine | rang à `0.55` d'opacité + 🔕 | — |
| Agent ✦ | avatar en **pointillé** `1.5` (trait plein = humain), ligne 2 en indigo | rangée pont/agent : bord pointillé `1.5`, radius `14` |

> **Une asymétrie voulue entre les deux écrans — ne pas l'« unifier ».**
> La maquette du fil grossit le texte du message au point (`15 → 16` sur la carte de focus). La maquette de la liste ne grossit **rien** : la hauteur du rang reste `64` et seule l'opacité bouge (« aucun changement de taille de rang — le scan reste net »).
> Ce n'est pas une incohérence : dans le fil, on **lit** un message ; dans la liste, on **scanne** vingt rangs, et une taille qui bouge sous le pouce détruit le balayage. La règle qui les réconcilie est celle de #3010 (écart #3) : **un changement de typographie ne se produit jamais pendant le défilement**. Le fil l'applique à l'arrêt du scroll ; la liste ne l'applique jamais. Un agent qui « harmonise » ces deux comportements casse l'un des deux.

### 4.4 Points de greffe du sectionnement, par plateforme

| Plateforme | Point de greffe | Contrainte |
|---|---|---|
| iOS | corps de `ConversationListViewModel.groupConversations` (`:554`, déjà `nonisolated static` — pur) | Le pipeline `CombineLatest4` + debounce 16 ms (`:496-510`) ne bouge pas |
| Web | `useConversationSorting` → sections dérivées, consommées par `ConversationGroup` | Le cache infini et ses handlers socket ne bougent pas |
| Android | `ConversationSections.of(...)`, dont le corps est remplacé | La signature publique reste, les appelants ne bougent pas |

Trois greffes, une loi. C'est le seul endroit où une plateforme touche au sectionnement.

---

## 5. Recette — les treize critères, par plateforme

Reprise 1:1 du vol. 5 §7, avec le propriétaire de la preuve.

| # | Critère | Preuve | iOS | Web | Android |
|---|---|---|---|---|---|
| R1 | Rangs plats, focus card unique carte de l'écran | snapshot 2 thèmes + garde source | LWS-7 | LWS-10 | LWS-12 |
| R2 | Perspective compositor, hauteur constante, < 1 ms/frame, zéro allocation | Instruments / profiler, 60 et 120 Hz | LWS-8 | LWS-10 | LWS-12 |
| R3 | Pont ✦ affiché si non-lu, éteint à la lecture (y compris depuis un autre appareil), jamais de badge chiffré | test 2 appareils + unitaire du mapping | LWS-7 | LWS-10 | LWS-12 |
| R4 | Prisme par les résolveurs jumeaux exclusivement ; traduction tardive = cross-fade + 🌐 | vecteurs + cas « prisme [fr,en], original en, trad fr → Bonjour » | LWS-7 | LWS-10 | LWS-12 |
| R5 | Temps réel identique à l'actuel (`message:new` FLIP, typing, présence 1/3/5, participants, préférences, delta-sync) | matrice §5.3 rejouée + suites socket existantes vertes | LWS-7/8 | LWS-10 | LWS-12 |
| R6 | Pilule de section : premier événement → visible, 900 ms après l'arrêt → invisible ; stickers corrects aux frontières | vecteurs + test UI | LWS-6 | LWS-10 | LWS-12 |
| R7 | VoiceOver / Dynamic Type / reduced-motion / contrastes AA | Accessibility Inspector + axe-core | LWS-13 | LWS-13 | LWS-13 |
| R8 | Drapeau éteint ⇒ bit-à-bit identique | snapshots | LWS-7 | LWS-10 | LWS-12 |
| R9 | Gestes inchangés drapeau on (swipes, menus 2 chemins, drag & drop, pull-to-refresh, pagination) | passe manuelle + tests existants | LWS-6/8 | LWS-11 | LWS-12 |
| R10 | Écarts d'audit corrigés (mute visible, typing en liste, tri `lastMessageAt`, recherche sur préview résolu, squelettes pixel-stables, i18n) | revue + tests ciblés | LWS-7 | LWS-9 | LWS-12 |
| R11 | Encoche et modes : menu par 3 chemins, mémorisé par conversation, multi-appareils, orchestrateur réengagé sur Auto | test 2 appareils + unitaire versionné | LWS-8 | LWS-11 | LWS-12 |
| R12 | Long press : aperçu + actions rapides sur les 2 chemins iOS, clic droit + appui long web ; tap court jamais intercepté | passe manuelle + test UI | LWS-8 | LWS-11 | LWS-12 |
| R13 | Appel en cours : ● pulsant + « n voix · depuis X », Rejoindre seulement si non rejoint | test manuel + snapshot des 2 états | LWS-8 | LWS-10 | LWS-12 |

**Trois critères s'ajoutent, propres à l'unification** (workshop §8) :

| # | Critère | Preuve |
|---|---|---|
| R14 | Les 7 fichiers de vecteurs sont verts dans les **trois** suites, sur le même commit de `packages/shared/fixtures/` | Jest + XCTest + JUnit |
| R15 | Aucune constante de loi n'est écrite hors `packages/shared/` | garde source sur les trois arbres : aucun `520`, `380`, `0.45`, `0.82`, `900`, `25`, `24` littéral dans un fichier de peau |
| R16 | Le pont survit à un changement de langue du lecteur **sans** aller-retour serveur (étage déterministe) et par re-résolution (étage agent) | test unitaire par plateforme |
| R17 | **Fidélité des cotes** : les métriques rendues par chaque plateforme égalent `lentille-tokens.json` au réglage d'accessibilité par défaut | test de conformité d'anatomie × 3 (workshop §2.5 ②) |
| R18 | **Fidélité comportementale** : les 44 `id` de `behaviour-matrix.json` sont couverts sur chaque plateforme, et le web se comporte comme iOS `id` par `id` | garde d'ensemble (déclarés == couverts) + recette de parité |
| R19 | **Substituts honnêtes** : mock et implémentation gateway rendent le même objet sur les mêmes vecteurs ; une fenêtre incomplète est **affichée** comme telle ; la bascule d'injection ne change aucun snapshot | tests LWS-2bis + diff de snapshots P7 |
| R20 | **Innocuité sur `main`** : drapeau off ⇒ snapshot identique et bundle Lentille non téléchargé ; une exception dans la peau dégrade vers le rendu historique, jamais vers une page morte ; le nom du drapeau n'apparaît qu'une fois hors du résolveur | snapshots + test de boundary + garde source |

---

## 6. Découpage des PR

L'ordre suit les portes du workshop §6.1 : **iOS entier, puis web entier, puis la gateway**.

| PR | Contenu | Dépend de | Peut aller sur `main` ? |
|---|---|---|---|
| **P0** | LWS-9 — corrections d'écarts web, **hors drapeau** | — | **oui, immédiatement** |
| **P1** | LWS-0 + LWS-1 + LWS-2 — lois, types, vecteurs, **tokens**, matrice de conformité, accent TS, portillon SDK | — | oui (aucune UI) |
| **P2** | LWS-2bis — providers de substitution derrière les protocoles définitifs | P1 | oui (aucune UI) |
| **P3** | LWS-5 + LWS-6 + LWS-7 — iOS : miroirs, conteneur sticky, rang plat | P1, P2 | oui, drapeau OFF |
| **P4** | LWS-8 — iOS : perspective, focus card, encoche, aperçu | P3 | oui, drapeau OFF |
| | ▸ **PORTE V1** — recette iOS intégrale sur mocks | P4 | — |
| **P5** | LWS-10 + LWS-11 — web : peau, menu, aperçu, **résolveur de drapeau + boundary + dynamic** | P1, P2, V1 | oui, **dormant et accessible** (§LWS-10) |
| | ▸ **PORTE V2** — recette web intégrale + parité web↔iOS | P5 | — |
| **P6** | LWS-3 + LWS-4 — **gateway** : préférence de mode + pont ✦ réel | V2 | oui (champ optionnel, clients anciens l'ignorent) |
| **P7** | Bascule d'injection : les substituts cèdent la place | P6 | oui — **aucun snapshot de vue ne bouge** |
| **P8** | LWS-12 — Android | P1, V1 | oui, drapeau OFF |
| **P9** | LWS-13 — recette croisée finale, puis **activation** progressive | toutes | non — c'est la fermeture |

**P0 part la première et n'attend rien** : elle corrige des défauts réels du web aujourd'hui (tri sur le mauvais champ, recherche sur le contenu original, ligne dupliquée en frontière de page, chemin i18n désaccordé), sans drapeau et sans décision de design.

**P3 à P5 vont sur `main` drapeau éteint.** Poser le code n'est pas l'activer : dormant, la peau est du code inerte et l'app rend exactement ce qu'elle rend aujourd'hui — prouvé à chaque CI par les snapshots drapeau off. Garder ce travail sur une branche longue serait le vrai risque.
