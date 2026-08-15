# Contrat d'implémentation — Modes de lecture de conversation (Focal · Script · Résumé Vivant)

> **Statut** : contrat d'ingénierie, branche prototype iOS.
> **Sources normatives** : `docs/design/2026-08-15-conversation-modes-use-cases.html` (vol. 2 — orchestrateur, seuils, API agent), `docs/design/2026-08-15-conversation-modes-verdict.html` (vol. 3 — ce qui est gardé), `docs/design/2026-08-15-focal-spec-integration.html` (vol. 4 — la spec d'implémentation).
> **Portée** : iOS uniquement (`apps/ios`, `packages/MeeshySDK`). Le web et Android sont hors périmètre de ce contrat.
> **Public** : agents TDD travaillant en parallèle. Chaque fichier a **un seul propriétaire**. Deux workstreams ne modifient jamais le même fichier.

---

## 0. Préambule — ce que ce contrat corrige dans la spec

La spec (vol. 4 §5) a été écrite contre une lecture idéalisée du code. La reconnaissance sur le vrai dépôt révèle **onze écarts** qui, laissés tels quels, coûteraient des jours. Ils sont corrigés ici et chaque correction est justifiée. Aucun agent ne doit revenir à la formulation d'origine sans repasser par ce document.

| # | Ce que dit la spec | Ce que dit le code réel | Décision de ce contrat |
|---|---|---|---|
| 1 | « inset de tête ≈ `bounds.height − 190` sur `contentInset` » | La collection est inversée (`scaleY:-1`) : `contentInset.top` = **bas visuel**, `contentInset.bottom` = **haut visuel** | L'inset de tête est composé **dans** `applyTopInsetToViews()` sur `contentInset.bottom` (§4.5) |
| 2 | « anchorPoint fixé une fois à (0.16, 1.0) » | Changer `anchorPoint` déplace le layer si `position` n'est pas compensée ; l'inversion parentale inverse le sens de `y` | **Pas de changement d'anchorPoint.** Scale + translation compensatoire sur `layer.transform` (§4.3) |
| 3 | « la cellule la plus proche reçoit `isFocused` via une clé custom de `UICellConfigurationState` » | `UICellConfigurationState` n'est customisé **nulle part** ; le faire impose une sous-classe de cellule et change les 3 génériques de `CellRegistration` | Carte de focus = **décoration `CALayer`** appliquée par le pass (0 invalidation SwiftUI). La typo 15→16 ne bouge **qu'à l'arrêt du scroll** (§4.6) |
| 4 | « orchestrateur à l'`onAppear` de `ConversationView` » | `viewModel.start()` appelle `ConversationReadSignal.markReadLocally` → `unreadCount` vaut **0** dès la première frame | L'orchestrateur décide **dans `ConversationView.init`** (§3.4) |
| 5 | « `@Published var readingMode` sur `ConversationViewModel` » | `ConversationViewModel` fait 4811 lignes et est le point chaud n°1 ; toute nouvelle `@Published` élargit la surface de re-render | Le mode vit sur un **`ReadingModeController` dédié**. `ConversationViewModel.swift` **n'est pas modifié** |
| 6 | « persistance à côté de "My display" (`ConversationPreferencesTab`) » | `ConversationPreferencesTab` est adossé à `ConversationOptionsViewModel`/`APIConversationPreferences` (pin/mute/tags) — aucun champ de lecture, et un aller-retour gateway | Nouveau store local `ReadingModePreferenceStore` (patron `DraftStore`), clé `(scope, conversationId)` (§3.5) |
| 7 | « étendre `MessageDayStickyOverlay` (heure + auto-hide) » | `MessageDayStickyOverlayTests` interdit littéralement la chaîne `isScrollingActive` dans ce fichier et fige `topOffset == 60` | `MessageDayStickyOverlay.swift` **n'est pas touché**. La pilule « jour · heure » est un **nouveau composant** (§WS-2) |
| 8 | « optimiste à 0.7 » | Aucun état d'opacité 0.7 n'existe aujourd'hui ; l'optimiste ne se signale que par le glyphe d'accusé | 0.7 est **introduit** par ce chantier, porté par le plafond d'alpha du pass (§4.4) |
| 9 | « recherche : le résultat défile jusqu'à la bande de focus » | Deux sites dupliqués utilisent `.centeredVertically` (`scrollToMessage` **et** `scrollToMessageFast`) ; `flashCell` écrase `cell.transform` et `cell.alpha` | Les deux sites changent ensemble ; `flashCell` est réécrit en décoration de layer (§4.7) |
| 10 | « pont ✦ rendu par l'observer », « `assist:*` » | `assist:*` n'existe **nulle part** dans le dépôt ; `POST /conversations/:id/agents` n'existe pas | Surfaces agent **stubées derrière un protocole**, provider nul par défaut, **zéro donnée fabriquée** (§6) |
| 11 | « Directe → Résumé si > 25 non-lus » | L'agent exclut les conversations `direct` du scan → `/analysis` renvoie `summary: null` **pour toujours** en 1:1 | Le Résumé a **deux étages** : digest déterministe local (toujours) + enrichissement agent (si non nul) (§6) |

Deux écarts de design (hors code) sont également actés :

- **`Font.Weight.extrabold` n'existe pas** en SwiftUI → le « nom 13 extrabold » devient `MeeshyFont.relative(MeeshyFont.subheadSize, weight: .heavy)`.
- **`MeeshyFont.relative(10.5)` ne rend pas 10.5 pt** : 10 / 10.5 / 11 tombent tous sur `.caption2`. Le pas « méta 10.5 » est donc rendu par `.caption2`. Aucun `@ScaledMetric` dans cette branche — le demi-point n'est pas une information.
- **`✓✓ #A5B4FC` de la spec est un échec WCAG AA** sur `#F8F7FF` (≈ 1,9:1). On garde la paire réelle du dépôt : `indigo400` en sombre / `indigo600` en clair (`BubbleFooter.readColor`).
- **L'accent démo `#31B6BB` est faux** : la vraie formule (troncature `Int()`, pas arrondi) donne **`#31B6BA`**. Aucun hex n'est écrit en dur : on lit `conversation.accentColor`.

---

## 1. Carte des modules

### 1.1 Arborescence des NOUVEAUX fichiers

Tout le chantier vit sous `apps/ios/Meeshy/Features/Main/Focal/`. XcodeGen globe récursivement (`project.yml:146`), **aucune édition manuelle de `project.pbxproj`** — voir §7-R7.

```
apps/ios/Meeshy/Features/Main/Focal/
├── Core/                                          ← WS-0 (propriétaire unique)
│   ├── ConversationReadingMode.swift
│   ├── ConversationCapabilitySet.swift
│   ├── FocalMetrics.swift
│   ├── FocalFocusCurve.swift
│   ├── FocalFocusElector.swift
│   ├── FocalGrouping.swift
│   ├── FocalRowInput.swift
│   ├── ReadingModeOrchestrator.swift
│   ├── ReadingModeCatalog.swift
│   ├── ReadingModePreferenceStoring.swift
│   ├── ScrollTimePillLaw.swift
│   ├── LivingSummaryModels.swift
│   ├── AgentAssistContracts.swift
│   └── ComposerRichTextContracts.swift
├── Preferences/                                   ← WS-1
│   ├── MeeshyFeatureFlags.swift
│   ├── ReadingModePreferenceStore.swift
│   ├── ConversationViewerIdentityResolver.swift
│   ├── ReadingModeController.swift
│   └── MessageAccessibilityLabelComposer.swift
├── Chrome/                                        ← WS-2
│   ├── ScrollTimePillState.swift
│   └── ScrollTimePillOverlay.swift
├── Row/
│   ├── FocalAttachmentBlock.swift                 ← WS-3
│   ├── FocalAudioBlock.swift                      ← WS-3
│   ├── FocalQuotedReplyView.swift                 ← WS-3
│   ├── FocalSystemRows.swift                      ← WS-3
│   ├── FocalRow.swift                             ← WS-4
│   ├── FocalIdentityHeader.swift                  ← WS-4
│   ├── FocalMetaRow.swift                         ← WS-4
│   └── FocalConversationStartRow.swift            ← WS-4
├── Scroll/                                        ← WS-5
│   ├── FocalScrollPass.swift
│   └── FocalFocusDecoration.swift
├── Lens/                                          ← WS-7
│   ├── ReadingModeChip.swift
│   └── ReadingModeLensSheet.swift
├── Summary/
│   ├── EpisodeSegmenter.swift                     ← WS-8
│   ├── DeterministicDigestBuilder.swift           ← WS-8
│   ├── FaceRampRanking.swift                      ← WS-8
│   ├── ConversationAnalysisProviding.swift        ← WS-9
│   ├── LivingSummaryViewModel.swift               ← WS-9
│   ├── LivingSummaryView.swift                    ← WS-9
│   ├── EpisodeListView.swift                      ← WS-9
│   └── FaceRampView.swift                         ← WS-9
└── Agent/                                         ← WS-10
    ├── NullAgentAssistProvider.swift
    ├── AgentAuthoredStyle.swift
    └── FocalBridgeRow.swift
```

### 1.2 Fichiers EXISTANTS modifiés — propriétaire unique

| Fichier existant | Workstream propriétaire | Nature exacte de la modification |
|---|---|---|
| `apps/ios/Meeshy/Features/Main/Views/MessageListViewController.swift` | **WS-6** | Mux de rangée, appels du pass, reset de transform ×3 registrations, `headInset`, 4ᵉ registration `.conversationStart`, hébergement de `ScrollTimePillOverlay`, bande de focus dans les 2 `scrollTo…`, réécriture de `flashCell` |
| `apps/ios/Meeshy/Features/Main/Views/MessageListView.swift` | **WS-6** | Nouvelles props de configuration (`readingMode`, `hasReachedOldest`, `isReduceMotionEnabled`), teardown du pass dans `dismantleUIViewController` |
| `apps/ios/Meeshy/Features/Main/Views/DiffableTypes.swift` | **WS-6** | Ajout du cas `case conversationStart` à `MessageListItem` |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` | **WS-7** | Décision de l'orchestrateur dans `init`, `@StateObject ReadingModeController`, insertion de `ReadingModeChip` dans `headerButtonsCluster`, présentation de `ReadingModeLensSheet`, branchement de `LivingSummaryView`, passage des nouvelles props à `MessageListView` |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+Header.swift` | **WS-7** | Rien de structurel — uniquement si le chip doit s'insérer côté header étendu |
| `apps/ios/MeeshyTests/Unit/Views/ConversationTopChromeFadeTests.swift` | **WS-6** | Mise à jour des gardes source si (et seulement si) une chaîne littérale asserted change |
| `apps/ios/MeeshyTests/Unit/Views/ConversationViewHeaderButtonsClusterTests.swift` | **WS-7** | Mise à jour du compte d'occurrences `headerButtonsCluster` si nécessaire |
| `apps/ios/meeshy.sh` | **WS-11** | Ajout de `FocalScrollPassPerfTests` à `NON_PHASE_SUITES`, rien d'autre |
| `apps/ios/MeeshyTests/Unit/Views/Bubble/MessageDayStickyOverlayTests.swift` | *(personne)* | **Interdit de modifier.** `MessageDayStickyOverlay.swift` n'est pas touché |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` | *(personne)* | **Interdit de modifier.** Le rendu bulle historique reste bit-à-bit identique |
| `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` | *(personne)* | **Interdit de modifier.** Voir écart #5 |

> **Règle d'or** : si un agent se retrouve à devoir éditer un fichier dont il n'est pas propriétaire, il **arrête** et ouvre une demande d'extension de contrat. Il n'édite pas.

### 1.3 Fichiers existants LUS mais jamais modifiés

`BubbleContent.swift`, `BubbleContentBuilder.swift`, `BubbleDeliveryCheck.swift`, `BubbleReactionsOverlay.swift`, `BubbleExpandableText.swift`, `BubbleQuotedReply.swift`, `BubbleStandardLayout+Media.swift` (pour `BubbleGridCell`), `ConversationMediaViews.swift` (pour `AudioMediaView`, `DownloadBadgeView`), `MessageDaySeparator.swift`, `MessageDayLabel.swift`, `MessageDayGrouping.swift`, `MeeshyAvatar.swift`, `PresenceStyle.swift`, `MeeshyColors.swift`, `ThemeManager.swift`, `DesignTokens.swift`, `Accessibility.swift`, `ColorGeneration.swift`, `ConversationAnalysisService.swift`, `MessageStore.swift`, `MessageRecord.swift`.

Ils sont réutilisés **verbatim**. Toute envie de les « améliorer au passage » est hors contrat.

---

## 2. Workstreams

Ordre = ordre de dépendance. Un workstream ne démarre que quand ses dépendances sont mergées.

```
WS-0 ──┬── WS-1 ──┬────────────────────────────┐
       ├── WS-2 ──┤                            │
       ├── WS-3 ──┴── WS-4 ──┐                 │
       ├── WS-5 ─────────────┴── WS-6 ── WS-7 ─┤
       ├── WS-8 ──────────────────── WS-9 ─────┤
       └── WS-10 ─────────────────────────────┴── WS-11
```

---

### WS-0 — Noyau de contrats et lois pures

**But.** Publier, en une seule PR, tous les types de valeur, protocoles et lois pures dont dépendent les onze autres workstreams. Aucune vue, aucun I/O, aucun singleton. C'est le fichier de référence que tout le monde compile.

**Fichiers possédés.** `Focal/Core/*.swift` (14 fichiers, cf. §1.1).

**Types purs à extraire.** Tout §3 de ce document, dans l'ordre d'apparition. Aucune logique ne vit ailleurs : si deux workstreams ont besoin d'une même règle, elle est ici.

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/FocalCurveTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FocalFocusElectorTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FocalGroupingTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/ReadingModeOrchestratorTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/ReadingModeCatalogTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/CapabilitySetTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/ScrollTimePillLawTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/ComposerRichTextModelTests.swift`

> **Nommage** : aucun de ces noms de classe ne contient `Bubble|Message|Conversation|Compose|Language|Draft|Notification|Profile|Translat|Auth|Session` → ils tombent en **phase 1** du gate (`meeshy.sh:1584`), là où aucune suite ne mute `AuthManager.shared`. C'est délibéré. Ne renommez pas en `ConversationEpisodeSegmenterTests` : le token `Conversation` bascule la suite en phase 2.

**Critères d'acceptation (§7 spec).**
- `FocalFocusCurve` : à `d = 400` l'opacité est ≤ 0,20 (`1 − 0.82·min(1, 400/380) = 0.18`) — *« à 400 px au-dessus, il pèse ≤ 20 % d'opacité »*.
- `FocalFocusElector` : une suite de positions oscillant de ±40 px autour de `focusY` ne change **jamais** de gagnant tant que le courant reste dans la bande de 95 px — *« sans à-coup ni oscillation entre deux rangées (hystérésis 95 px) »*.
- `ReadingModeOrchestrator` : les 4 branches de la règle 4 (≤25, >25, absence>24 h ∧ ≥10, choix collant) sont couvertes, plus le cas `isFlagEnabled == false` → `.bubbleLegacy`.
- `ScrollTimePillLaw` : invisible à l'ouverture, visible au premier `scrolled`, invisible exactement `900 ms` après le dernier `scrolled`, timer réarmé par chaque `scrolled` — *« jamais affichée à l'ouverture »*.

---

### WS-1 — Préférences, flag, identité du lecteur, libellé VoiceOver

**But.** Rendre le mode persistable et le lecteur identifiable, et publier le composeur de libellé VoiceOver que la rangée plate devra réutiliser.

**Fichiers possédés.** `Focal/Preferences/*.swift` (5 fichiers).

**Types purs à extraire.**
- `MeeshyFeatureFlags.isReadingModesEnabled` — lecture `UserDefaults` + surcharge `ProcessInfo` (`MEESHY_FLAG_READING_MODES`) pour les tests. Défaut **OFF**.
- `ReadingModePreferenceStore: ReadingModePreferenceStoring` — `UserDefaults`, clés `meeshy_readmode_<scopeKey>_<conversationId>` et `meeshy_lastopen_<scopeKey>_<conversationId>`. Patron `DraftStore` (préfixage par identité **obligatoire** : la fuite privacy multi-comptes de 2026-05-26 est documentée).
- `ConversationViewerIdentityResolver.resolve(authManager:anonymousSession:) -> ConversationViewerIdentity` — **l'unique source de vérité** du branchement invité/inscrit (§5). Fonction pure prenant les deux valeurs, jamais les singletons.
- `MessageAccessibilityLabelComposer.compose(...) -> String` — réplique fidèle des 12 parties de `BubbleStandardLayout.messageAccessibilityLabel` (ordre : `sender → reply → text → images → videos → audios → location/files → time → delivery → edited → pinned → ephemeral → reactions`), en fonction **pure** de `BubbleContent`.
- `ReadingModeController: ObservableObject` — `@Published private(set) var mode`, `@Published private(set) var decision`, `func select(_:)`, `func resetToAuto()`. Injecté avec `ReadingModePreferenceStoring` (défaut `.shared`).

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/ReadingModePreferenceStoreTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/ViewerIdentityResolverTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/A11yLabelComposerTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FeatureFlagGateTests.swift`

**Critères d'acceptation.**
- *« préférence collante par conversation »* : écrire `.script` sur la conversation A ne change pas B ; relire après re-instanciation du store rend `.script`.
- *« revenir en mode auto disponible »* : `setMode(nil, …)` efface la clé ; `mode(for:)` rend `nil` ; l'orchestrateur reprend la main.
- Deux `ReadingModePreferenceScope` distincts (`registered("u1")` vs `anonymous("p1")`) sur la **même** `conversationId` ne se voient pas.
- *« VoiceOver : contenu intégral, ordre chronologique »* : le libellé composé pour un message avec réponse citée + 2 images + réaction contient les 5 segments, dans l'ordre.
- **Flag OFF** ⇒ `MeeshyFeatureFlags.isReadingModesEnabled == false` ⇒ toute décision rend `.bubbleLegacy` — *« l'app est bit-à-bit identique à aujourd'hui »*.

---

### WS-2 — Pilule « jour · heure » au défilement

**But.** Livrer, **sans flag et indépendamment de Focal**, le composant `ScrollTimePill` : « Mercredi · 17:42 », visible pendant le défilement, effacé 900 ms après l'arrêt.

**Fichiers possédés.** `Focal/Chrome/ScrollTimePillState.swift`, `Focal/Chrome/ScrollTimePillOverlay.swift`.

**Contrainte dure.** `MessageDayStickyOverlay.swift` **n'est pas modifié** (garde source `MessageDayStickyOverlayTests` : la chaîne `isScrollingActive` doit rester absente de ce fichier, et `topOffset == 60` est figé). Les deux composants coexistent : le **sticker de date** (sticky, permanent, existant) et la **pilule jour·heure** (transitoire, nouvelle). La spec les décrit d'ailleurs comme deux composants distincts (§3 vol. 4).

**Types purs à extraire.** `ScrollTimePillLaw` est déjà dans WS-0. WS-2 fournit :
- `ScrollTimePillState: ObservableObject` — `@Published var label: String?`, `@Published var isVisible: Bool`, `@Published var isDark: Bool`, `@Published var isHeaderExpanded: Bool`, `func note(_ event: ScrollTimePillLaw.Event)`. **Aucune** dépendance à `UIScrollView`.
- `ScrollTimePillOverlay: View` — capsule `.ultraThinMaterial`, `MeeshyFont.relative(MeeshyFont.subheadSize, weight: .semibold)`, bord 0,5 pt `indigo900/indigo200`, `.animation(.easeInOut(duration: ScrollTimePillLaw.fadeDuration), value: isVisible)`, `.allowsHitTesting(false)`, `.accessibilityHidden(true)`.

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/ScrollTimePillStateTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/ScrollTimePillSourceGuardTests.swift` (assure que `ScrollTimePillOverlay.swift` ne référence ni `UIScrollView` ni `Timer` — le pilotage vient de l'hôte)

**Critères d'acceptation (§7 « Chrono »).**
- *« pilule visible pendant le défilement, invisible 900 ms après l'arrêt, jamais affichée à l'ouverture »* : état initial `isVisible == false` ; `note(.scrolled)` ⇒ `true` ; `note(.tick(at: t+0.899))` ⇒ `true` ; `note(.tick(at: t+0.901))` ⇒ `false` ; un `scrolled` intercalé réarme.
- Masquée quand `isHeaderExpanded` (parité avec le sticker de date).
- Le libellé jour vient de `MessageDayLabel.label(...)`, l'heure de `TimeStringCache` — **aucun `DateFormatter` neuf**.

---

### WS-3 — Blocs riches de la rangée plate

**But.** Fournir les blocs de contenu que `FocalRow` composera, **nus** (sans bulle, sans fond, sans clip de bulle), en réutilisant les composants existants sans les modifier.

**Fichiers possédés.** `Focal/Row/FocalAttachmentBlock.swift`, `FocalAudioBlock.swift`, `FocalQuotedReplyView.swift`, `FocalSystemRows.swift`.

**Portée exacte, par bloc.**

| Bloc | Réutilise | Rendu Focal |
|---|---|---|
| `FocalAttachmentBlock` | `BubbleGridCell` (struct nominale existante), `DownloadBadgeView` | Grilles 1/2/3/4+ **identiques** (`gridMaxWidth 300`, `spacing 2`), `clipShape(RoundedRectangle(cornerRadius: FocalMetrics.mediaRadius /* 16 */))`, posées nues au retrait 29 |
| `FocalAudioBlock` | `AudioMediaView`, `AudioCarouselView` | Rendu sans conteneur bulle ; transcription traduite en italique `.caption` sous le player |
| `FocalQuotedReplyView` | `BubbleQuotedReply(style: .inline)` | Filet 2,5 pt couleur de l'auteur cité, une ligne tronquée, au retrait 29 |
| `FocalSystemRows` | `BubbleSystemNoticeView`, `BubbleDeletedView`, `BubbleCallNoticeView` | Rangées **centrées plates**, sans capsule ; supprimé = rangée fantôme italique sans fond |

**Contrainte dure.** `BubbleGridCell` a été extraite en struct nominale **précisément** pour éviter un crash `swift_getTypeByMangledNameInContextImpl` sur des arbres `_ConditionalContent` profonds (≥ 2 pièces jointes visuelles). **Interdiction d'inliner les branches de grille dans un `@ViewBuilder`.** Chaque bloc est une struct nominale, `Equatable` quand ses entrées le permettent.

**Types purs à extraire.**
- `FocalMediaGridLayout.slots(for count: Int) -> [FocalMediaSlot]` — la géométrie 1/2/3/4+ (largeurs 300 / 149 / 178,8 / 119,2, hauteurs 240 / 180 / 240) devient une fonction pure testable, plutôt qu'un `switch` dans un `body`.
- `FocalAudioRouting.mode(for content: BubbleContent) -> FocalAudioMode` — reproduit `audioIsSoleContent` / `audioHostsReply` / `audioHostsCaption` / carrousel multi-pistes en **une seule** décision énumérée.

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/FocalMediaGridLayoutTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FocalAudioRoutingTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FocalRichBlockEquatableTests.swift`

