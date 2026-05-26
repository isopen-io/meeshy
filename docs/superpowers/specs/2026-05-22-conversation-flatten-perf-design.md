# Conversation & Messages — Flatten visuel + format date + correctifs perfs

**Date** : 2026-05-22
**Surfaces touchées** : `apps/ios/Meeshy/Features/Main/Views/` (ConversationListView, ThemedConversationRow, MessageListView, ConversationView, dossier Bubble/)
**Hors scope** : stories, profile, settings, calls, web frontend, gateway, translator

## Contexte et motivation

La vue **Liste des Conversations** et la vue **Conversation (fil de messages)** accumulent quatre dettes qui dégradent la fluidité perçue :

1. **Dates relatives ambiguës** au-delà d'une semaine (`"4sem"` ne dit rien de concret à l'utilisateur).
2. **Effets décoratifs lourds** (gradients sur chaque rangée, materials `.ultraThinMaterial`, multiples `.shadow`, springs sur chaque transition) qui consomment du GPU sans apporter de valeur UX.
3. **Métadonnées attachement (durée vidéo, taille fichier) en bottom-trailing**, donc en superposition avec l'heure de la bulle elle-même placée en bottom-trailing du footer.
4. **Points de freeze UI mesurables** : `DateFormatter` recréés à chaque render, `conversationHeat` calculé deux fois par rangée, swipe action labels `String(localized:)` × 12 par rangée non cachés, `ForEach` sans `.equatable()`.

Ce design ne touche ni le SDK MeeshySDK (sauf un `@available(*, deprecated)` informatif sur `MessageRecord.computeTimeString`), ni le backend, ni les surfaces hors liste-conversations/fil-messages.

## Décisions de design (validées avec le PO)

| Décision | Choix retenu | Alternative écartée |
|---|---|---|
| Format date séparateur de jour (≥ J-7) | `"sam. 4 mai '26"` (hybride FR avec apostrophe année toujours présente) | Format français court sans apostrophe ; mix FR/EN du mockup |
| Format date timestamp liste conversations (≥ 7j) | `"04/05/26"` (DD/MM/YY numérique) | Date textuelle longue |
| Format date footer bulle | `"14:32"` toujours (heure seule) — la date est portée par le séparateur de jour | Date complète redondante |
| Blur ephemeral + fogOverlay reveal | **Conservés** (fonctionnels) | Tout supprimer |
| Décorations (gradients, materials, shadows) | **Flatten agressif** sur toute la surface conversation/messages | Garder brand identity ; flatten léger |
| Animations | `.easeOut(duration: 0.18)` standard partout, sauf typing dots et swipe (fonctionnels conservés) | Garder springs |
| Métadonnées attachement | Badge combiné bottom-leading `"durée · taille"` | Statu quo |

---

## Section 1 — Helper `MessageTimeFormatter`

### Emplacement
`apps/ios/Meeshy/Features/Main/Views/MessageTimeFormatter.swift`

À la racine de `Views/` (et **non** sous `Bubble/`) puisqu'il est utilisé par 3 surfaces : liste de conversations, séparateur de jour, footer bulle. Cohérent avec les helpers transversaux existants (`ConversationListHelpers.swift`, `ConversationHelperViews.swift`).

### API publique

```swift
enum MessageTimeFormatter {
    static func listRowLabel(for date: Date, now: Date = Date()) -> String
    static func daySeparatorLabel(
        for date: Date,
        now: Date = Date(),
        calendar: Calendar = .current,
        locale: Locale = Locale(identifier: "fr_FR")
    ) -> String
    static func bubbleTimeLabel(for date: Date) -> String
}
```

### Comportement par méthode

#### `listRowLabel(for:now:)`
| Condition | Sortie |
|---|---|
| `< 60s` | `"maintenant"` |
| `< 1h` | `"5 min"` |
| `< 24h` | `"2h"` |
| `< 7j` | `"3j"` |
| `≥ 7j` | `"04/05/26"` |

#### `daySeparatorLabel(for:now:calendar:locale:)`
| Condition | Sortie |
|---|---|
| Même jour calendaire que `now` | `"Aujourd'hui"` |
| J-1 | `"Hier"` |
| J-2 | `"Avant-hier"` |
| J-3 à J-6 | `"lundi"` (jour de semaine localisé, première lettre majuscule) |
| ≥ J-7 (toutes années) | `"sam. 4 mai '26"` |

#### `bubbleTimeLabel(for:)`
Retourne toujours `"14:32"` (HH:mm), quelle que soit l'ancienneté du message. La date complète est portée par le séparateur de jour au-dessus du groupe.

### Cache statique des `DateFormatter`

Trois `DateFormatter` instanciés une seule fois (lazy `static let`) :

```swift
private extension MessageTimeFormatter {
    static let shortNumericFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "dd/MM/yy"
        return f
    }()
    static let weekdayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.setLocalizedDateFormatFromTemplate("EEEE")
        return f
    }()
    static let weekdayShortDayMonthYearFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "EEE. d MMM ''yy"
        return f
    }()
    static let timeOnlyFormatter: DateFormatter = {
        let f = DateFormatter()
        f.locale = Locale(identifier: "fr_FR")
        f.dateFormat = "HH:mm"
        return f
    }()
}
```

### Locale forcée `fr_FR`

`Locale(identifier: "fr_FR")` plutôt que `Locale.current`. Conformément à la règle Prisme Linguistique de `CLAUDE.md` racine : la locale appareil ne doit jamais déterminer la langue de contenu/UI affichée. Un utilisateur sur iPhone EN doit voir `"sam. 4 mai '26"`, pas `"Sat. 4 May '26"`.

### Tests (XCTest pur, sans `@MainActor`)

Fichier `apps/ios/MeeshyTests/MessageTimeFormatterTests.swift` :

- `test_listRowLabel_lessThanMinute_returnsMaintenant`
- `test_listRowLabel_under1h_returnsMinutes`
- `test_listRowLabel_under24h_returnsHours`
- `test_listRowLabel_under7d_returnsDays`
- `test_listRowLabel_atOrAfter7d_returnsShortNumericDate` (vérifie format `"04/05/26"`)
- `test_daySeparatorLabel_today_returnsAujourdhui`
- `test_daySeparatorLabel_yesterday_returnsHier`
- `test_daySeparatorLabel_dayBeforeYesterday_returnsAvantHier`
- `test_daySeparatorLabel_threeToSixDaysAgo_returnsWeekday`
- `test_daySeparatorLabel_atOrAfter7d_returnsHybridDate` (vérifie format `"sam. 4 mai '26"`)
- `test_daySeparatorLabel_acrossYearBoundary_keepsApostropheYear` (cas 31 déc → 1 janv)
- `test_bubbleTimeLabel_returnsHourMinute`
- `test_formattersAreCached_singleInstanceAcrossCalls`

Tous les tests injectent `now` explicitement pour déterminisme.

---

## Section 2 — Intégration dans les vues existantes

### 2.1 — `BubbleContentBuilder.swift:155`

**Avant** :
```swift
let resolvedTimeString = timeString ?? message.cachedTimeString ?? ""
```

**Après** :
```swift
let resolvedTimeString = timeString ?? MessageTimeFormatter.bubbleTimeLabel(for: message.createdAt)
```

Le champ DB `cachedTimeString` (colonne GRDB persistée, cf. `MessageDatabaseMigrations.swift:200`) n'est plus lu côté affichage. Il reste écrit pour rétro-compat mais devient orphelin. Hors scope : drop de la colonne (migration future).

### 2.2 — `MessageRecord.computeTimeString` deprecation

`packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift:187` :

```swift
@available(*, deprecated, message: "Use MessageTimeFormatter.bubbleTimeLabel(for:) at render time — cached value not used since 2026-05-22 (format remains static HH:mm so cache is still valid for legacy readers).")
public static func computeTimeString(for date: Date) -> String {
    TimeStringCache.shared.format(date)
}
```

Le commentaire indique aux futurs lecteurs pourquoi la fonction n'est plus utilisée et pourquoi on ne la supprime pas (rétro-compat avec la colonne GRDB).

### 2.3 — `ThemedConversationRow.swift:351-358`

Suppression de la fonction locale `timeAgo(_:)`. Remplacement des appels lignes 165-169 :

```swift
Text(MessageTimeFormatter.listRowLabel(for: conversation.lastMessageAt))
```

Idem ligne 230-256 dans `conversationAccessibilityLabel` (le label VoiceOver utilise le même helper).

### 2.4 — `MessageDayLabel.swift` — wrapper qui délègue