**Critères d'acceptation (§7 « Temps réel », matrice §5).**
- *« Grilles 1/2/3/4+ conservées (gridMaxWidth 300, spacing 2, radius 16) »* : la table de slots est identique aux valeurs de `BubbleStandardLayout+Media` pour n ∈ {1,2,3,4,7}.
- *« Aucune bulle visible »* : garde source — aucun des 4 fichiers ne contient `BubbleBackground` ni `cornerRadius: 18`.
- *« Transcription traduite en italique sous le player »* : routage audio → une seule décision, jamais deux footers, jamais de caption dupliquée (les 4 modes couverts).

---

### WS-4 — `FocalRow` : la rangée plate

**But.** La rangée du design : pastille 22, `Pseudo · HH:mm` en tête de groupe, texte 15 pleine largeur au retrait 29, méta discrète, **aucune bulle**.

**Fichiers possédés.** `Focal/Row/FocalRow.swift`, `FocalIdentityHeader.swift`, `FocalMetaRow.swift`, `FocalConversationStartRow.swift`.

**Contrat d'entrée.** `FocalRow(input: FocalRowInput, actions: FocalRowActions)` — signature **gelée** par WS-0 (§3.6). `FocalRowInput` est `Equatable` ; `FocalRowActions` en est exclu. La rangée est enveloppée en cellule par `EquatableFocalRow(row:).equatable()` (même topologie que `EquatableMessageBubble` — le gate **ne doit pas** être posé sur `FocalRow` lui-même, régression documentée du 2026-05-25).

**Cotes (§3 vol. 4), toutes via `FocalMetrics` de WS-0.**

| Élément | Valeur | Expression Swift |
|---|---|---|
| Pastille | 22 pt | `MeeshyAvatar(context: .custom(22), storyState: …, enablePulse: false)` |
| Nom | 13, heavy | `MeeshyFont.relative(MeeshyFont.subheadSize, weight: .heavy)` |
| « Toi » | indigo | `MeeshyColors.indigo500` (`#6366F1`) |
| Heure | 12, medium | `MeeshyFont.relative(12, weight: .medium)` + `TimeStringCache` |
| Texte | 15 | `MeeshyFont.relative(MeeshyFont.bodySize)` → `.subheadline` |
| Méta | 10.5 → `.caption2` | `MeeshyFont.relative(10.5)` |
| Retrait | 29 pt | `FocalMetrics.textIndent` (= 22 pastille + 7 gouttière — **hors échelle** `MeeshySpacing`, assumé et centralisé) |
| Interligne | 1,42 | `FocalMetrics.lineSpacing(for: resolvedFontSize)` — **additif**, recalculé par taille (SwiftUI `.lineSpacing` est en points, pas un ratio) |
| Radius média | 16 | `MeeshyRadius.lg` |
| Carte de focus | fond `MeeshyColors.backgroundSecondary(isDark:)`, ring 1,5 accent | rendue par **WS-5**, pas ici |

**Contrainte dure.** `FocalRow` **ne possède aucun `@State` de langue**. La sélection active/secondaire vient de `input` et repart par `actions.onSetActiveDisplayLanguage` (régression `b9a39c2c` : un `@State` invisible à `==` faisait avaler le tap drapeau sur iOS 18+).