`MessageDayLabel.label(for:now:calendar:locale:today:yesterday:dayBeforeYesterday:)` devient un wrapper qui délègue à `MessageTimeFormatter.daySeparatorLabel(for:now:calendar:locale:)`. Les paramètres `today`/`yesterday`/`dayBeforeYesterday` sont ignorés (les valeurs en dur du helper sont utilisées, cohérence assurée).

L'extension privée avec les deux `DateFormatter` (lignes 54-70) est supprimée — le cache est désormais dans `MessageTimeFormatter`.

### 2.5 — Fichiers touchés Section 2

| Fichier | Diff |
|---|---|
| `apps/ios/Meeshy/Features/Main/Views/MessageTimeFormatter.swift` | nouveau, ~100 lignes |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift` | 1 ligne (résolution timeString) |
| `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` | supprime `timeAgo()`, remplace 2 appels |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayLabel.swift` | -25 / +5 (wrapper) |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift` | +1 ligne (`@available(*, deprecated)`) |
| `apps/ios/MeeshyTests/MessageTimeFormatterTests.swift` | nouveau, ~130 lignes |

---

## Section 3 — Flatten visuel

### 3.1 — Règle de remplacement

Sur tous les fichiers de la liste 3.2 :

| Effet trouvé | Remplacement |
|---|---|
| `.shadow(...)` (toute variante) | supprimé entièrement |
| `LinearGradient` / `RadialGradient` décoratif | couleur solide médiane |
| `.ultraThinMaterial` / `.thinMaterial` / `.thickMaterial` décoratifs | couleur solide (`theme.backgroundSecondary` ou `accent.opacity(α)`) |
| Exception : `BubbleStandardLayout` lignes 518, 521, 950-980 (blur ephemeral + fogOverlay) | **conservés** (fonctionnels) |

### 3.2 — Modifications fichier par fichier

#### `BubbleBackground.swift` — fond des bulles

- Bulle envoyée : `MeeshyColors.indigo600` solide (au lieu de `LinearGradient(indigo500→indigo700)`).
- Bulle reçue : `Color(hex: conversation.accentColor).opacity(isDark ? 0.18 : 0.10)` solide.

#### `MessageDaySeparator.swift:25`

- Avant : `Capsule().fill(.ultraThinMaterial)`
- Après : `Capsule().fill(accent.opacity(isDark ? 0.14 : 0.08))` solide.

#### `ThemedConversationRow.swift`

- Lignes 73-85 : `heatBackground` LinearGradient × 2 → **supprimé entièrement**. Fond rangée = fond hérité de la liste (`theme.backgroundPrimary`). La propriété calculée `conversationHeat` (lignes 54-70) est supprimée — gain perf direct (cf. Section 6 C1).
- Ligne 335 : `.shadow(color: badgeColor.opacity(0.25), radius: 3)` sur unread badge → supprimé.

#### `ConversationListView+Overlays.swift`

- Bottom bar : `.fill(.ultraThinMaterial) + .shadow(radius: 14, y: 6)` → `.fill(theme.backgroundSecondary)` + séparateur 0.5pt `theme.inputBorder` en bordure haute (alignment top).
- Filter chips actifs : `.shadow(color: accent.opacity(0.25), radius: 12, y: 5)` → supprimé. L'état actif reste signalé par couleur de fond accent solide.

#### `BubbleStandardLayout.swift`

- Ligne 674 : `.shadow(color: .black.opacity(0.3), radius: 6, y: 3)` sur media fullscreen → supprimé.
- Lignes 518, 521 : `.blur(radius: 20)` et `.blur(radius: 5)` ephemeral → conservés.
- Lignes 950-980 : `fogOverlay` (RadialGradient + 3 blurs cascadés) → conservé.

#### `BubbleReactionsOverlay.swift`

- `.shadow(color: accent.opacity(0.18), radius: 3, y: 1)` → supprimé.
- `.shadow(color: shadowColor, radius: shadowRadius, y: 2)` → supprimé.
- La pill reste sur fond `theme.backgroundSecondary` solide + bordure 0.5pt accent.

#### `ThemedMessageBubble+Media.swift`

- `.shadow(color: .black.opacity(0.3), radius: 6, y: 3)` sur media fullscreen (ligne 436) → supprimé.
- `.background(Circle().fill(.ultraThinMaterial.opacity(0.8)))` sur cercles play overlay → remplacé par `.background(Circle().fill(Color.black.opacity(0.55)))` (cercle noir solide, contraste suffisant).

### 3.3 — Audit étendu (à exécuter pendant l'implémentation)

Le plan d'implémentation devra exécuter et traiter chaque hit du grep suivant **uniquement sur les fichiers listés en 3.2** :

```bash
grep -rn "\.shadow(\|ultraThinMaterial\|thinMaterial\|thickMaterial\|LinearGradient\|RadialGradient" \
  apps/ios/Meeshy/Features/Main/Views/Bubble/ \
  apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift \
  apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble*.swift \
  apps/ios/Meeshy/Features/Main/Views/ConversationListView*.swift \
  apps/ios/Meeshy/Features/Main/Views/MessageListView.swift