**Contrainte dure.** Tout contrôle interne est un `Button(.plain)` + `.contentShape(Rectangle())` + cible ≥ 22 pt, **jamais** `.onTapGesture` (avalé par le `simultaneousGesture(LongPressGesture(0.35))` de `BubbleSwipeContainer`).

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/FocalRowInputEquatableTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FocalRowMetricsTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FocalRowSourceGuardTests.swift`

**Critères d'acceptation (§7).**
- *« Pseudo · HH:mm en tête de groupe uniquement »* : `input.isFirstInGroup == false` ⇒ `FocalIdentityHeader` absent, texte seul au retrait 29.
- *« "Toi" en indigo avec ses ✓✓ »* : `isMe` ⇒ nom = clé `focal.row.you`, tint indigo, `BubbleDeliveryCheck` **dans l'en-tête d'identité**, pas en pied.
- *« Aucune bulle nulle part »* : garde source — `FocalRow.swift` ne contient ni `BubbleBackground` ni `BubbleStandardLayout`.
- *« Dynamic Type XL : la rangée s'étire »* : montage `.accessibility5` sans troncature (harnais §WS-11).
- *« 1 rangée = 1 élément VoiceOver »* : `.accessibilityElement(children: .combine)` + `MessageAccessibilityLabelComposer.compose(...)`.
- *« emoji-only conserve 90/60/45 pt »* : `input.content.text?.emojiFontSize` respecté.
- *« optimiste à 0.7 »* : la rangée **ne** pose **pas** l'opacité ; elle publie `input.isOptimistic` et le plafond est appliqué par WS-5.

---

### WS-5 — `FocalScrollPass` : la perspective

**But.** Le pass transform + alpha, O(cellules visibles), sans allocation, sans invalidation de layout, plus la décoration de carte de focus.

**Fichiers possédés.** `Focal/Scroll/FocalScrollPass.swift`, `Focal/Scroll/FocalFocusDecoration.swift`.

**Contrainte dure.** `FocalScrollPass` **ne connaît pas** `MessageListViewController`, `MessageStore`, ni `MessageListItem`. Il reçoit une `UICollectionView` et une closure de description. C'est ce qui rend WS-5 et WS-6 disjoints.

**API gelée (détaillée en §4.8).**

```swift
@MainActor
final class FocalScrollPass {
    struct CellDescriptor: Equatable {
        let localId: String?          // nil ⇒ la cellule ne participe pas (jour, typing, start)
        let alphaCeiling: CGFloat     // 1.0 normal, 0.7 optimiste
        let allowsFocusCard: Bool
    }
    init(curve: FocalFocusCurve = .standard, decoration: FocalFocusDecoration = .init())
    var isEnabled: Bool                                    // false ⇒ apply() ne fait que reset()
    private(set) var focusedLocalId: String?

    @discardableResult
    func apply(to collectionView: UICollectionView,
               describe: (IndexPath) -> CellDescriptor) -> String?   // renvoie focusedLocalId
    func apply(to cell: UICollectionViewCell, in collectionView: UICollectionView,
               descriptor: CellDescriptor)
    func reset(_ cell: UICollectionViewCell)
    func resetAll(in collectionView: UICollectionView)
}
```

**Types purs à extraire.** Toute l'arithmétique est dans `FocalFocusCurve` / `FocalFocusElector` (WS-0). `FocalScrollPass` ne contient que l'itération et l'écriture `CALayer`/`alpha`. `FocalFocusDecoration` gère un `CALayer` réutilisé par cellule (`NSMapTable<UICollectionViewCell, CALayer>` faible).

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/FocalScrollPassGeometryTests.swift` (double `UICollectionView` monté en fenêtre, 20 cellules factices)
`apps/ios/MeeshyTests/Unit/Focal/FocalFocusDecorationTests.swift`
`apps/ios/MeeshyTests/Performance/FocalScrollPassPerfTests.swift` — **suite exclue du gate** (ajoutée à `NON_PHASE_SUITES` par WS-11), lancée à la main / sur `dev`.

**Critères d'acceptation (§7 « Fluidité »).**
- *« le pass de scroll n'alloue pas »* : `FocalScrollPassPerfTests` mesure `XCTMemoryMetric` sur 200 passes consécutives ; delta ≤ 8 Ko.
- *« < 1 ms/frame »* : 12 cellules visibles, 1000 itérations, moyenne < 1 ms sur simulateur ; validation device sur iPhone 12 hors CI.
- *« aucun relayout »* : garde source — `FocalScrollPass.swift` ne contient ni `invalidateLayout`, ni `setNeedsLayout`, ni `layoutIfNeeded`, ni `reconfigureItems`.
- *« reduced motion → pas de transform »* : `isEnabled == false` ⇒ chaque `apply` remet `identity` / `alpha = alphaCeiling` et **conserve** l'élection de focus (la surbrillance seule subsiste).
- Sur inversion : une cellule dont `visualMidY > focusY` (sous la bande) a `scale == 1` et `alpha == alphaCeiling` — la zone nette existe.

---

### WS-6 — Hôte de défilement

**But.** Brancher tout ce qui précède dans la vraie `UICollectionView` inversée, sans casser un seul invariant existant. C'est le workstream le plus risqué : **un seul agent, un seul fichier chaud**.

**Fichiers possédés.** `MessageListViewController.swift`, `MessageListView.swift`, `DiffableTypes.swift`, plus `ConversationTopChromeFadeTests.swift` en cas de dérive de garde source.

**Travaux, dans cet ordre.**

1. **Reset de transform dans les 3 registrations existantes.** Première ligne de chaque closure : `focalPass.reset(cell)`. Sans cela, une cellule recyclée hérite du transform du précédent occupant (aucune sous-classe, aucun `prepareForReuse` n'existe).
2. **Mux de rangée** dans `messageRegistration` : `if readingMode.usesFlatRow { EquatableFocalRow(row: FocalRow(input:…, actions:…)).equatable() } else { EquatableMessageBubble(bubble: makeThemedBubble(false)).equatable() }`. `BubbleSwipeContainer`, le `.scaleEffect(x:1, y:-1)` et `.nativeMessageContextMenu` restent **inchangés autour**.
3. **Construction de `FocalRowInput`** à partir des `let` déjà snapés (aucun nouveau calcul coûteux).
4. **4ᵉ registration `startRegistration`** pour `MessageListItem.conversationStart` → `FocalConversationStartRow`. Appended **en queue** du tableau d'items (= haut visuel) et **uniquement** quand `hasReachedOldest == true`. Ne jamais insérer en tête : la préservation d'offset au prepend en dépend.
5. **`headInset`** composé dans `applyTopInsetToViews()` (§4.5).
6. **Appels du pass** aux 6 sites de §4.8.
7. **Hébergement de `ScrollTimePillOverlay`** comme second `UIHostingController` enfant, ancré sous la pilule de jour (`topInset + MessageDayStickyPlacement.topOffset + FocalMetrics.timePillGap`). L'expression littérale `constant: topInset + MessageDayStickyPlacement.topOffset` du sticker de jour est **conservée telle quelle** (garde source `ConversationTopChromeFadeTests:119`).
8. **Bande de focus pour la recherche** : `scrollToMessage(localId:)` **et** `scrollToMessageFast(localId:)` remplacent `.centeredVertically` par le calcul d'offset de §4.7. Les deux, ensemble.
9. **`flashCell` réécrit** : plus de `cell.transform`, plus de `cell.alpha` → `FocalFocusDecoration.flash(cell:accent:strong:)`. Sans cela, l'atterrissage de recherche efface la perspective.
10. **`MessageListView`** : nouvelles props **avant** les closures `on…` (contrainte d'ordre de l'init memberwise, documentée `MessageListView.swift:382-387`) : `readingMode: ConversationReadingMode`, `hasReachedOldest: Bool`, `isReduceMotionEnabled: Bool`. Teardown du pass dans `dismantleUIViewController`, à côté de `stopSlowScroll()`.

**Types purs à extraire.** Aucun nouveau — WS-6 **consomme** les lois. Toute tentation d'écrire une formule ici est une erreur de contrat : la formule remonte dans `FocalFocusCurve` (WS-0).

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/FocalHostInsetCompositionTests.swift` (composition `topInset + headInset`, idempotence sous appels répétés)
`apps/ios/MeeshyTests/Unit/Focal/FocalHostSourceGuardTests.swift` (les 6 sites d'appel du pass existent ; `flashCell` ne contient plus `cell.transform`)
`apps/ios/MeeshyTests/Unit/Views/MessageListViewControllerTests.swift` — **existant, non renommé** ; WS-6 y ajoute ses cas.

**Critères d'acceptation (§7).**
- *« Le tout premier message atteint la bande de focus et se lit plein cadre »* : `hasReachedOldest == true` ⇒ `contentInset.bottom == topInset + headInset` et `headInset > 0`.
- *« recherche → focus »* : après `scrollToMessageFast`, `|visualMidY(cible) − focusY| ≤ 8`.
- *« pagination haut inchangée »* : le seuil `distanceFromBottom < 800` et la préservation d'offset au prepend restent valides (test : injecter 50 rangées anciennes, `contentOffset.y` inchangé).
- *« Flag off : l'app est bit-à-bit identique »* : `readingMode == .bubbleLegacy` ⇒ le mux rend `EquatableMessageBubble`, `focalPass.isEnabled == false`, `headInset == 0`, la 4ᵉ registration n'est jamais dequeue.
- *« message entrant : si au fond, la nouvelle rangée naît dans la bande de focus »* : après `applySnapshot` avec auto-scroll, le focus élu est le nouvel item.

---

### WS-7 — Coquille de conversation : Lentille, Aa, orchestrateur

**But.** Décider le mode à l'ouverture, l'exposer, le rendre changeable en un tap, le persister.

**Fichiers possédés.** `ConversationView.swift`, `ConversationView+Header.swift`, `Focal/Lens/ReadingModeChip.swift`, `Focal/Lens/ReadingModeLensSheet.swift`, `ConversationViewHeaderButtonsClusterTests.swift`.

**Travaux.**

1. **Décision dans `init`**, jamais ailleurs (écart #4). `ConversationView.init` lit déjà `conversation?.userState.unreadCount` (ligne 486) — c'est le **seul** endroit où le compteur serveur est vrai.
   ```swift
   let identity = ConversationViewerIdentityResolver.resolve(authManager: .shared, anonymousSession: anonymousSession)
   let store = ReadingModePreferenceStore.shared
   let decision = ReadingModeOrchestrator.decide(.init(
       unreadCount: conversation?.userState.unreadCount ?? 0,
       lastOpenedAt: store.lastOpenedAt(for: convId, scope: identity.scope),
       now: Date(),
       stickyChoice: store.mode(for: convId, scope: identity.scope),
       capabilities: ConversationCapabilitySet.resolve(identity: identity,
                                                       isFlagEnabled: MeeshyFeatureFlags.isReadingModesEnabled,
                                                       conversationType: conversation?.type),
       isFlagEnabled: MeeshyFeatureFlags.isReadingModesEnabled,
       firstUnreadMessageId: nil))
   _readingMode = StateObject(wrappedValue: ReadingModeController(
       decision: decision, conversationId: convId, scope: identity.scope, store: store))
   ```
2. **`store.noteOpened(...)`** dans le `.task` existant, **après** `viewModel.start()`.
3. **Chip de mode** inséré dans `headerButtonsCluster`, **après** `expandedHeaderSearchButton`. Interdiction absolue de l'insérer avant `headerCallButtons.layoutPriority(1)` : `ConversationViewHeaderButtonsClusterTests` grep les 300 premiers caractères après la déclaration. Le compte d'occurrences de la chaîne `headerButtonsCluster` doit rester **exactement 3**.
4. **Bouton `Aa`** adjacent (44×30, `MeeshyRadius.full`) → `controller.select(mode.toggledDensity)`.
5. **Feuille Lentille** (`ReadingModeLensSheet`) : `ReadingModeCatalog.availability(...)` en entrée, un mode par ligne, le courant coché, les indisponibles **grisés avec leur raison et leur seuil réels** (règle 3 vol. 2), plus « revenir en mode auto ».
6. **Montage du Résumé** : `readingMode == .livingSummary` ⇒ `LivingSummaryView` en lieu et place de `MessageListView`, avec « Reprendre le fil » → `controller.select(.focal)`.
7. **Passage des props** à `MessageListView` (déclarées par WS-6).
8. **Type-erasure obligatoire** : toute nouvelle sous-vue insérée dans `floatingHeaderSection` / `expandedHeaderBandBody` est soit une **struct nominale** (`ReadingModeChip`), soit renvoyée en `AnyView`. Les chaînes de types opaques profondes crashent le démangleur au premier rendu device (5 `.ips` documentés).

**Types purs à extraire.** `ReadingModeChipModel` (Equatable : `label`, `accentHex`, `isAuto`) et `LensRowModel` — pour tester la feuille sans la monter.

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/LensSheetModelTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/ReadingModeControllerTests.swift`
`apps/ios/MeeshyTests/Unit/Views/ConversationViewHeaderButtonsClusterTests.swift` (mis à jour si besoin)

**Critères d'acceptation (§7 « Réversibilité »).**
- *« Aa bascule Focal ⇄ Script instantanément »* : `select` écrit la préférence **et** publie le mode dans la même boucle.
- *« Le mode ne change jamais sous vos doigts »* : garde source — `ReadingModeOrchestrator.decide` n'est appelé **qu'une fois**, depuis `init`. Le test grep `ReadingModeOrchestrator.decide` dans `ConversationView.swift` et exige **1** occurrence.
- *« Un mode indisponible n'est jamais un écran vide »* : chaque ligne indisponible porte `reasonKey` **et** `thresholdValue`/`currentValue`.
- *« La Rivière s'ouvrira à 5 personnes actives — 3 aujourd'hui »* : le texte est composé de la vraie valeur courante, jamais d'un placeholder.

---

### WS-8 — Digest déterministe, épisodes, classement de la Rampe

**But.** Toute la matière du Résumé Vivant qui n'a **besoin d'aucun serveur** : segmentation, comptes, classement « besoin de toi ». 100 % pur, 100 % testable sans simulateur, **0 % fabriqué**.

**Fichiers possédés.** `Focal/Summary/EpisodeSegmenter.swift`, `DeterministicDigestBuilder.swift`, `FaceRampRanking.swift`.

**Types purs à extraire.** (modèles déclarés par WS-0, §3.7)
- `EpisodeSegmenter.segment(messages:calendar:locale:) -> [ConversationEpisode]` — coupure sur : trou temporel > `gapThreshold` (6 h), **ou** changement complet de l'ensemble des locuteurs, **ou** franchissement de jour. Fusion des épisodes < `minEpisodeMessages` (4) dans le voisin le plus proche. Plafond `maxEpisodes` (8) par fusion des plus petits. Titre déterministe : `« Lun–Mar · 174 messages »` (libellés `MessageDayLabel`).
- `DeterministicDigestBuilder.build(messages:participants:viewerId:episodes:windowCoversUnread:) -> DeterministicConversationDigest`.
- `FaceRampRanking.rank(entries:now:) -> [FaceRampEntry]` — score **uniquement** sur des signaux réels et vérifiables :
  `mentions de moi non répondues ×5` + `réponses directes à mes messages ×3` + `questions sans réponse de cette personne ×2` + `récence (décroissance sur 7 j) ×1`. Le badge affiché est **le nombre de messages qui m'attendent**, pas le score.

**Contrainte dure d'honnêteté.** `DeterministicConversationDigest.isComplete` vaut `false` dès que la fenêtre `MessageStore` chargée ne couvre pas tout l'intervalle non lu. L'UI **doit** dire « sur les N derniers messages » dans ce cas. Aucun chiffre extrapolé.

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/EpisodeSegmenterTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/DigestBuilderTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FaceRampRankingTests.swift`

**Critères d'acceptation (§7, vol. 2 cas 06·A / 06·B).**
- *« chaque ligne s'ouvre sur les messages qui la prouvent »* : toute entrée du digest porte un `[messageId]` **non vide** ; une entrée sans preuve est rejetée à la construction (invariant testé).
- *« Karim d'abord : il a trois messages sans réponse »* : classement stable, déterministe, tri secondaire alphabétique pour départager (pas de `hashValue`, seed non déterministe entre processus).
- *« 312 messages · 9 personnes »* : les comptes viennent des messages réellement chargés ; si `isComplete == false`, ils sont libellés comme partiels.
- Un segmenteur nourri de 100 messages sur 5 jours produit ≤ 8 épisodes, tous non vides, couvrant l'intégralité des ids sans doublon (test de partition).

---

### WS-9 — Résumé Vivant : UI, Rampe, service d'analyse

**But.** L'écran « je rattrape ». Deux étages : le digest déterministe (toujours) et l'enrichissement agent (seulement si le serveur répond).

**Fichiers possédés.** `Focal/Summary/ConversationAnalysisProviding.swift`, `LivingSummaryViewModel.swift`, `LivingSummaryView.swift`, `EpisodeListView.swift`, `FaceRampView.swift`.

**Contrainte dure.** `ConversationAnalysisService` du SDK **n'a pas de protocole** (violation de la règle TDD iOS). WS-9 crée le protocole côté app :
```swift
protocol ConversationAnalysisProviding: Sendable {
    func fetchAnalysis(conversationId: String) async throws -> ConversationAnalysis
    func fetchStats(conversationId: String) async throws -> ConversationMessageStatsResponse
}
extension ConversationAnalysisService: ConversationAnalysisProviding {}
```
`MockConversationAnalysisProvider` suit le patron `MockMessageService` (`Result<T, Error>`, `…CallCount`, `last…`).

**Contrainte dure — cache-first.** `LivingSummaryViewModel` rend **immédiatement** le digest déterministe (calculé depuis `MessageStore`, déjà en mémoire) puis rafraîchit l'enrichissement agent en arrière-plan. Aucun spinner bloquant quand le digest existe. Squelette **uniquement** sur cache vide.

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/LivingSummaryViewModelTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/FaceRampViewModelTests.swift`

**Critères d'acceptation.**
- `fetchAnalysis` renvoyant `summary: nil` ⇒ **aucune** ligne ✦ n'apparaît, le digest déterministe reste seul, **et l'écran n'est pas vide**.
- `fetchAnalysis` en erreur 403 (invité) ⇒ identique, sans message d'erreur ; l'appel n'est même pas tenté (§5).
- *« répondre à Sarah en moins de 5 secondes, sans jamais voir les 98 autres messages »* : tap sur un visage ⇒ liste filtrée de ses messages qui me concernent ⇒ `onReplyToPerson` remonte à WS-7 qui pré-adresse le composeur.
- Le tri de la Rampe est celui de `FaceRampRanking`, jamais alphabétique.
- *« Reprendre le fil »* rend la main à Focal **à l'endroit vivant** (`controller.select(.focal)` + `scrollToMessage` sur le premier non-lu).

---

### WS-10 — Surfaces agent ✦ (stub) et grammaire pointillée

**But.** Poser l'ossature des surfaces d'assistance **sans jamais inventer de contenu**, et rendre visible la seule information agent réellement disponible aujourd'hui : `messageSource == .agent`.

**Fichiers possédés.** `Focal/Agent/NullAgentAssistProvider.swift`, `AgentAuthoredStyle.swift`, `FocalBridgeRow.swift`.

**Ce qui existe vraiment.** `Message.messageSource` est peuplé de bout en bout (Prisma → `messageSchema` → `APIMessage` → `MeeshyMessage.MessageSource.agent`). C'est le **seul** signal agent disponible.

**Ce qui n'existe pas.** `assist:suggestion`, `assist:summary-patch`, `assist:actions`, `assist:episode`, `POST /conversations/:id/agents`, le rôle `observer`. **Zéro occurrence** dans le dépôt.

**Livrable.**
- `NullAgentAssistProvider: AgentAssistProviding` — renvoie `nil` / `[]` / `[:]`. C'est le provider **par défaut et unique** de cette branche.
- `FocalBridgeRow` — la rangée « pont ✦ ». **Rendue uniquement** si `provider.bridge(for:)` renvoie non-nil. Avec le provider nul : jamais rendue, code mort et assumé.
- `AgentAuthoredStyle` — anneau pointillé + étincelle ✦ appliqués à `FocalIdentityHeader` quand `input.isAgentAuthored`.

**Contrainte produit à escalader avant activation.** Allumer la grammaire ✦ démasque rétroactivement l'animateur de production (`services/agent`), qui poste aujourd'hui **sous l'identité de vrais utilisateurs** dans les conversations `group/channel/public/global`. Ce n'est pas un détail d'implémentation : `AgentAuthoredStyle` est derrière son propre flag `MeeshyFeatureFlags.isAgentGrammarEnabled`, **OFF par défaut**, et son activation requiert une décision produit écrite.

**Fichiers de test.**
`apps/ios/MeeshyTests/Unit/Focal/NullAssistProviderTests.swift`
`apps/ios/MeeshyTests/Unit/Focal/AgentGrammarGateTests.swift`

**Critères d'acceptation.**
- Provider nul ⇒ `FocalBridgeRow` n'est **jamais** instanciée (compteur d'instanciation à 0 dans le VM de test).
- Aucun texte de suggestion n'est présent dans le code (garde source : les fichiers de WS-10 ne contiennent aucune chaîne littérale de plus de 20 caractères hors clés de localisation).
- `isAgentGrammarEnabled == false` ⇒ rendu identique à un message humain.