```

Tout hit hors exceptions (`BubbleStandardLayout` 518/521/950-980) doit être traité selon la règle 3.1.

### 3.4 — Tests visuels QA

Livrable : `docs/qa/2026-05-22-conversation-flatten-smoke-tests.md` avec checklist :
- Conversation directe + groupe + community : bulle sent/received aspects
- Bulle avec quote reply / attachment / reaction / ephemeral revealed/unrevealed
- Liste conversations dark + light (vérifier absence de heatBackground, ombres)
- Séparateurs jour : aujourd'hui / hier / avant-hier / J-3 / J-7 / année précédente
- Filter chips actifs/inactifs
- Footer bulle : heure visible sans chevauchement avec attachment meta badge

---

## Section 4 — Animations simplifiées

### 4.1 — Standard cible

Nouveau fichier `apps/ios/Meeshy/Features/Main/Views/BubbleAnimations.swift` :

```swift
enum BubbleAnimations {
    static let standard: Animation = .easeOut(duration: 0.18)
    static let reactionFeedback: Animation = .easeOut(duration: 0.20)
}
```

### 4.2 — Mapping animation → fichier

| Fichier | Avant | Après |
|---|---|---|
| `ThemedMessageBubble+Media.swift` (carousel) | `.spring(response: 0.5, dampingFraction: 0.7)` | `BubbleAnimations.standard` |
| `ThemedMessageBubble+Media.swift` (transition media) | `.transition(.opacity.combined(with: .scale(scale: 0.98)))` | `.transition(.opacity)` |
| `BubbleReactionsOverlay.swift` (comet pill) | `.spring(response: 0.6, dampingFraction: 0.8)` | `BubbleAnimations.reactionFeedback` |
| `BubbleStandardLayout.swift` (apparition bulle) | `.transition(.opacity.combined(with: .scale))` | `.transition(.opacity)` |
| `ConversationListView.swift` (expand/collapse) | `.spring(response: 0.3, dampingFraction: 0.8)` | `BubbleAnimations.standard` (via correctif C5) |
| `ConversationListView+Overlays.swift` (chips toggle) | `.easeInOut(duration: 0.3)` | `BubbleAnimations.standard` |

### 4.3 — Animations conservées

| Animation | Fichier | Raison |
|---|---|---|
| `TypingDotsView` (sinusoïdale 0.5s, delay 0.18s/dot) | `ThemedConversationRow.swift` | Indicateur de présence — sa nature animée porte le sens |
| Swipe action gesture feedback | iOS natif | Fonctionnel, non modifiable |
| `BubbleStandardLayout` fogOverlay reveal | `BubbleStandardLayout.swift:950-980` | Feature ephemeral (validé Section 3) |
| `BubbleBlurRevealLifecycle` (`.easeIn/.easeOut` lifecycle phases) | `BubbleBlurRevealLifecycle.swift:85-99` | Lifecycle blur reveal — durées déjà calibrées |

### 4.4 — Audit étendu

```bash
grep -rn "\.spring(\|\.animation(\|withAnimation\|\.transition(" \
  apps/ios/Meeshy/Features/Main/Views/Bubble/ \
  apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift \
  apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble*.swift \
  apps/ios/Meeshy/Features/Main/Views/ConversationListView*.swift \
  apps/ios/Meeshy/Features/Main/Views/MessageListView.swift
```

Chaque hit hors liste 4.3 → `BubbleAnimations.standard`.

---

## Section 5 — Métadonnées attachement repositionnées

### 5.1 — Problème actuel

`ThemedMessageBubble+Media.swift:439-457` : `durationBadge` en `bottom-trailing` de la thumbnail vidéo. Footer bulle (heure) aussi en `bottom-trailing` de la bulle. Quand la thumbnail occupe toute la largeur (cas attachement solo), les deux se superposent visuellement.

### 5.2 — Nouvelle vue `AttachmentMetaBadge`

Nouveau fichier `apps/ios/Meeshy/Features/Main/Views/Bubble/AttachmentMetaBadge.swift` :

```swift
struct AttachmentMetaBadge: View, Equatable {
    let duration: String?
    let fileSize: Int64?