---

### WS-11 — Recette : performance, Dynamic Type, VoiceOver, gardes source

**But.** La définition de « fini ». Ce workstream ne livre aucune feature : il livre les preuves.

**Fichiers possédés.**
`apps/ios/MeeshyTests/Focal/FocalDynamicTypeTests.swift`
`apps/ios/MeeshyTests/Focal/FocalVoiceOverParityTests.swift`
`apps/ios/MeeshyTests/Focal/FocalNoBubbleSourceGuardTests.swift`
`apps/ios/MeeshyTests/Focal/FocalPaletteContrastTests.swift`
`apps/ios/MeeshyTests/Focal/FocalRealtimeMatrixTests.swift`
`apps/ios/meeshy.sh` — **uniquement** l'ajout de `FocalScrollPassPerfTests` à `NON_PHASE_SUITES`

**Contenu.**
- **Dynamic Type** : reprendre le harnais `mount(_:size:)` / `renderAndCollectLabels` / `assertNoTruncation` de `packages/MeeshySDK/Tests/MeeshyUITests/Timeline/Accessibility/DynamicTypeTests.swift`, appliqué à `FocalRow` en `.accessibility5` sur les 8 branches de la matrice de contenu (texte court, texte 6 lignes, emoji-only, 1 image, 4 images, audio, réponse citée, notice d'appel).
- **Garde « aucune bulle »** : aucun fichier de `Focal/**` ne contient `BubbleBackground`, `BubbleStandardLayout`, `cornerRadius: 18`. Commentaires strippés via `AppSourceGuard.stripComments`. Un scan qui trouve **zéro** fichier doit **échouer** (jamais de vert silencieux).
- **Garde de police fixe** : aucun fichier de `Focal/**` ne contient `.font(.system(size:`.
- **Contraste** : `WCAGContrast` sur les 6 paires du design (texte/fond en clair et sombre, ✓✓ lu, méta, nom) ≥ 4,5:1.
- **Matrice temps réel §5** : 16 lignes, chacune un test de comportement en Focal **et** en Script.
- **Perf** : `FocalScrollPassPerfTests` exclue du gate (comme `MessageListPerformanceTests`), lancée à la main.

**Critères d'acceptation (§7 intégral).** Ce workstream est la traduction 1:1 des six paragraphes de §7 de la spec. Il est le dernier merge, et rien ne ferme le chantier tant qu'il est rouge.

---

## 3. Contrats partagés (Swift, à coder contre avant qu'ils n'existent)

> Tous ces types vivent dans `Focal/Core/`, propriété **WS-0**. Ils sont figés dès la PR WS-0 : toute évolution est une modification de contrat, annoncée, pas une édition silencieuse.
> **Note d'isolation** : le bundle de tests compile en `SWIFT_DEFAULT_ACTOR_ISOLATION: nonisolated` alors que la cible app compile en `MainActor`. Les types purs ci-dessous sont déclarés `nonisolated` explicitement quand ils n'embarquent pas de modèle applicatif ; ceux qui embarquent `BubbleContent` ou `MeeshyMessage` restent `@MainActor`-implicites et ne sont **pas** `Sendable`.

### 3.1 Mode de lecture

```swift
nonisolated public enum ConversationReadingMode: String, Codable, Sendable, CaseIterable {
    /// Rangée plate + perspective au défilement. Défaut sous flag.
    case focal          = "focal"
    /// Même rangée plate, densité uniforme, aucune perspective (bouton Aa).
    case script         = "script"
    /// L'état d'abord, la preuve à un tap.
    case livingSummary  = "summary"
    /// En sursis (vol. 3). Jamais sélectionnable dans cette branche.
    case river          = "river"
    /// Rendu bulle historique. Uniquement quand le flag est OFF.
    case bubbleLegacy   = "bubbles"

    /// true pour focal et script — les deux densités de la rangée plate.
    public var usesFlatRow: Bool { self == .focal || self == .script }
    /// true pour focal seul — script est plat mais sans perspective.
    public var usesPerspective: Bool { self == .focal }
    /// Bascule Aa. Sur les modes non-densité, renvoie soi-même.
    public var toggledDensity: ConversationReadingMode {
        switch self {
        case .focal:  return .script
        case .script: return .focal
        default:      return self
        }
    }
    /// Clé de localisation du nom humain affiché par la Lentille.
    public var titleKey: String { "reading_mode.\(rawValue).title" }
    /// Clé de localisation de la phrase d'explication (une ligne).
    public var subtitleKey: String { "reading_mode.\(rawValue).subtitle" }
}
```

### 3.2 Identité du lecteur et capacités — **la source de vérité du branchement invité**

```swift
nonisolated public enum ConversationViewerIdentity: Equatable, Sendable {
    case registered(userId: String)
    case anonymous(participantId: String)

    public var isAnonymous: Bool { if case .anonymous = self { return true }; return false }
    public var scope: ReadingModePreferenceScope {
        switch self {
        case .registered(let id): return .registered(userId: id)
        case .anonymous(let id):  return .anonymous(participantId: id)
        }
    }
}

nonisolated public struct ConversationCapabilitySet: Equatable, Sendable {
    public let canUseFocal: Bool
    public let canUseScript: Bool
    public let canUseLivingSummary: Bool
    public let canUseFaceRamp: Bool
    public let canUseAgentSurfaces: Bool
    public let canUseRiver: Bool
    public let canPersistPreference: Bool

    /// UNIQUE point de branchement invité/inscrit de tout le chantier.
    /// Toute autre lecture de `anonymousSession != nil` dans le code des
    /// modes de lecture est un bug de contrat.
    public static func resolve(
        identity: ConversationViewerIdentity,
        isFlagEnabled: Bool,
        conversationType: MeeshyConversation.ConversationType?
    ) -> ConversationCapabilitySet
}
```

### 3.3 Courbe de mise au point — le type pur central

```swift
nonisolated public enum FocalHorizontalAnchor: String, Sendable { case leading, center }

nonisolated public struct FocalCellTransform: Equatable, Sendable {
    public let scale: CGFloat
    public let alpha: CGFloat
    /// Translation à écrire dans m41/m42 du CATransform3D, exprimée dans
    /// l'espace de CONTENU de la collection (pré-inversion).
    public let translation: CGSize
    public static let identity = FocalCellTransform(scale: 1, alpha: 1, translation: .zero)
}

nonisolated public struct FocalFocusCurve: Equatable, Sendable {
    /// Hauteur de la bande de focus au-dessus du bas du viewport (spec : 150).
    public let bandLift: CGFloat
    /// Marge minimale entre la bande et le haut du composeur (8).
    public let bandGap: CGFloat
    /// Distance à laquelle l'effet sature (spec : 380).
    public let falloff: CGFloat
    /// Amplitude d'échelle (spec : 0.40 → plancher 0.60).
    public let scaleAmplitude: CGFloat
    /// Amplitude d'opacité (spec : 0.82 → plancher 0.18).
    public let alphaAmplitude: CGFloat
    /// Demi-largeur de la bande d'hystérésis du focus (spec : 95).
    public let focusTolerance: CGFloat

    public static let standard = FocalFocusCurve(
        bandLift: 150, bandGap: 8, falloff: 380,
        scaleAmplitude: 0.40, alphaAmplitude: 0.82, focusTolerance: 95)

    /// Ordonnée ÉCRAN (y descendant depuis le haut du viewport) de la ligne
    /// de focus. `bottomClearance` = collectionView.contentInset.top
    /// (= dégagement composeur/clavier, cf. inversion).
    public func focusY(viewportHeight: CGFloat, bottomClearance: CGFloat) -> CGFloat

    /// Conversion espace de CONTENU → ordonnée ÉCRAN, pour la collection
    /// inversée. Voir §4.2 pour la dérivation.
    public func visualMidY(contentMidY: CGFloat,
                           contentOffsetY: CGFloat,
                           viewportHeight: CGFloat) -> CGFloat

    /// Distance AU-DESSUS de la ligne de focus. 0 pour tout ce qui est
    /// sous la ligne (zone nette).
    public func distance(visualMidY: CGFloat, focusY: CGFloat) -> CGFloat

    public func factor(distance: CGFloat) -> CGFloat        // min(1, d / falloff)
    public func scale(factor f: CGFloat) -> CGFloat         // 1 - scaleAmplitude * f
    public func alpha(factor f: CGFloat) -> CGFloat         // 1 - alphaAmplitude * f

    /// Transform complet, translation compensatoire incluse (§4.3).
    public func transform(distance: CGFloat,
                          cellSize: CGSize,
                          horizontalAnchor: FocalHorizontalAnchor,
                          isRightToLeft: Bool) -> FocalCellTransform

    /// Inset de tête à ajouter à contentInset.bottom pour que le tout
    /// premier message puisse atteindre la bande de focus (§4.5).
    public func headInset(viewportHeight: CGFloat,
                          topInset: CGFloat,
                          firstRowHeight: CGFloat) -> CGFloat
}
```

### 3.4 Élection du focus (hystérésis)

```swift
nonisolated public enum FocalFocusElector {
    public struct Candidate: Equatable, Sendable {
        public let localId: String
        public let visualMidY: CGFloat
        public init(localId: String, visualMidY: CGFloat)
    }

    /// Le courant garde le focus tant qu'il reste dans la bande de
    /// `tolerance` autour de `focusY`. Sinon, le plus proche gagne.
    /// Départage déterministe par localId croissant en cas d'égalité.
    public static func elect(candidates: [Candidate],
                             focusY: CGFloat,
                             tolerance: CGFloat,
                             current: String?) -> String?
}
```

### 3.5 Orchestrateur et préférences

```swift
nonisolated public enum ReadingModeSource: String, Codable, Sendable {
    case auto, manual, flagDisabled, capability
}

nonisolated public struct ReadingModeDecision: Equatable, Sendable {
    public let mode: ConversationReadingMode
    public let source: ReadingModeSource
    /// Pont ✦ inline au-dessus du présent (règle 4, branche ≤ 25).
    public let showsBridge: Bool
    /// Ancre d'ouverture : premier non-lu, ou nil.
    public let anchorMessageId: String?
    /// Clé de localisation expliquant la décision. Jamais de texte libre.
    public let reasonKey: String
}

nonisolated public struct ReadingModeInputs: Equatable, Sendable {
    public let unreadCount: Int
    public let lastOpenedAt: Date?
    public let now: Date
    public let stickyChoice: ConversationReadingMode?
    public let capabilities: ConversationCapabilitySet
    public let isFlagEnabled: Bool
    public let firstUnreadMessageId: String?
}

nonisolated public enum ReadingModeOrchestrator {
    /// Règle 4 vol. 2 : « ≈ 90 secondes de lecture ».
    public static let unreadFocalCeiling = 25
    public static let absenceInterval: TimeInterval = 24 * 3600
    public static let absenceUnreadFloor = 10

    /// Appelée EXACTEMENT UNE FOIS par ouverture, depuis ConversationView.init.
    /// Ordre de résolution :
    ///   1. !isFlagEnabled                                   → .bubbleLegacy / .flagDisabled
    ///   2. stickyChoice non nil ET capable                  → sticky / .manual
    ///   3. !capabilities.canUseLivingSummary                → .focal / .capability
    ///   4. unread > 25                                      → .livingSummary / .auto
    ///   5. absence > 24 h ET unread >= 10                   → .livingSummary / .auto
    ///   6. sinon                                            → .focal (+ bridge si unread > 0) / .auto
    public static func decide(_ inputs: ReadingModeInputs) -> ReadingModeDecision
}

nonisolated public enum ReadingModePreferenceScope: Hashable, Sendable {
    case registered(userId: String)
    case anonymous(participantId: String)
    /// Composant de clé UserDefaults. JAMAIS l'identifiant brut en clair
    /// pour l'anonyme : hash tronqué (fuite privacy multi-comptes).
    public var storageKey: String { get }
}

public protocol ReadingModePreferenceStoring: AnyObject {
    func mode(for conversationId: String, scope: ReadingModePreferenceScope) -> ConversationReadingMode?
    /// nil ⇒ « revenir en mode auto » (efface la clé).
    func setMode(_ mode: ConversationReadingMode?, for conversationId: String, scope: ReadingModePreferenceScope)
    func lastOpenedAt(for conversationId: String, scope: ReadingModePreferenceScope) -> Date?
    func noteOpened(_ conversationId: String, scope: ReadingModePreferenceScope, at date: Date)
}
```

### 3.6 Entrée de rangée

```swift
/// Valeur figée décrivant tout ce dont FocalRow a besoin. Construite par
/// WS-6 dans messageRegistration à partir des `let` déjà snapés — aucun
/// calcul nouveau. Equatable : c'est le gate de re-render.
/// NON Sendable : embarque des modèles applicatifs @MainActor.
public struct FocalRowInput: Equatable {
    public enum Density: String, Equatable { case focal, script }

    public let localId: String
    public let serverId: String?
    public let content: BubbleContent            // réutilisé verbatim
    public let density: Density

    // Identité de tête de groupe
    public let isFirstInGroup: Bool
    public let senderId: String
    public let senderDisplayName: String
    public let senderUsername: String?
    public let senderAvatarURL: String?
    public let senderThumbHash: String?
    public let senderColorHex: String
    public let senderPresence: PresenceState
    public let senderStoryRing: StoryRingState
    public let senderMoodEmoji: String?

    // Contexte visuel (primitifs uniquement — règle « leaf views »)
    public let accentHex: String
    public let isDark: Bool
    public let isDirect: Bool
    public let isRightToLeft: Bool

    // États
    public let isOptimistic: Bool
    public let isAgentAuthored: Bool
    public let showsAgentGrammar: Bool
    public let highlightSearchTerm: String?
    public let mentionDisplayNames: [String: String]
    public let userLanguages: (regional: String?, custom: String?)
    public let activeDisplayLangCode: String?
    public let secondaryLangCode: String?
    public let voiceConsentMissing: Bool

    // Enrichissements audio (mêmes dictionnaires que la bulle)
    public let transcription: String?
    public let translatedAudios: [MessageTranslatedAudio]
    public let allAudioItems: [AudioItem]
    public let conversationName: String

    public static func == (lhs: FocalRowInput, rhs: FocalRowInput) -> Bool
}

/// Sac de callbacks — EXCLU de l'Equatable (patron BubbleFooterActions).
public struct FocalRowActions {
    public var onToggleReaction: ((String) -> Void)?
    public var onAddReaction: ((String) -> Void)?
    public var onOpenReactPicker: ((String) -> Void)?
    public var onShowReactions: ((String) -> Void)?
    public var onShowReadStatus: ((String) -> Void)?
    public var onRetry: ((String) -> Void)?
    public var onReplyTap: ((String) -> Void)?
    public var onStoryReplyTap: ((String) -> Void)?
    public var onMediaTap: ((MessageAttachment) -> Void)?
    public var onConsumeViewOnce: ((String, @escaping (Bool) -> Void) -> Void)?
    public var onReactToAttachment: ((String, String) -> Void)?
    public var onRequestTranslation: ((String, String) -> Void)?
    public var onShowTranslationDetail: ((String) -> Void)?
    public var onSetActiveDisplayLanguage: ((String, String?) -> Void)?
    public var onSetSecondaryLanguage: ((String, String?) -> Void)?
    public var onPlayAudio: ((String) -> Void)?
    public var onOpenProfile: ((ProfileUser) -> Void)?
    public var onViewStory: ((String) -> Void)?
    public var onCallBack: ((String) -> Void)?
    public var onLongPressCallDetail: ((String) -> Void)?
    public init()
}
```

### 3.7 Résumé, épisodes, Rampe

```swift
nonisolated public struct ConversationEpisode: Equatable, Sendable, Identifiable {
    public let id: String
    public let start: Date
    public let end: Date
    public let messageIds: [String]
    public let participantIds: [String]
    /// « Lun–Mar · 174 messages » — composé de MessageDayLabel. TOUJOURS présent.
    public let deterministicTitle: String
    /// Titre produit par l'agent. nil tant qu'aucun agent n'a répondu.
    public let agentTitle: String?
    public var displayTitle: String { agentTitle ?? deterministicTitle }
    public var isAgentTitled: Bool { agentTitle != nil }
}

nonisolated public struct EpisodeInputMessage: Equatable, Sendable {
    public let id: String
    public let senderId: String
    public let createdAt: Date
    public let replyToId: String?
    public let isSystem: Bool
}

nonisolated public enum EpisodeSegmenter {
    public static let gapThreshold: TimeInterval = 6 * 3600
    public static let minEpisodeMessages = 4
    public static let maxEpisodes = 8
    public static func segment(messages: [EpisodeInputMessage],
                               calendar: Calendar,
                               locale: Locale) -> [ConversationEpisode]
}

nonisolated public struct SenderTally: Equatable, Sendable {
    public let userId: String; public let messageCount: Int; public let lastAt: Date
}
nonisolated public struct LanguageTally: Equatable, Sendable {
    public let code: String; public let messageCount: Int
}
nonisolated public struct MediaTally: Equatable, Sendable {
    public let images: Int; public let videos: Int; public let audios: Int
    public let files: Int; public let locations: Int; public let links: Int
}
/// Une chose qui m'attend. TOUJOURS adossée à des messages réels.
nonisolated public struct AwaitingItem: Equatable, Sendable, Identifiable {
    public enum Kind: String, Sendable { case mention, directReply, unansweredQuestion }
    public let id: String
    public let kind: Kind
    public let fromUserId: String
    /// Non vide par construction. Une ligne sans preuve n'est pas produite.
    public let evidenceMessageIds: [String]
    public let at: Date
}

nonisolated public struct DeterministicConversationDigest: Equatable, Sendable {
    public let messageCount: Int
    public let participantCount: Int
    public let start: Date?
    public let end: Date?
    public let topSenders: [SenderTally]
    public let languages: [LanguageTally]
    public let media: MediaTally
    public let awaitingYou: [AwaitingItem]
    public let episodes: [ConversationEpisode]
    /// false ⇒ la fenêtre chargée ne couvre PAS tout le non-lu.
    /// L'UI DOIT alors libeller les chiffres comme partiels.
    public let isComplete: Bool
    public static let empty: DeterministicConversationDigest
}

nonisolated public struct FaceRampEntry: Equatable, Sendable, Identifiable {
    public let id: String                    // userId ou participantId
    public let displayName: String
    public let avatarURL: String?
    public let colorHex: String
    public let presence: PresenceState
    /// Ce qui est AFFICHÉ sur le badge : le nombre de messages qui m'attendent.
    public let awaitingCount: Int
    /// Ce qui SERT AU TRI. Jamais affiché.
    public let needScore: Double
    public let evidenceMessageIds: [String]
}

nonisolated public enum FaceRampRanking {
    public static let mentionWeight: Double = 5
    public static let directReplyWeight: Double = 3
    public static let unansweredQuestionWeight: Double = 2
    public static let recencyWeight: Double = 1
    public static let recencyHalfLife: TimeInterval = 7 * 24 * 3600
    public static func rank(entries: [FaceRampRankingInput], now: Date) -> [FaceRampEntry]
}
```

### 3.8 Surfaces agent

```swift
nonisolated public struct AgentBridgeLine: Equatable, Sendable {
    public let text: String
    public let evidenceMessageIds: [String]   // non vide, sinon rejetée
}
nonisolated public struct AgentSuggestion: Equatable, Sendable, Identifiable {
    public let id: String
    public let text: String
    public let targetMessageId: String?
    public let actionKey: String?
}
nonisolated public struct AgentShortcut: Equatable, Sendable, Identifiable {
    public let id: String
    public let titleKey: String
    public let systemGlyph: String
    public let payload: String
}

public protocol AgentAssistProviding: AnyObject {
    func bridge(for conversationId: String) async -> AgentBridgeLine?
    func suggestions(for conversationId: String, anchoredTo messageId: String) async -> [AgentSuggestion]
    func shortcuts(for conversationId: String, anchoredTo messageId: String) async -> [AgentShortcut]
    func episodeTitles(for conversationId: String, episodes: [ConversationEpisode]) async -> [String: String]
}

/// LE provider de cette branche. Renvoie systématiquement du vide.
public final class NullAgentAssistProvider: AgentAssistProviding { public init() }
```

### 3.9 Pilule de défilement

```swift
nonisolated public enum ScrollTimePillLaw {
    public static let hideDelay: TimeInterval = 0.9
    public static let fadeDuration: TimeInterval = 0.28

    public enum Event: Equatable, Sendable {
        case opened
        case scrolled(at: TimeInterval)
        case tick(at: TimeInterval)
        case headerExpanded(Bool)
    }
    public struct State: Equatable, Sendable {
        public var isVisible: Bool = false
        public var lastScrollAt: TimeInterval? = nil
        public var isHeaderExpanded: Bool = false
        public init()
    }
    public static func reduce(_ state: State, _ event: Event) -> State
}
```

### 3.10 Modèle de composition riche — **déclaré, NON câblé**

> Ce modèle existe pour que le Studio (vol. 2) et une éventuelle barre de formatage puissent atterrir plus tard sans renommage. **Aucune UI de composition n'est modifiée dans cette branche** (vol. 4 : « composer et header inchangés »). Le câbler impliquerait un changement de transport (`Message.content` est un `String` nu ; aucun champ de spans n'existe côté Prisma ni dans `SendMessageRequest`).