    private var label: String? {
        let parts: [String] = [
            duration,
            fileSize.flatMap { $0 > 0 ? AttachmentDownloader.fmt($0) : nil }
        ].compactMap { $0 }
        guard !parts.isEmpty else { return nil }
        return parts.joined(separator: " · ")
    }

    var body: some View {
        if let label {
            Text(label)
                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                .foregroundColor(.white)
                .padding(.horizontal, 5)
                .padding(.vertical, 2)
                .background(Capsule().fill(Color.black.opacity(0.6)))
        }
    }
}
```

`Equatable` conforme automatiquement (struct avec `String?` + `Int64?`). Ré-évaluation seulement si `duration` ou `fileSize` changent (jamais en pratique sur un attachement déjà uploadé).

### 5.3 — Modifications `ThemedMessageBubble+Media.swift`

#### `BubbleGridVideoThumbnailView` (lignes 391-458)

- Supprimer la propriété `durationBadge` (lignes 439-457).
- Modifier `body` (lignes 396-402) pour utiliser `ZStack(alignment: .bottomLeading)` et placer `AttachmentMetaBadge(duration: attachment.durationFormatted, fileSize: Int64(attachment.fileSize))` avec `.padding(.leading, 4)` + `.padding(.bottom, 4)`.

#### `BubbleGridImageView` (`ThemedMessageBubble+Media.swift:363`)

- Ajouter `AttachmentMetaBadge(duration: nil, fileSize: Int64(attachment.fileSize))` en overlay `ZStack(alignment: .bottomLeading)` avec `.padding(.leading, 4)` + `.padding(.bottom, 4)`.

### 5.4 — Garantie absence d'overlap

Largeur badge meta : ~70pt max pour `"0:42 · 2.4 MB"` (texte monospaced 10pt).
Largeur heure footer : ~36pt pour `"14:32"`.
Bulle minimum largeur : ~120pt (taille minimale d'attachement solo).

→ Aucun chevauchement possible tant que la bulle a ≥ 120pt de largeur.

### 5.5 — Fichiers touchés Section 5

| Fichier | Diff |
|---|---|
| `apps/ios/Meeshy/Features/Main/Views/Bubble/AttachmentMetaBadge.swift` | nouveau, ~35 lignes |
| `ThemedMessageBubble+Media.swift` | -20 / +20 (`durationBadge` → `AttachmentMetaBadge`, repositionnement bottom-leading vidéo + image) |

---

## Section 6 — Correctifs perfs chirurgicaux

### 6.1 — Findings sources (investigation factuelle)

| # | Finding | Fichier:ligne | Couvert par |
|---|---|---|---|
| F1 | `conversationHeat` calculé 2× par render | `ThemedConversationRow.swift:54-85` | C1 (= Section 3 suppression heat) |
| F2 | `DateFormatter()` inline dans `MessageDayLabel` | `MessageDayLabel.swift:54-70` | C2 (= Sections 1+2 `MessageTimeFormatter` cache) |
| F3 | `ForEach` rangées sans `.equatable()` | `ConversationListView.swift:175, 231` | C3 (ce sprint) |
| F4 | `typingUsernames` `@Published` global → invalidation totale | `ConversationListViewModel.swift:9-64` | A1 (follow-up, hors sprint) |
| F5 | `groupedConversations` re-tri 200 items à chaque message | `ConversationListViewModel.swift` | A2 (follow-up, hors sprint) |
| F6 | `String(localized:)` × 12 par rangée non cachés | `ConversationListView.swift:365-468` | C4 (ce sprint) |
| F7 | `withAnimation(.spring(0.3))` autour mutation | `ConversationListView.swift:491-498, 842-847` | C5 (ce sprint) |

### 6.2 — Correctifs ce sprint

#### C1 — Suppression `conversationHeat`
Inclus dans Section 3 (flatten supprime `heatBackground` qui était l'unique consommateur de `conversationHeat`). La propriété `conversationHeat` est supprimée.

#### C2 — Formatters cachés
Inclus dans Sections 1+2 (`MessageTimeFormatter` introduit le cache `static let`, `MessageDayLabel` délègue au helper).

#### C3 — `.equatable()` sur rangées

**Étape 1** : Conformance `Equatable` sur `ThemedConversationRow` basée sur :
- `conversation.id`
- `conversation.updatedAt`
- `conversation.unreadCount`
- `conversation.lastMessageAt`
- `conversation.isPinned`
- `conversation.isMuted`
- `isDark`
- `rowWidth`

**Étape 2** : `ConversationListView.swift:231` :
```swift
ForEach(conversations, id: \.id) { conversation in
    conversationRow(for: conversation, rowWidth: rowWidth)
        .equatable()
        .onAppear { triggerLoadMoreIfNeeded(conversation: conversation) }
}
```

#### C4 — `SwipeActionLabels` cache statique

Nouvel enum dans `ConversationListView.swift` (en haut du fichier ou fichier voisin `ConversationListHelpers.swift`) :

```swift
private enum SwipeActionLabels {
    static let pin = String(localized: "swipe.pin", defaultValue: "Épingler")
    static let unpin = String(localized: "swipe.unpin", defaultValue: "Désépingler")
    static let archive = String(localized: "swipe.archive", defaultValue: "Archiver")
    static let unarchive = String(localized: "swipe.unarchive", defaultValue: "Désarchiver")
    static let markRead = String(localized: "swipe.markRead", defaultValue: "Marquer lu")
    static let markUnread = String(localized: "swipe.markUnread", defaultValue: "Marquer non lu")
    static let mute = String(localized: "swipe.mute", defaultValue: "Mettre en sourdine")
    static let unmute = String(localized: "swipe.unmute", defaultValue: "Réactiver le son")
    static let block = String(localized: "swipe.block", defaultValue: "Bloquer")
    static let unblock = String(localized: "swipe.unblock", defaultValue: "Débloquer")
    static let delete = String(localized: "swipe.delete", defaultValue: "Supprimer")
    static let lock = String(localized: "swipe.lock", defaultValue: "Verrouiller")
    static let unlock = String(localized: "swipe.unlock", defaultValue: "Déverrouiller")
}
```

Remplacer chaque `String(localized: "swipe.X", ...)` dans `leadingSwipeActions` (`:365-409`) et `trailingSwipeActions` (`:411-468`) par `SwipeActionLabels.X`. Une instanciation au démarrage de l'app, jamais répétée.

#### C5 — `withAnimation` durée cohérente

`ConversationListView.swift:491-498` :
```swift
private func toggleSection(_ sectionId: String) {
    withAnimation(BubbleAnimations.standard) {
        if expandedSections.contains(sectionId) { expandedSections.remove(sectionId) }
        else { expandedSections.insert(sectionId) }
    }
    HapticFeedback.light()
}
```

Pareil pour `handleDrop` (`:842-847`) : spring → `BubbleAnimations.standard`.

### 6.3 — Follow-ups perfs identifiés (hors scope ce sprint)

#### A1 — `typingUsernames` via `PassthroughSubject`
Refactor `@Published typingUsernames: [String: String]` en `PassthroughSubject<(String, String?), Never>`. Chaque rangée s'abonne filtré par `conversation.id`. Gain : seule la rangée concernée re-render au lieu de toutes les rangées.

**Effort estimé** : 3-4h.
**Risque** : modifie pattern d'observation, tests à adapter.
**Recommandation** : spec et plan dédiés post-sprint.

#### A2 — Buffer 500ms `groupedConversations`
Bufferiser les arrivées de messages avant de re-trier `conversations` + `groupedConversations`.

**Effort estimé** : 3-4h.
**Risque** : retarde l'affichage des nouveaux messages jusqu'à 500ms.
**Recommandation** : spec et plan dédiés post-sprint avec validation UX du délai.

### 6.4 — Fichiers touchés Section 6

| Fichier | Diff |
|---|---|
| `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` | +Equatable conformance (couvert C3) ; suppression `conversationHeat` (couvert C1 via Section 3) |
| `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` | `.equatable()` ForEach (C3) ; remplacement `String(localized:)` (C4) ; spring → standard (C5) |
| `apps/ios/Meeshy/Features/Main/Views/BubbleAnimations.swift` | nouveau (déjà compté Section 4) |

---

## Récapitulatif fichiers créés / modifiés

### Nouveaux fichiers

1. `apps/ios/Meeshy/Features/Main/Views/MessageTimeFormatter.swift` (~100 lignes)
2. `apps/ios/Meeshy/Features/Main/Views/BubbleAnimations.swift` (~10 lignes)
3. `apps/ios/Meeshy/Features/Main/Views/Bubble/AttachmentMetaBadge.swift` (~35 lignes)
4. `apps/ios/MeeshyTests/MessageTimeFormatterTests.swift` (~130 lignes)
5. `docs/qa/2026-05-22-conversation-flatten-smoke-tests.md` (checklist QA)

### Fichiers modifiés

| Fichier | Sections |
|---|---|
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleContentBuilder.swift` | S2 |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDayLabel.swift` | S2 |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/MessageDaySeparator.swift` | S3 |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleBackground.swift` | S3 |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout.swift` | S3, S4 |
| `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleReactionsOverlay.swift` | S3, S4 |
| `apps/ios/Meeshy/Features/Main/Views/ThemedConversationRow.swift` | S2, S3, S6 (C1, C3) |
| `apps/ios/Meeshy/Features/Main/Views/ThemedMessageBubble+Media.swift` | S3, S4, S5 |
| `apps/ios/Meeshy/Features/Main/Views/ConversationListView.swift` | S6 (C3, C4, C5) |
| `apps/ios/Meeshy/Features/Main/Views/ConversationListView+Overlays.swift` | S3, S4 |
| `packages/MeeshySDK/Sources/MeeshySDK/Persistence/MessageRecord.swift` | S2 (deprecation marker) |