```swift
nonisolated public struct ComposerTextSpan: Equatable, Sendable, Codable {
    public enum Style: String, Codable, Sendable {
        case bold, italic, underline, strikethrough
    }
    /// Offsets UTF-16 sur `plainText`.
    public let location: Int
    public let length: Int
    public let style: Style
}

nonisolated public struct ComposerRichTextModel: Equatable, Sendable, Codable {
    public let plainText: String
    public let spans: [ComposerTextSpan]
    public static let empty: ComposerRichTextModel

    /// Sérialise en markdown-dans-le-texte-brut, EXACTEMENT le dialecte que
    /// MessageTextRenderer sait relire : **gras**, *italique*, __souligné__,
    /// ~~barré~~. C'est la seule forme transportable aujourd'hui.
    public func renderedMarkdown() -> String
    /// Inverse de renderedMarkdown. Round-trip garanti par test.
    public static func parse(markdown: String) -> ComposerRichTextModel
}

/// Réconcilie les DEUX sources de vérité actuelles des effets de cycle de
/// vie : les bits 0/1/2 de MessageEffectFlags (écrits par EffectsPickerView)
/// et les trois champs indépendants isBlurred / isViewOnce / expiresAt
/// (écrits par les bascules du ViewModel et seuls transportés).
nonisolated public struct ComposerEffectSelection: Equatable, Sendable {
    public let flags: UInt32
    public let ephemeralSeconds: Int?
    public let isBlurred: Bool
    public let isViewOnce: Bool

    /// Fait gagner les CHAMPS sur les bits (ce sont eux qui voyagent), puis
    /// recompose les bits pour que le bitfield ne mente plus.
    public func normalized() -> ComposerEffectSelection
}
```

### 3.11 Métriques

```swift
nonisolated public enum FocalMetrics {
    public static let avatarSize: CGFloat = 22
    /// 22 (pastille) + 7 (gouttière). Hors échelle MeeshySpacing — assumé,
    /// centralisé ici, jamais re-dérivé ailleurs.
    public static let textIndent: CGFloat = 29
    public static let rowVerticalPadding: CGFloat = 4
    public static let groupTopPadding: CGFloat = 10
    public static let mediaRadius: CGFloat = MeeshyRadius.lg          // 16
    public static let focusCardRadius: CGFloat = MeeshyRadius.lg      // 16
    public static let focusRingWidth: CGFloat = 1.5
    public static let focusCardPaddingV: CGFloat = MeeshySpacing.sm   // 8
    public static let focusCardPaddingH: CGFloat = MeeshySpacing.md   // 12
    public static let focusCardMargin: CGFloat = MeeshySpacing.sm     // 8
    public static let quoteRailWidth: CGFloat = 2.5
    public static let timePillGap: CGFloat = 8
    public static let optimisticAlphaCeiling: CGFloat = 0.7
    /// Estimation de hauteur de rangée passée au layout compositionnel.
    public static let estimatedFlatRowHeight: CGFloat = 64
    /// Interligne ADDITIF (SwiftUI .lineSpacing est en points, pas un ratio).
    /// ratio 1.42 sur une taille résolue s ⇒ s * 0.42, arrondi au demi-point.
    public static func lineSpacing(forResolvedFontSize s: CGFloat) -> CGFloat
}
```

---

## 4. Le pass de perspective — algorithme corrigé pour la géométrie inversée

### 4.1 Rappel de la géométrie réelle