## Stratégie de tests

### Tests unitaires (XCTest pur)
- `MessageTimeFormatterTests` : ~13 tests couvrant les 3 méthodes + cache + cas pièges (passage d'année, locale forcée).

### Tests visuels manuels (QA)
- Checklist `docs/qa/2026-05-22-conversation-flatten-smoke-tests.md` couvrant : aspect flat (dark/light), formats date 3 surfaces, animations, badges attachement repositionnés.

### Pas de snapshot tests automatiques
La combinatoire des bulles (sent/received × type × état × langue × accent dynamique) est trop large pour des baselines stables. La checklist QA est livrée à la place.

## Risques et mitigations

| Risque | Probabilité | Mitigation |
|---|---|---|
| `cachedTimeString` GRDB encore lu par du code legacy non identifié | Faible | grep exhaustif `cachedTimeString` avant merge ; déprécation `MessageRecord.computeTimeString` signale la dette |
| Locale `fr_FR` cassée pour utilisateurs non-FR | Inexistante (app FR-only actuellement, cf. Prisme Linguistique) | n/a |
| Régression visuelle non détectée sur surfaces hors flatten | Faible | Périmètre fichiers strictement limité (Section 3.3) ; checklist QA |
| `.equatable()` masque des updates légitimes | Faible | Champs `Equatable` choisis pour couvrir tous les triggers d'update visible (`updatedAt`, `unreadCount`, `lastMessageAt`, `isPinned`, `isMuted`) |
| Animations `0.18s` trop courtes perçues "saccadées" | Faible-modéré | Si retour QA défavorable, ajuster à `0.22s` reste un point unique de changement dans `BubbleAnimations.standard` |

## Critères d'acceptation

- [ ] Liste conversations : timestamp ≥ 7j affiche `"04/05/26"` (format DD/MM/YY).
- [ ] Séparateur jour : ≥ J-7 affiche `"sam. 4 mai '26"` (avec apostrophe année quel que soit l'année).
- [ ] Footer bulle : affiche toujours `"14:32"`, jamais de date.
- [ ] Aucun gradient ni material décoratif sur fichiers Section 3.2 (sauf exceptions ephemeral `BubbleStandardLayout`).
- [ ] Aucun `.shadow(...)` sur fichiers Section 3.2.
- [ ] Animations transitions = `BubbleAnimations.standard` (sauf liste 4.3).
- [ ] Badge attachement vidéo : `"durée · taille"` en bottom-leading.
- [ ] Badge attachement image : `"taille"` en bottom-leading.
- [ ] Heure de bulle visible sans chevauchement avec le badge attachement (bulles solo média full-bleed).
- [ ] `MessageTimeFormatterTests` passe (13 tests).
- [ ] Build `./apps/ios/meeshy.sh build` vert.
- [ ] Tests existants `./apps/ios/meeshy.sh test` verts (pas de régression).