- `collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)` (`MessageListViewController.swift:484`), `contentInsetAdjustmentBehavior = .never` (`:479`).
- Item index **0 = bas visuel** (message le plus récent). L'index croît en montant visuellement vers le passé.
- `contentOffset.y ≈ 0` = **bas visuel**. `contentOffset.y` croissant = on remonte vers l'ancien.
- `contentInset.top` = **dégagement bas visuel** (composeur + clavier), écrit par `applyBottomInset`.
- `contentInset.bottom` = **dégagement haut visuel** (îlot / barre d'état), écrit par `applyTopInsetToViews`.
- Chaque contenu de cellule contre-inverse avec `.scaleEffect(x: 1, y: -1)` **dans le `UIHostingConfiguration`** — jamais sur la `UICollectionViewCell` elle-même. La cellule hérite donc de l'inversion par son ancêtre.

### 4.2 Contenu → écran

Un point à l'ordonnée `contentY` dans l'espace de contenu est à la distance `p = contentY − contentOffset.y` du bord bas du viewport (dans l'espace de contenu, `p ∈ [0, H]` pour ce qui est visible, `H = bounds.height`). L'inversion parentale, symétrie autour du centre de la vue, envoie `p` sur l'écran à :

```
visualY = H − (contentY − contentOffset.y)
```

**Vérification.** Une cellule à `p = 0` (index 0, exactement à l'offset) donne `visualY = H` : le bas de l'écran. C'est bien là que vit le message le plus récent. ✓

C'est exactement `FocalFocusCurve.visualMidY(contentMidY:contentOffsetY:viewportHeight:)`.

> **Pourquoi pas `cell.convert(_:to:)`** — la spec le suggère. C'est correct mais coûteux (une conversion de repère par cellule, par frame) et cela oblige à raisonner sur un transform déjà appliqué (le pass lirait sa propre sortie de la frame précédente). L'arithmétique ci-dessus lit `cell.frame` **non transformé** (la `frame` d'une `UICollectionViewCell` est posée par les `layoutAttributes` et n'est pas affectée par `layer.transform`), ce qui rend le pass **idempotent** : le rejouer deux fois de suite donne le même résultat. C'est indispensable, car il est appelé depuis six sites.

### 4.3 Ligne de focus, distance, échelle, opacité — et la correction d'ancrage

```
focusY  = H − max(bandLift, contentInset.top + bandGap)          // bandLift = 150, bandGap = 8
d       = max(0, focusY − visualMidY)                            // > 0 uniquement AU-DESSUS de la ligne
f       = min(1, d / falloff)                                    // falloff = 380
scale   = 1 − 0.40 · f                                           // ∈ [0.60, 1]
alpha   = min(alphaCeiling, 1 − 0.82 · f)                        // ∈ [0.18, alphaCeiling]
```

**Pourquoi `max(bandLift, contentInset.top + bandGap)` et pas le `bas − 150` de la spec.** Le composeur mesuré fait ~146 pt (`composerHeight` 130 par défaut + 16), valeur qui *croît avec le clavier* et *chute en `previewMode`*. Avec le littéral 150, la ligne de focus tomberait sous le clavier dès qu'il s'ouvre — le message au point deviendrait invisible. La formule retenue reproduit la spec au repos (146 + 8 = 154 ≈ 150) et fait **monter** la bande avec le clavier. Le plancher `bandLift` empêche la bande de coller au bord bas quand le composeur est masqué.

**Correction d'ancrage (écart #2).** La spec demande `anchorPoint = (0.16, 1.0)`, fixé une fois. Trois problèmes : (a) modifier `anchorPoint` déplace le layer si `position` n'est pas recalculée, et les `layoutAttributes` de la collection posent des `frame`, pas des `position` ; (b) sous l'inversion parentale, `anchorPoint.y = 1.0` désigne le bord **haut visuel**, l'inverse de l'intention ; (c) il faudrait un `prepareForReuse`, qui n'existe pas (aucune sous-classe de cellule).

On obtient le même effet **sans toucher `anchorPoint`**, par une translation compensatoire écrite dans le même `CATransform3D`. CoreAnimation utilise la convention vecteur-ligne : `m41/m42/m43` sont les translations appliquées **après** la partie linéaire. Pour une matrice d'échelle pure, poser `m42 = ty` donne `y' = s·y + ty`.

Avec l'`anchorPoint` par défaut `(0.5, 0.5)`, le bord de la cellule à `bounds.y = 0` est à l'offset `−h/2` de l'ancre. Après échelle il est à `−s·h/2`. Pour le laisser en place :

```
ty = −(h / 2) · (1 − s)
```

*Vérification* : `h = 100`, `s = 0.8` ⇒ `ty = −10` ; le bord passe de `−50` → `−40` → `−50`. Inchangé. ✓

Or `bounds.y = 0` d'une cellule est son ordonnée **minimale dans l'espace de contenu**, donc — après inversion — son **bord bas visuel**. C'est précisément l'ancre voulue par la spec (« Ancre de transformation : bas »). ✓

Horizontalement, pour ancrer le bord d'attaque (la colonne pastille/nom) :

```
tx = isRightToLeft ? +(w / 2) · (1 − s) : −(w / 2) · (1 − s)     // anchor .leading
tx = 0                                                            // anchor .center
```

Écriture finale :

```swift
var m = CATransform3DMakeScale(t.scale, t.scale, 1)
m.m41 = t.translation.width
m.m42 = t.translation.height
cell.layer.transform = m
cell.alpha = t.alpha
```

Une échelle pure est symétrique en signe : elle traverse l'inversion parentale inchangée. La **translation**, elle, est exprimée dans l'espace de contenu et non à l'écran — c'est pourquoi `FocalCellTransform.translation` est documenté comme tel, et pourquoi `ty` est négatif alors que l'effet visuel est « le bas reste fixe ».

### 4.4 Plafond d'alpha (envoi optimiste)

`alphaCeiling` vaut `FocalMetrics.optimisticAlphaCeiling` (0,7) pour une rangée optimiste, 1,0 sinon. La spec écrit `alpha = min(0.7, alphaPerspective)` — c'est exactement la formule ci-dessus. Le plafond vit dans le **descripteur** fourni par WS-6, pas dans la rangée : `cell.alpha` appartient au pass, et deux écrivains sur la même propriété est le bug n°1 de ce chantier.

### 4.5 Inset de tête (« Début de la conversation »)

**Il s'agit d'un dégagement HAUT visuel** ⇒ il vit dans `contentInset.bottom`, propriété de `applyTopInsetToViews()`. Il ne doit **jamais** être écrit depuis un second site : `applyTopInset` est ré-invoqué à **chaque** `updateUIViewController` et sa garde `if != topInset` se battrait avec un autre écrivain à chaque tick SwiftUI.

```swift
// MessageListViewController — WS-6
private var topInset: CGFloat = 0     // existant
private var headInset: CGFloat = 0    // nouveau

private func applyTopInsetToViews() {
    let total = topInset + headInset
    if collectionView.contentInset.bottom != total {
        collectionView.contentInset.bottom = total
        collectionView.verticalScrollIndicatorInsets.bottom = total
    }
    // INCHANGÉ — garde source ConversationTopChromeFadeTests:119
    stickyDayTopConstraint?.constant = topInset + MessageDayStickyPlacement.topOffset
}
```

Valeur :

```
headInset = clamp(0, H * 0.8,
                  H − max(bandLift, contentInset.top + bandGap) − topInset − firstRowHeight / 2)
```

*Lecture* : la marge de défilement supplémentaire ajoutée côté ancien vaut exactement `headInset`, puisque `maxOffset = contentSize.height − H + contentInset.bottom`. Elle permet au message le plus ancien de descendre de `headInset` points, ce qui amène son centre depuis `topInset + firstRowHeight/2` jusqu'à `focusY`. Le `bounds.height − 190` de la spec correspond à `bandLift 150 + firstRowHeight/2 ≈ 40`, aux corrections d'inset près.

**Conditions.** `headInset > 0` **uniquement** si `readingMode.usesPerspective && hasReachedOldest`. `hasReachedOldest` est câblé sur `!viewModel.hasOlderMessages` — le **seul** signal fiable de « première page atteinte » (`ConversationViewModel.swift:174`, abaissé exclusivement par une réponse REST). Ne jamais utiliser le `Bool` de retour de `MessageStore.loadOlder(before:)`, qui est cache-only et renvoie `false` dès que la fenêtre GRDB locale est épuisée.

**Piège connu.** `hasOlderMessages` vaut `true` par défaut. Sur une conversation courte jamais paginée, l'inset n'apparaîtrait qu'après le premier aller-retour REST. WS-7 calcule donc la prop comme `!viewModel.hasOlderMessages || (viewModel.messages.count < 200 && !viewModel.isLoadingInitial && !viewModel.isRevalidating)`.

La rangée « Début de la conversation · {date} » est un item diffable `.conversationStart` **appendé en queue** du tableau (= haut visuel), donc à `contentOffset.y` élevé, loin de la zone de prepend. C'est ce qui préserve l'invariant « prepend ne bouge jamais le contenu visible ».

### 4.6 Carte de focus et typographie

**Carte** : `FocalFocusDecoration` maintient, par cellule focalisée, un `CALayer` inséré à l'index 0 de `cell.contentView.layer` — coins `focusCardRadius`, `backgroundColor = MeeshyColors.backgroundSecondary(isDark:)`, `borderWidth = 1.5`, `borderColor = conversation.accentColor`. Écrit dans le même pass, **zéro invalidation SwiftUI**, animable en `CABasicAnimation` d'opacité. Le layer est re-cadré à chaque pass (`layer.frame = cell.contentView.bounds.insetBy(...)`) : la self-sizing `.estimated(…)` fait varier les hauteurs.

**Typographie 15 → 16 (écart #3).** La spec la demande sur la rangée nette. La rendre pilote un relayout SwiftUI, ce qui viole frontalement le critère « le pass n'alloue pas et ne déclenche aucun relayout » de §7. Les deux exigences sont incompatibles **par frame**. Résolution : le grossissement de type n'est appliqué **qu'à l'arrêt du défilement** (`scrollViewDidEndDecelerating` / `didEndDragging(willDecelerate:false)`), par un `reconfigureItems([ancien, nouveau])` + `apply(animatingDifferences: false)` — deux items, jamais plus. Pendant le fling, la différenciation est portée par la carte, l'anneau d'accent, et le fait que la rangée nette est la seule à `scale == 1` / `alpha == 1`.

C'est un choix, pas un oubli : du type qui grossit et rétrécit à 120 Hz pendant un fling est un défaut, pas une qualité.

### 4.7 Atterrissage dans la bande (recherche, saut de citation)

`scrollToMessage(localId:)` (`:1236`) et `scrollToMessageFast(localId:)` (`:1259`) remplacent **tous les deux** `.centeredVertically` par :

```swift
guard let attrs = collectionView.layoutAttributesForItem(at: indexPath) else { return }
let H = collectionView.bounds.height
let focusY = curve.focusY(viewportHeight: H, bottomClearance: collectionView.contentInset.top)
// visualMidY == focusY  ⟺  H − (attrs.center.y − offset) == focusY
let targetOffset = attrs.center.y - (H - focusY)
let minOffset = -collectionView.contentInset.top
let maxOffset = max(minOffset,
                    collectionView.contentSize.height - H + collectionView.contentInset.bottom)
collectionView.setContentOffset(
    CGPoint(x: 0, y: min(max(targetOffset, minOffset), maxOffset)), animated: animated)
```

Puis, **impérativement**, un `focalPass.apply(...)` explicite : un `setContentOffset` programmatique ne déclenche pas `scrollViewDidScroll` de façon fiable (documenté `:1163-1167`).

En mode `.script` / `.bubbleLegacy`, les deux routines conservent `.centeredVertically`.

**`flashCell` réécrit.** Aujourd'hui il écrit `cell.transform = .identity` et `cell.alpha = 1.0` en fin d'animation — ce qui **efface** la perspective sur exactement la cellule où atterrit la recherche. Il devient un flash de décoration :

```swift
FocalFocusDecoration.flash(cell: cell, accentHex: accentColor, strong: strong)
// CABasicAnimation d'opacité sur un layer de surbrillance dédié.
// N'écrit NI cell.transform NI cell.alpha.
```

### 4.8 Les six sites d'appel (aucun n'est optionnel)

| # | Site | Portée | Pourquoi |
|---|---|---|---|
| 1 | `scrollViewDidScroll(_:)`, juste après `setScrollingActive` | toutes les cellules visibles | le cas nominal |
| 2 | `collectionView(_:willDisplay:forItemAt:)` | la cellule entrante seule | `scrollViewDidScroll` ne se déclenche pas quand une cellule se réalise sans changement d'offset |
| 3 | complétion de `dataSource.apply` (`:972-981`) | toutes les cellules visibles | changements de layout programmatiques |
| 4 | fin de `scrollToBottom` / `scrollToMessage` / `scrollToMessageFast` | toutes les cellules visibles | les scrolls programmatiques ne déclenchent pas fiablement `didScroll` |
| 5 | fin de `applyTopInsetToViews` et `applyBottomInset` | toutes les cellules visibles | la ligne de focus dépend de `contentInset.top` |
| 6 | changement de `readingMode` (setter) | `resetAll` puis `apply` | passer en Script doit remettre tout à l'identité |

`slowScrollTick` écrit `contentOffset.y` directement et déclenche donc le site 1 gratuitement — aucun appel supplémentaire.

**Reset obligatoire dans les trois registrations existantes** (première ligne de chaque closure) : aucune sous-classe, aucun `prepareForReuse` — une cellule recyclée hérite sinon du transform de son occupant précédent.

**Filtrage des cellules non éligibles.** `visibleCells` balaie aussi les cellules `.dayHeader`, `.typingIndicator` et `.conversationStart`, indiscernables sans le data source. Le descripteur fourni par WS-6 résout l'`IndexPath` via `dataSource.itemIdentifier(for:)` et renvoie `localId == nil` pour ces trois cas — elles sont **remises à l'identité**, jamais mises à l'échelle. La spec le dit pour le typing (« toujours exclu du pass de perspective ») ; la même règle vaut pour les trois.

### 4.9 Reduce Motion

`FocalScrollPass.isEnabled` est piloté par `MeeshyMotion.shouldReduce(system: UIAccessibility.isReduceMotionEnabled, userForced: <\.meeshyForceReduceMotion>)` — **les deux sources**, pas seulement la clé système. 25+ vues du dépôt lisent la clé système seule et ignorent la bascule in-app ; ce chantier ne reproduit pas ce défaut. `isEnabled == false` ⇒ rendu Script visuel (échelle 1, alpha plafond), focus toujours **élu** et toujours **matérialisé par la carte** — la surbrillance survit, l'animation non.

---

## 5. Invité (X-Session-Token) vs authentifié

### 5.1 Source de vérité unique

`ConversationCapabilitySet.resolve(identity:isFlagEnabled:conversationType:)`, dans `Focal/Core/ConversationCapabilitySet.swift` (WS-0), alimenté par `ConversationViewerIdentityResolver.resolve(authManager:anonymousSession:)` (WS-1).

**Aucun autre point du chantier ne teste `anonymousSession != nil`, `isAnonymous`, ni `authManager.currentUser == nil`.** Une garde source (WS-11) l'exige : les fichiers de `Focal/**` ne contiennent aucune de ces trois expressions, hors `ConversationViewerIdentityResolver.swift`.

### 5.2 Matrice

| Surface | Invité (X-Session-Token) | Authentifié | Fondement |
|---|---|---|---|
| Rangée plate Focal | ✅ | ✅ | rendu 100 % local |
| Perspective au défilement | ✅ | ✅ | rendu 100 % local |
| Densité Script (Aa) | ✅ | ✅ | rendu 100 % local |
| Sticker de date + pilule jour·heure | ✅ | ✅ | `MessageDayLabel` + `TimeStringCache`, locaux |
| Persistance du mode | ✅ scope `.anonymous(participantId)` | ✅ scope `.registered(userId)` | `UserDefaults`, jamais mélangés |
| Lentille (feuille de modes) | ✅ (2 entrées : Focal, Script) | ✅ (jusqu'à 5 entrées) | catalogue filtré par capacités |
| **Résumé Vivant** | ❌ masqué de la Lentille | ✅ | `GET /conversations/:id/stats` et `/analysis` sont `requiredAuth` → **403** pour un invité |
| **Rampe de visages** | ❌ | ✅ | composant du Résumé ; `/participants` serait accessible mais le classement s'appuie sur les mentions, indisponibles (`/mentions/*` = 403) |
| **Épisodes** | ❌ | ✅ | affichés dans le Résumé uniquement |
| **Pont ✦ / suggestions / raccourcis** | ❌ | ❌ *dans cette branche* | provider nul pour tout le monde (§6) |
| **Grammaire ✦ agent** | ❌ | ❌ *par défaut* | flag `isAgentGrammarEnabled` OFF, décision produit en attente |
| **Rivière** | ❌ | ❌ *dans cette branche* | en sursis (vol. 3) — grisée avec seuil réel |
| Scène (appel) | hors périmètre | hors périmètre | vol. 4 : « la Scène reste hors périmètre de cette spec » |

### 5.3 Deux pièges d'identité invité, connus, à contourner sans les « corriger »

1. **`currentUserId == ""` pour un invité.** `AuthManager` n'a aucune gestion anonyme ; `ConversationViewModel.currentUserId` vaut `authManager.currentUser?.id ?? ""`. Conséquence : `toMessage(currentUserId: "")` ne marque **rien** comme `isMe`. Les messages de l'invité s'affichent donc comme reçus. **Ce contrat ne corrige pas ce bug** (il touche `ConversationViewModel`, hors périmètre) : `FocalRowInput` provient de `BubbleContent`, on hérite du comportement existant à l'identique. À traiter en chantier séparé.
2. **Prisme vide pour un invité.** `ConversationLanguagePreferences` lit `authManager.currentUser`, nil pour un invité ⇒ prisme vide ⇒ `preferredTranslation` ne matche jamais ⇒ **l'invité voit toujours les originaux**. C'est le comportement actuel, conservé tel quel. La rangée plate ne le change pas et ne le masque pas.

---

## 6. Règles d'honnêteté

> Ces règles ne sont pas négociables. Un écran qui ment est pire qu'un écran vide.

### 6.1 Ce qui est **déterministe, client-side, 100 % vrai** dans cette branche

| Surface | Calculé depuis | Fichier |
|---|---|---|
| Comptes du digest (messages, personnes, langues, médias, période) | la fenêtre `MessageStore` réellement chargée | `DeterministicDigestBuilder.swift` (WS-8) |
| Épisodes et leurs titres | trous temporels + changement de locuteurs + jours, libellés `MessageDayLabel` | `EpisodeSegmenter.swift` (WS-8) |
| « Ils t'attendent » / Rampe | mentions de moi, réponses directes à mes messages, questions sans réponse, récence | `FaceRampRanking.swift` (WS-8) |
| Présence sur la Rampe | `PresenceManager` + règle 1/3/5 existante | réutilisation |
| Résumé agent (texte, ton, santé, sujets, profils) | `GET /conversations/:id/analysis` — **si et seulement si** `summary != nil` | `LivingSummaryViewModel.swift` (WS-9) |
| Statistiques par participant | `GET /conversations/:id/stats` — endpoint réel, déjà câblé dans le SDK | `LivingSummaryViewModel.swift` (WS-9) |
| Marqueur agent sur un message | `messageSource == .agent` — champ réel, peuplé de bout en bout | `AgentAuthoredStyle.swift` (WS-10) |

### 6.2 Ce qui est **stubé derrière un protocole**, en attente de travail gateway

| Surface | Protocole | Provider de cette branche | Ce qui manque côté serveur |
|---|---|---|---|
| Pont ✦ inline (résumé au-dessus du présent) | `AgentAssistProviding.bridge` | `NullAgentAssistProvider` → `nil` | `assist:summary-patch` : **0 occurrence** dans le dépôt |
| Suggestions de réponse ✦ | `AgentAssistProviding.suggestions` | → `[]` | `assist:suggestion` : inexistant |
| Raccourcis d'action ✦ | `AgentAssistProviding.shortcuts` | → `[]` | `assist:actions` : inexistant |
| Titres d'épisodes par l'agent | `AgentAssistProviding.episodeTitles` | → `[:]` | `assist:episode` : inexistant |
| Attachement d'un agent à une conversation | — | non implémenté | `POST /conversations/:id/agents`, rôle `observer`, modèle de scopes : inexistants |
| Rivière | — | non implémentée | rien à faire côté serveur ; décision produit en sursis (vol. 3) |
| Scène (appel traduit) | — | hors périmètre | hors périmètre |

### 6.3 Les cinq interdits

1. **Aucune donnée fabriquée.** Pas de résumé d'exemple, pas de suggestion de démo, pas de « lorem », pas de compteur arrondi vers le haut. Si la donnée manque, la surface ne se rend pas.
2. **Toute ligne de résumé porte sa preuve.** `AwaitingItem.evidenceMessageIds` et `AgentBridgeLine.evidenceMessageIds` sont **non vides par construction** — une ligne sans preuve est rejetée à la construction, pas filtrée à l'affichage. C'est ce qui rend vraie la promesse « toucher une ligne = voir les messages qui la prouvent ».
3. **Le partiel se dit partiel.** `isComplete == false` ⇒ tout chiffre affiché est libellé « sur les N derniers messages ». Jamais un total présenté comme exhaustif quand la fenêtre ne l'est pas.
4. **Le déterministe et l'agent ne se mélangent pas visuellement.** Trait plein = calculé/humain. Pointillé + ✦ = assistance. Un titre d'épisode déterministe n'emprunte jamais la typographie ✦ (`ConversationEpisode.isAgentTitled` porte la distinction).
5. **Un mode indisponible affiche sa raison et son seuil réels.** « La Rivière s'ouvrira à 5 personnes actives — vous êtes 3 cette semaine » : le 3 est compté, pas inventé. Si le compte n'est pas calculable (fenêtre non chargée), la ligne dit « seuil : 5 personnes actives » sans chiffre courant.

### 6.4 Le composeur

Le modèle `ComposerRichTextModel` / `ComposerEffectSelection` est **déclaré et testé**, mais **aucune UI de composition n'est modifiée** dans cette branche. Justification : `Message.content` est un `String` nu côté Prisma, `SendMessageRequest` ne transporte aucun champ de spans, et `UserMessagePreferences.showFormattingToolbar` n'a **zéro consommateur** dans tout le dépôt. Livrer une barre de formatage sans transport produirait une divergence d'affichage iOS/web sur une seule chaîne de contenu. Le modèle existe pour que le chantier suivant n'ait rien à renommer.

---

## 7. Registre des risques (classé par produit gravité × probabilité)

### R1 — `flashCell` efface la perspective sur la cellule d'atterrissage
**Gravité : haute · Probabilité : certaine si non traité.** `cell.transform` et `cell.layer.transform` sont le **même stockage**. `flashCell` remet `.identity` à la fin de son animation, précisément sur la cellule où la recherche vient d'atterrir — c'est-à-dire la rangée nette.
**Mitigation.** WS-6 réécrit `flashCell` en flash de décoration (`FocalFocusDecoration.flash`), n'écrivant ni `cell.transform` ni `cell.alpha`. Garde source dans `FocalHostSourceGuardTests`.

### R2 — Une cellule recyclée hérite du transform du précédent occupant
**Gravité : haute · Probabilité : certaine si non traité.** Les trois `CellRegistration<UICollectionViewCell, MessageListItem>` n'ont pas de sous-classe, donc pas de `prepareForReuse`, et aucune ne remet un transform.
**Mitigation.** `focalPass.reset(cell)` en **première ligne** des trois closures (WS-6). Garde source : les trois occurrences existent.

### R3 — Le pass balaie les cellules de jour, de typing et de début
**Gravité : moyenne · Probabilité : haute.** Elles vivent dans la même section et sont indiscernables de `visibleCells`.
**Mitigation.** Le descripteur résout l'item via `dataSource.itemIdentifier(for:)` et renvoie `localId == nil` ⇒ remise à l'identité. Test : une snapshot mixte laisse les trois types à `scale == 1`.

### R4 — Les gardes source cassent sur des refactors innocents
**Gravité : moyenne · Probabilité : haute.** `ConversationTopChromeFadeTests` assert les littéraux `contentInsetAdjustmentBehavior = .never`, `func applyTopInset(_ inset: CGFloat)`, `constant: topInset + MessageDayStickyPlacement.topOffset`, `var onScrollingActiveChanged: ((Bool) -> Void)?`, et l'absence de `view.safeAreaInsets.top`. `ConversationViewHeaderButtonsClusterTests` exige **exactement 3** occurrences de `headerButtonsCluster` et grep les 300 premiers caractères après la déclaration. `MessageDayStickyOverlayTests` interdit `isScrollingActive` dans son fichier et fige `topOffset == 60`.
**Mitigation.** Le contrat interdit de toucher `MessageDayStickyOverlay.swift` ; il impose de **conserver** l'expression de contrainte du sticker de jour telle quelle (§4.5) et d'insérer le chip **après** `expandedHeaderSearchButton` (§WS-7-3). WS-6 et WS-7 possèdent respectivement les deux fichiers de test concernés.

### R5 — Aucun test iOS ne tourne sur une PR
**Gravité : haute · Probabilité : certaine.** `ios-tests.yml` est **compile-only** sur `pull_request` (`COMPILE_ONLY: ${{ github.event_name == 'pull_request' }}`), et un méta-garde vitest (`packages/shared/__tests__/ci/ios-pr-compile-gate.test.ts`) l'y maintient. La suite complète ne tourne qu'au `push` sur `dev`. De plus, l'environnement de rédaction de ce contrat est **Linux** : ni `xcodebuild`, ni `xcrun`, ni `xcodegen`, ni `swift`. Rien de Swift n'y est compilable.
**Mitigation.** Chaque workstream déclenche manuellement la suite avant merge : `gh workflow run ios-tests.yml --ref <branche>` (un `workflow_dispatch` n'est pas un `pull_request` ⇒ `COMPILE_ONLY == false` ⇒ suite complète). Aucun agent n'écrit « les tests passent » sans avoir vu le nom de sa classe dans les lignes `Executed`.

### R6 — Un fichier de test non compilé passe au vert par omission
**Gravité : haute · Probabilité : moyenne.** `discover_test_classes()` construit le manifeste `-only-testing` par grep de **sources** ; `xcodebuild` ne se plaint pas d'une classe sélectionnée sans symbole. Incident documenté : « deux commits, 0 symbole dans le bundle, 3 gardes promises jamais exécutées ».
**Mitigation.** `verify_test_classes_are_compiled()` (nm sur `MeeshyTests.xctest`) et `ensure_project_is_current()` couvrent le cas — **mais seulement sur macOS**. Règle de contrat : la preuve de vie d'une suite est son apparition dans la sortie `Executed`, jamais l'absence d'échec.

### R7 — Conflits sur `project.pbxproj` entre agents parallèles
**Gravité : moyenne · Probabilité : haute.** Le fichier est **généré** mais **suivi par git** (5091 lignes), et c'est lui que lisent les builds locaux. Chaque agent exécutant `xcodegen generate` produit une réécriture concurrente.
**Mitigation.** Les agents **créent librement** leurs `.swift` (XcodeGen globe récursivement) et **ne committent jamais** `project.pbxproj`, `Meeshy.xcscheme` ni `Package.resolved`. Une **passe d'intégration finale unique** (dernier merge) exécute `cd apps/ios && xcodegen generate` et ne committe que les lignes de référence ajoutées. C'est déjà la règle worktree du `CLAUDE.md` racine.

### R8 — Budget de performance déjà tendu
**Gravité : haute · Probabilité : moyenne.** Les signposts `cellConfig`, `applySnapshot`, `snapshot.build`, `snapshot.apply` existent parce qu'un `apply` animé en masse a coûté 2136 ms sur 17 applies. `MessageListPerformanceTests` scrolle le vrai VC en 80 pas sur ~2000 messages : c'est le juge.
**Mitigation.** Le pass est O(cellules visibles), sans allocation, sans invalidation de layout ; la carte de focus est une décoration de layer ; le grossissement de type est différé à l'arrêt du scroll (§4.6). Garde source : `FocalScrollPass.swift` ne contient ni `invalidateLayout`, ni `setNeedsLayout`, ni `reconfigureItems`.

### R9 — Le Résumé Vivant est vide sur les conversations directes, **pour toujours**
**Gravité : haute · Probabilité : certaine.** `services/agent` exclut le type `direct` de `getEligibleConversations` ⇒ `AgentConversationSummary` n'a **jamais** de ligne pour un 1:1 ⇒ `/analysis` renvoie `summary: null`. La spec vol. 2 demande pourtant « Directe → Résumé si > 25 non-lus ». La même situation vaut pour toute conversation créée récemment (fenêtre de fraîcheur 22-24 h, budget quotidien 10-25 messages).
**Mitigation.** Architecture à deux étages **dès le premier jour** (§6.1) : le digest déterministe est le rendu par défaut, l'enrichissement agent est un bonus nullable. Test explicite : `fetchAnalysis` renvoyant `summary: nil` ⇒ écran plein et utile.

### R10 — Écart de normalisation du Prisme (`pt-BR`, `en-US`, `FR`)
**Gravité : moyenne · Probabilité : moyenne.** `ConversationLanguagePreferences.resolved` normalise **uniquement** la locale appareil ; `systemLanguage` / `regionalLanguage` / `customDestinationLanguage` passent verbatim, alors que le TS canonique (`resolveUserLanguagesOrdered`) les normalise tous les quatre. Un `systemLanguage = 'pt-BR'` fait donc rater la traduction stockée sous `'pt'` : iOS montre l'original, le web montre la traduction.
**Mitigation.** **Hors périmètre de ce contrat** — le corriger touche `ConversationLanguagePreferences.swift` et modifie aussi le rendu bulle historique. La rangée plate hérite du comportement existant à l'identique (elle consomme `BubbleContent`, construit par le même `BubbleContentBuilder`). À traiter en chantier séparé, en jumelage avec les tests TS.

### R11 — Les rangées invitées ne sont pas marquées « moi »
**Gravité : moyenne · Probabilité : certaine en conversation invitée.** `currentUserId == ""` pour un invité ⇒ rien n'est `isMe` ⇒ les messages de l'invité s'affichent comme reçus, sans accusé.
**Mitigation.** Comportement existant, **conservé à l'identique** (la rangée plate ne l'aggrave ni ne le masque). Documenté ici pour que personne ne le prenne pour une régression Focal. Chantier séparé (`AuthManager` + `AnonymousSessionContext.participantId`).

### R12 — Ancre de mesure du menu long-press et de la barre de réaction rapide
**Gravité : moyenne · Probabilité : moyenne.** `cellFrameInWindow` utilise `cell.convert(cell.bounds, to: nil)`, **affecté** par `layer.transform` ; l'overlay de long-press s'ancre sur `proxy.frame(in: .global)` publié **depuis l'intérieur** de la cellule, qui ne l'est pas de la même façon. Sur une cellule mise à l'échelle, les deux ancres divergent.
**Mitigation.** WS-6 fait précéder tout calcul d'ancre par `focalPass.reset(cell)` sur la seule cellule concernée, calcule l'ancre, puis réapplique le transform à la frame suivante. En pratique la cellule ciblée est presque toujours la rangée nette (`scale == 1`), le cas dégradé est donc rare — mais il doit être traité, pas ignoré.

### R13 — L'`estimated(80)` devient faux
**Gravité : basse · Probabilité : moyenne.** La rangée plate est plus haute (identité en tête de groupe) ou plus basse (lignes suivantes sans identité) que la bulle. `.estimated(80)` gouverne l'item **et** le groupe ; une estimation fausse produit du jitter de position et un décalage du seuil de pagination sur les longs fils.
**Mitigation.** WS-6 ajuste l'estimation à `FocalMetrics.estimatedFlatRowHeight` (64) quand `readingMode.usesFlatRow`, 80 sinon, et le test de pagination de §WS-6 vérifie que la préservation d'offset au prepend tient toujours.

### R14 — Grammaire ✦ : conséquence produit, pas technique
**Gravité : haute (confiance) · Probabilité : faible (flag OFF).** Allumer le marquage `messageSource == .agent` démasque rétroactivement l'animateur de production, qui poste **sous l'identité de vrais utilisateurs** dans les conversations `group/channel/public/global`.
**Mitigation.** `MeeshyFeatureFlags.isAgentGrammarEnabled` OFF par défaut, indépendant de `isReadingModesEnabled`. Activation soumise à une décision produit écrite. Le contrat n'autorise aucun agent à l'activer.

### R15 — Aucun snapshot, aucun test de rendu
**Gravité : moyenne · Probabilité : certaine.** Les ~230 méthodes de test des bulles sont **toutes** de la logique pure (routage, drapeaux, troncature, seuils, Equatable). Une rangée plate peut passer 100 % de la suite et être visuellement fausse.
**Mitigation.** WS-11 livre le harnais Dynamic Type (montage réel en `UIHostingController`, marche des `UILabel`, détection de troncature) sur les 8 branches de la matrice de contenu, plus les gardes source « aucune bulle » / « aucune police fixe » / contraste WCAG. Et la recette §7 exige un passage device manuel sur chaque branche.

---

## 8. Protocole de travail

1. **Une PR par workstream.** Elle contient le code **et** ses tests. Un workstream sans test n'est pas mergeable (TDD non négociable, `CLAUDE.md` racine).
2. **RED d'abord.** Chaque fonction pure de §3 a son test écrit avant son implémentation. Les types de §3 peuvent être créés vides (`fatalError("unimplemented")`) dans la PR WS-0 pour débloquer les autres, à condition que WS-0 les remplisse dans la même PR.
3. **Ne jamais éditer un fichier dont on n'est pas propriétaire** (§1.2). En cas de besoin : arrêt, demande d'extension de contrat.
4. **Ne jamais committer** `project.pbxproj`, `Meeshy.xcscheme`, `Package.resolved` (R7).
5. **Ne jamais déclarer « ça compile » ou « les tests passent »** depuis un environnement sans Xcode (R5). Dire « non vérifié — attente du gate ».
6. **Nommage des suites** : éviter les tokens `Bubble|Message|Conversation|Compose|Language|Draft|Notification|Profile|Translat|Auth|Session` pour les suites de logique pure, afin qu'elles restent en phase 1 du gate.
7. **Toujours `@MainActor` explicite** sur les classes de test qui touchent des types `@MainActor` : le bundle de tests compile en `nonisolated` par défaut, l'app en `MainActor`.
8. **Aucun hex en dur.** L'accent vient de `conversation.accentColor`, les couleurs de `MeeshyColors`. Les 13 hex hors palette de la spec sont refusés à la revue.
9. **Aucune police fixe.** `MeeshyFont.relative(...)` partout ; `.font(.system(size:))` est interdit dans `Focal/**` (garde source WS-11).
10. **Flag OFF = comportement identique.** Chaque PR doit démontrer que, flag éteint, le chemin de rendu est celui d'aujourd'hui, à l'octet près.
11. **Se resynchroniser sur `main` régulièrement.** Douze workstreams avancent en parallèle : une branche qui vit trois jours sans revoir `main` accumule une dette de conflit qui coûtera plus cher que la fonctionnalité elle-même. Chaque agent, chaque worktree :
    - `git fetch origin main && git merge origin/main` **au démarrage** de son workstream, puis **au moins une fois par session de travail**, et **systématiquement avant d'ouvrir sa PR** ;
    - en cas de conflit sur un fichier dont l'agent **n'est pas** propriétaire (§1.2) : prendre la version de `main` sans discuter — la propriété exclusive rend le conflit impossible sur ses propres fichiers, donc un conflit ailleurs signale toujours que `main` a raison ;
    - après une resynchronisation, relancer le gate (`./apps/ios/meeshy.sh test`) avant de pousser : un merge propre au sens de git n'est pas un merge correct au sens du compilateur.

---

*Meeshy · Contrat d'implémentation « Modes de lecture » · dérivé des volumes 2, 3 et 4 du 15 août 2026 et de la reconnaissance de code du dépôt à cette date. Document écrit dans `/home/user/meeshy/tasks/focal-implementation-contract.md`.*