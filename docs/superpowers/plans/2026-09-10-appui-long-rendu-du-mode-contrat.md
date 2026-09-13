# Contrat d'interfaces — plan « L'appui long montre le message tel qu'on le lit »

Ce fichier fixe les noms, signatures et répartitions que les quatre parties du plan partagent. Chaque rédacteur ne voit que sa partie : **ce contrat est la seule façon de connaître ce que les autres produisent**.

- **Écart nécessaire** (le code réel rend un nom ou une signature impossible) : écrire en tête de la partie un bloc `> ⚠️ Écart au contrat`, avec le changement proposé et sa raison. Ne pas diverger en silence.
- **Spec** : `docs/superpowers/specs/2026-09-10-appui-long-rendu-du-mode-design.md` (commit e8f28f7f5f).

## Environnement commun (toutes les tâches)

- **Worktree** : `/Users/smpceo/Documents/v2_meeshy-longpress`, branche `claude/appui-long-rendu-du-mode`. Ne JAMAIS toucher `/Users/smpceo/Documents/v2_meeshy` (WIP d'une autre session).
- **Cible** : Swift 6.0, iOS 16.0 minimum. L'app compile en `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor` : un type neuf est `@MainActor` par défaut, et les tests de l'app sont `@MainActor final class …: XCTestCase`, `@testable import Meeshy`.
- **Style** :
  - doc-comments en français, denses comme le code voisin ;
  - `MeeshyFont.relative(…)`, jamais `.system(size:)` (`FixedFontSizeGuardTests`) ;
  - `.adaptiveOnChange`, jamais `.onChange` brut ;
  - chaînes `String(localized: "<clé existante>", defaultValue: "…", bundle: .main)` en réutilisant les clés existantes ; une clé neuve exige son entrée au catalogue `Localizable.xcstrings` (`LocalizationConsistencyTests`).
- **Tests** : XCTest, `test_{méthode}_{condition}_{résultatAttendu}`, fabriques de données sans mutation partagée. On teste le comportement par l'API publique. Garde de source (`AppSourceGuard.stripComments`) seulement là où aucune API ne se teste (câblage de `ConversationView`).
- **Simulateurs dédiés** (créés en Tâche 1) :
  - `Meeshy-LongPress` : iPhone 16 Pro, runtime `com.apple.CoreSimulator.SimRuntime.iOS-26-1` ;
  - `Meeshy-LongPress-18` : iPhone 16 Pro, runtime `iOS-18-2`.
- **Test ciblé de l'app** (jamais `meeshy.sh test` pendant les tâches ; le gate complet est en Tâche 24) :
  ```bash
  cd /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios && xcodegen generate >/dev/null && \
  xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy \
    -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
    -configuration Debug -enableCodeCoverage NO \
    -clonedSourcePackagesDirPath /Users/smpceo/Documents/v2_meeshy-longpress/apps/ios/Build/SourcePackages \
    -skipPackageUpdates \
    -only-testing:MeeshyTests/<Classe> \
    -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/Meeshy-longpress-dd \
    2>&1 | tee /tmp/meeshy-longpress-<Classe>.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
  ```
  - Un fichier neuf n'entre au bundle qu'après `xcodegen generate`. Avant de committer, vérifier le delta du pbxproj : `grep -c '\.swift in Sources' apps/ios/Meeshy.xcodeproj/project.pbxproj`, comparé à `git show HEAD:apps/ios/Meeshy.xcodeproj/project.pbxproj | grep -c '\.swift in Sources'`, doit valoir +N (jamais −).
  - Le pbxproj régénéré se committe avec la tâche.
  - Un RED qui ne rougit pas signale un fichier absent du bundle.
- **Test ciblé du SDK** :
  ```bash
  cd /Users/smpceo/Documents/v2_meeshy-longpress/packages/MeeshySDK && \
  xcodebuild test -scheme MeeshySDK-Package \
    -destination "platform=iOS Simulator,name=Meeshy-LongPress" \
    -skipPackageUpdates -only-testing:MeeshyUITests/<Classe> \
    -derivedDataPath /Users/smpceo/Library/Developer/Xcode/DerivedData/MeeshySDK-longpress-dd \
    2>&1 | tee /tmp/meeshy-longpress-sdk-<Classe>.log | grep -E "Test Case '.*' (passed|failed)|error:|Executed [0-9]+ test"
  ```
- **Commit par tâche** :
  - `git add <chemins explicites>` ;
  - `git commit -m "<type>(ios|sdk): <résultat en français> (#n)"`, avec `Refs #n` dans le corps (jamais `Closes` avant la Tâche 24), puis les trailers :
    ```
    Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
    Claude-Session: https://claude.ai/code/session_01ST5a9LiyZV28KWWhgvcvCK
    ```
  - `git show --stat HEAD` pour vérifier le contenu, puis `git push origin claude/appui-long-rendu-du-mode`.
- **Budget (D4)** : toute tâche qui touche `ConversationView.swift`, `MessageListViewController.swift` ou `MessageOverlayMenu.swift` relève `wc -l` avant et après, et écrit le Δ dans le corps du commit. **Δ ≤ 0 par fichier.** Compenser par une relocalisation pure vers un fichier neuf, en vérifiant d'abord qu'aucune garde de `apps/ios/MeeshyTests` ne lit le bloc déplacé (`git grep -n '<ancre>' -- apps/ios/MeeshyTests`). `FocalRow.swift` n'est jamais modifié.

## Répartition

| Partie | Tâches | Issues | Rédacteur |
|---|---|---|---|
| P1 | 1 Préparation · 2 Drapeau · 3 Loi de présentation · 4 Clavier câblé | #5980 | agent P1 |
| P2 | 5 SDK barre · 6 Actions Rivière · 7 Libellés + toutes les options · 8 Fabrique de contexte · 9 `initialItem: .media` · 10 Routeur · 11 Menu glass | #5982, #5983, #5984 | agent P2 |
| P3 | 12 Effets coupés · 13 Lien fournisseurs · 14 Rangée de la liste · 15 Géométrie · 16 Overlay remonté + montage · 17 Vérif. simulateur Bulle/Focal/Script | #5981, #5982 | agent P3 |
| P4 | 18 Bulle Rivière · 19 Fournisseur Rivière + câblage · 20 Vérif. Rivière · 21 Éligibilité double tap · 22 Double tap câblé · 23 Vérif. double tap | #5983, #5984 | agent P4 |
| — | 24 Gate complet, preuve de budget, clôture des issues | tous | orchestrateur |

Ordre d'exécution : 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16 → 17 → 18 → 19 → 20 → 21 → 22 → 23 → 24. Une tâche peut consommer tout ce que produit une tâche de numéro inférieur.

## Interfaces

### Tâche 1 — Préparation (P1)

- Simulateurs `Meeshy-LongPress` et `Meeshy-LongPress-18` créés (`xcrun simctl create`).
- **Relocalisation pure** de `struct ConversationOverlayState` (`ConversationView.swift`, bloc `struct ConversationOverlayState { … }` qui suit `ConversationActiveMember`) vers `apps/ios/Meeshy/Features/Main/Views/ConversationOverlayState.swift`, à l'identique. Δ négatif sur `ConversationView.swift` : c'est la réserve de compensation des Tâches 4, 8, 10, 16, 19, 22.
- Aucune garde ne lit la déclaration : `ConversationSelectionGuardTests` lit `ConversationOverlayState.selectionCap` dans le corps d'une fonction, pas la déclaration.

### Tâche 2 — Drapeau (P1)

Dans `apps/ios/Meeshy/Features/Main/Focal/Preferences/MeeshyFeatureFlags.swift` (enum existant `MeeshyFeatureFlags`) :

```swift
static var isLiftedRowLongPressEnabled: Bool
static func isLiftedRowLongPressEnabled(defaults: UserDefaults, environment: [String: String]) -> Bool
```

Résolution, dans l'ordre :
1. `environment["MEESHY_FLAG_LIFTED_ROW_LONG_PRESS"]` vaut `"1"` ⇒ vrai, `"0"` ⇒ faux ;
2. sinon, si `defaults.object(forKey: "meeshy.flag.lifted_row_long_press") != nil` ⇒ `defaults.bool(forKey:)` ;
3. sinon `BetaFeaturesPreference.isEnabled(defaults: defaults, environment: environment)`.

La variante sans paramètre lit `.standard` et `ProcessEnvironmentSnapshot.current`.

### Tâche 3 — Loi de présentation (P1)

`apps/ios/Meeshy/Features/Main/Views/LongPressPresentationPlan.swift` :

```swift
enum LongPressPresentationStyle: Equatable { case longPress, scriptDoubleTap }

enum LongPressPresentationPlan {
    static let recenterThreshold: CGFloat = 0.6
    /// `nil` ⇒ aucun clavier levé : ni baisse ni attente.
    static func keyboardWait(for transition: KeyboardTransition?, now: Date) -> TimeInterval?
    static func shouldRecenter(cellFrame: CGRect?, windowHeight: CGFloat, mode: ConversationReadingMode) -> Bool
}
```

**`keyboardWait`** :
- `transition == nil` ou `height <= 0` ⇒ `nil` ;
- sinon :
  - `reste = transition.isLive(at: now) ? max(0, transition.duration + KeyboardTransition.liveSlack - now.timeIntervalSince(transition.announcedAt)) : 0` ;
  - rend `reste + transition.duration + KeyboardTransition.liveSlack`.

**`shouldRecenter`** :
- `mode == .river` ⇒ `false` ;
- `cellFrame == nil` ⇒ `false` ;
- sinon `cellFrame.midY > windowHeight * recenterThreshold`.

`ConversationView.longPressRepositionThreshold` et `longPressRepositionDelay` restent en place (D3) ; le seuil de la loi vaut la même valeur.

### Tâche 4 — Clavier câblé (P1)

- `apps/ios/Meeshy/Features/Main/Views/KeyboardDismissing.swift` :
  ```swift
  protocol KeyboardDismissing { func dismissKeyboard() }
  struct SystemKeyboardDismisser: KeyboardDismissing {
      func dismissKeyboard()   // UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }
  ```
- `ConversationComposerState` (`Views/ConversationComposerState.swift`) : `var focusTrigger = false`.
- `ConversationView+Composer.swift` : `UniversalComposerBar(…, focusTrigger: $composerState.focusTrigger, …)`, dans l'ordre d'arguments de l'initialiseur.
- `ConversationOverlayState.restoreAfterLongPress: (keyboardWasVisible: Bool, showOptions: Bool)?` (renommage du champ `isTyping`).
- `ConversationView+LongPressMenu.swift` :
  ```swift
  static var keyboardDismisser: any KeyboardDismissing = SystemKeyboardDismisser()
  func presentLongPressMenu(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle = .longPress)
  func continueLongPressPresentation(for message: Message, cellFrame: CGRect?, style: LongPressPresentationStyle)
  func raiseComposerKeyboardIfMounted()   // !overlayState.isSelectionModeActive ⇒ composerState.focusTrigger = true
  func restoreStateAfterLongPressIfNeeded()
  ```
- **`presentLongPressMenu`** :
  1. mémorise `(keyboardWasVisible: keyboardHeight > 0, showOptions:)` et ferme les options ;
  2. calcule `LongPressPresentationPlan.keyboardWait(for: keyboardTransition, now: Date())` ;
  3. attente non nil ⇒ `Self.keyboardDismisser.dismissKeyboard()`, puis `continueLongPressPresentation` après l'attente ; attente nil ⇒ appel **synchrone** ;
  4. le texte `overlayState.showOverlayMenu = true` reste dans ce fichier (`CallDetailRoutingTests`).
- **`continueLongPressPresentation`** (version de la Tâche 4) : le recentrage actuel, décidé par `LongPressPresentationPlan.shouldRecenter(cellFrame:windowHeight:mode:)` sur `readingModeController.mode`, puis présentation.
- **`restoreStateAfterLongPressIfNeeded`** :
  - Éditer ⇒ `raiseComposerKeyboardIfMounted()` ;
  - mode sélection ⇒ rien ;
  - sinon `keyboardWasVisible` ⇒ `raiseComposerKeyboardIfMounted()`, et `showOptions` restitué.
- `isTyping` n'est plus écrit par ce fichier (#5988).
- `ConversationLongPressMenuGuardTests` est re-pointée sur les nouvelles ancres, sans affaiblir l'ordre « baisse avant présentation ».

### Tâche 5 — SDK barre (P2)

Dans `packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift` :

```swift
public enum EmojiReactionPickerChrome: Equatable, Sendable { case capsule, none }
// init : paramètre `chrome: EmojiReactionPickerChrome = .capsule`, placé juste après `scrollable`
public static func stripHeight(scale: CGFloat) -> CGFloat
static func waveRise(scale: CGFloat) -> CGFloat   // 16 * max(1, scale)
```

- `.none` ⇒ ni `QuickReactionStripChrome` ni fond.
- Reduce Motion ⇒ montée 0 et échelle de départ 1 (fondu seul).

### Tâche 6 — Actions Rivière (P2)

Dans `MessageActionResolver.swift` :
- `enum PrimaryAction` : ajout de `case openInThread` et `case reply` ;
- `struct MessageMenuContext` : ajout de `var isRiver: Bool = false` ;
- `primaryActions` : quand `ctx.isRiver`, `.openInThread` puis `.reply` sont insérés juste après `.callDetail` (en tête s'il est absent).

Les `switch` exhaustifs sont complétés :
- `MessageActionsMenu` : symboles `"text.bubble"` et `"arrowshape.turn.up.left"`, clés `riviere.bubble.openInThread` et `action.reply` ;
- `MessageOverlayMenu.handlePrimaryAction` ;
- `nativeMenuButton` dans `ConversationView.swift`.

Chaque ajout aux fichiers hors budget est compensé.

### Tâche 7 — Libellés et toutes les options (P2)

`apps/ios/Meeshy/Features/Main/Components/MessageOptionLabels.swift` : UNE source des libellés et symboles, extraite de `MessageActionsMenu` et de `MessageMoreSheet`, qui l'appellent désormais.

```swift
enum MessageOptionLabels {
    static func symbol(_ action: PrimaryAction) -> String
    static func label(_ action: PrimaryAction) -> String
    static func symbol(_ item: MoreItem) -> String
    static func label(_ item: MoreItem) -> String
}
```

Dans `MessageActionResolver.swift` :

```swift
enum OptionSection: Equatable {
    case quick([PrimaryAction])
    case actions([MoreItem])
    case info([MoreItem])
    case moderation([MoreItem])
}
extension MessageActionResolver { static func allOptionSections(_ ctx: MessageMenuContext) -> [OptionSection] }
```

Règles de `allOptionSections` (spec §7.2) :
- **quick** = `primaryActions` sans `.more` ;
- **actions** = actions de `moreSections` moins `edit` et `copy` (et moins `reply` si `quick` contient `.reply`), avec `delete` en dernier ;
- **info** = infos de `moreSections` moins `language` si `quick` contient `.translate` ;
- **moderation** = `report` ;
- les sections vides sont retirées.

### Tâche 8 — Fabrique de contexte (P2)

`apps/ios/Meeshy/Features/Main/Components/MessageMenuContextFactory.swift` :

```swift
struct MessageMenuFacts: Equatable { /* champs lus au site de la feuille, ConversationView.swift ~936-955 */ }
enum MessageMenuContextFactory { static func make(message: Message, facts: MessageMenuFacts) -> MessageMenuContext }
```

`apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageMenuContext.swift` :

```swift
extension ConversationView { func menuContext(for message: Message, isRiver: Bool) -> MessageMenuContext }
```

La feuille « Plus… » l'adopte. L'overlay actuel garde le sien (D8).

### Tâche 9 — `initialItem: .media` (P2)

`MessageMoreSheet` :
- `static func presentsMediaConfirmation(initialItem: MoreItem?) -> Bool` (vrai pour `.media`) ;
- à l'apparition, vrai ⇒ `showDeleteMediaConfirm = true`.

### Tâche 10 — Routeur (P2)

`apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageActionRouter.swift` :

```swift
enum MessageActionRoute: Equatable {
    case beginEdit, beginSelection, openMore(MoreItem?), copyDisplayedText, saveMedia, compose,
         callDetail, openInThread, reply, togglePin, toggleStar, toggleStickerFavorite,
         share, openThread, delete
}
enum MessageActionRouting {
    static func route(_ action: PrimaryAction) -> MessageActionRoute
    static func route(_ item: MoreItem) -> MessageActionRoute
}
struct MessageActionRouter {
    let perform: (PrimaryAction) -> Void
    let performMore: (MoreItem) -> Void
}
extension ConversationView { func messageActionRouter(for message: Message) -> MessageActionRouter }
```

**Routes de `PrimaryAction`** :
- `edit` → `beginEdit` (puis `raiseComposerKeyboardIfMounted()`) ;
- `select` → `beginSelection` ;
- `translate` → `openMore(.language)` ;
- `copy` → `copyDisplayedText` ;
- `saveMedia` → `saveMedia` ;
- `compose` → `compose` ;
- `callDetail` → `callDetail` ;
- `more` → `openMore(nil)` ;
- `openInThread` → `openInThread` ;
- `reply` → `reply` (puis `raiseComposerKeyboardIfMounted()` ; en Rivière, `readingModeController.select(.script)` et défilement comme l'`onReply` de la Rivière) ;
- `pin`/`unpin` → `togglePin` ;
- `star`/`unstar` → `toggleStar` ;
- `delete` → `delete`.

**Routes de `MoreItem`** :
- `reply` → `reply` ;
- `forward` → `beginSelection` (#5989) ;
- `thread` → `openThread` ;
- `media` → `openMore(.media)` ;
- `pin`/`unpin` → `togglePin` ;
- `star`/`unstar` → `toggleStar` ;
- `pinSticker`/`unpinSticker` → `toggleStickerFavorite` ;
- `edit` → `beginEdit` ;
- `copy` → `copyDisplayedText` ;
- `share` → `share` ;
- `delete` → `delete` ;
- `language`, `views`, `reactions`, `transcription`, `sentiment`, `history`, `report` → `openMore(item)`.

Les closures appellent les MÊMES méthodes de `ConversationView` que la feuille. Les closures de la feuille ne bougent pas (`MessageMoreJumpsToViewsGuardTests`).

### Tâche 11 — Menu glass (P2)

`apps/ios/Meeshy/Features/Main/Components/MessageOptionsGlassMenu.swift` :

```swift
struct MessageOptionsGlassMenu: View {
    let sections: [OptionSection]
    let accentHex: String
    let maxHeight: CGFloat
    let onPrimary: (PrimaryAction) -> Void
    let onMore: (MoreItem) -> Void
    static let menuWidth: CGFloat = 280
    static func estimatedHeight(sections: [OptionSection]) -> CGFloat
    static func minimumHeight() -> CGFloat   // trois lignes
}
```

- Présentation : `adaptiveGlass` (iOS 26), matière avant ; défilement au-delà de `maxHeight` ; `delete` en rouge (`MeeshyColors.error`).
- Libellés : `MessageOptionLabels`.

### Tâche 12 — Effets coupés (P3)

`MessageEffectModifiers.swift` :
- `EnvironmentValues.suppressesAppearanceEffects: Bool` (défaut `false`) ;
- `MessageEffectsModifier` le lit : vrai ⇒ `plan.appearance` vide, `plan.persistent` intact.

Ajout d'une fonction pure testable, par exemple `MessageEffects.playbackPlan(reduceMotion:suppressAppearance:)`, ou équivalent nommé par P3 dans sa partie.

### Tâche 13 — Lien des fournisseurs (P3)

`apps/ios/Meeshy/Features/Main/Views/LiftedMessageRow.swift` :

```swift
struct LiftedMessageRow {
    enum Alignment: Equatable { case leading, trailing, fullWidth }
    let messageId: String
    let content: AnyView
    let frameInWindow: CGRect
    let alignment: Alignment
}
protocol LiftedRowProviding: AnyObject { func liftedRow(for messageId: String) -> LiftedMessageRow? }
final class LiftedRowProviderLink {
    enum Slot: Hashable { case thread, river }
    func register(_ provider: LiftedRowProviding, for slot: Slot)   // référence FAIBLE
    static func slot(for mode: ConversationReadingMode) -> Slot      // .river ⇒ .river, sinon .thread
    func liftedRow(for messageId: String, mode: ConversationReadingMode) -> LiftedMessageRow?
}
```

`ConversationOverlayState` : `let liftedRowLink = LiftedRowProviderLink()`, plus `var liftedRow: LiftedMessageRow? = nil` et `var liftedStyle: LongPressPresentationStyle = .longPress`.

### Tâche 14 — Rangée de la liste (P3)

- **`MessageListView`** : `var liftedRowLink: LiftedRowProviderLink? = nil`. `makeUIViewController` et `updateUIViewController` appellent `liftedRowLink?.register(vc, for: .thread)`.
- **Extraction dans `MessageListViewController.swift` même** : une méthode interne rend le contenu de rangée (bulle ou `FocalRow`) avant contre-flip et menu natif, sans écrire sur la cellule, avec `forLiftedCopy: Bool`. Pour la copie :
  - `isFocused: false` ;
  - `.allowsHitTesting(false)`, `.accessibilityHidden(true)` ;
  - `.environment(\.suppressesAppearanceEffects, true)` ;
  - les cinq `environmentObject`.
  
  La cellule l'appelle avec `forLiftedCopy: false`. **La méthode s'appelle `makeRowContent`** : P3 en fixe les paramètres, `forLiftedCopy: Bool` compris. Dans son corps, le texte `focalRow.equatable()` reste l'ancre de la rangée plate, où la Tâche 22 pose le double tap.
- **`apps/ios/Meeshy/Features/Main/Views/MessageListViewController+LiftedRow.swift`** : `extension MessageListViewController: LiftedRowProviding`.
  - Cadre = `cellFrameInWindow(messageId:)`.
  - `nil` si la cellule n'est pas matérialisée, ou si `view.isHidden`.
  - Alignement : `.fullWidth` en rangée plate (`readingMode.usesFlatRow`), `.trailing` pour `isMe`, `.leading` sinon.
- ConversationView : le montage de `MessageListView` passe `liftedRowLink: overlayState.liftedRowLink` (compensé).

### Tâche 15 — Géométrie (P3)

`apps/ios/Meeshy/Features/Main/Components/LiftedOverlayLayout.swift` :

```swift
struct LiftedOverlayLayoutInput: Equatable {
    var rowFrame: CGRect          // repère de l'hôte
    var hostSize: CGSize
    var safeAreaTop: CGFloat
    var safeAreaBottom: CGFloat
    var stripSize: CGSize         // mesurée
    var menuSize: CGSize
    var minimumMenuHeight: CGFloat
    var style: LongPressPresentationStyle
    var alignment: LiftedMessageRow.Alignment
    var isRightToLeft: Bool
}
struct LiftedOverlayLayout: Equatable {
    let stripFrame: CGRect
    let rowFrame: CGRect
    let menuFrame: CGRect
    let menuOverlapsRow: Bool     // règle 5
    static let edgeInset: CGFloat = 16
    static let stripMaxWidth: CGFloat = 520
    static let stripGap: CGFloat = 8
    static let menuGap: CGFloat = 6
    static func resolve(_ input: LiftedOverlayLayoutInput) -> LiftedOverlayLayout
}
```

Règles et précédence : spec §6.

### Tâche 16 — Overlay remonté et montage (P3)

`apps/ios/Meeshy/Features/Main/Components/LiftedMessageOverlay.swift` :

```swift
struct LiftedMessageOverlay: View {
    let row: LiftedMessageRow
    let style: LongPressPresentationStyle
    let accentHex: String
    let compactActions: [PrimaryAction]
    let optionSections: [OptionSection]
    @Binding var isPresented: Bool
    let onReact: (String) -> Void
    let onExpandFullPicker: () -> Void
    let onPrimary: (PrimaryAction) -> Void
    let onMore: (MoreItem) -> Void
    let onShowMore: () -> Void   // glissé haut fort
}
```

Il reprend :
- le voile et la fermeture de `MessageOverlayMenu` (entrée `.spring(0.42, 0.74)`, sortie `.spring(0.32, 0.86)`, `isPresented = false` à 0,26 s) ;
- `MessageOverlayDragLaw` ;
- `EmojiUsageTracker` ;
- `EmojiReactionPicker(scale: 2, scrollable: true, chrome: .none | .capsule)` ;
- la modale VoiceOver.

Aucune haptique ajoutée au-delà de l'apparition existante. « Faire d'abord la fermeture, puis l'action. »

`apps/ios/Meeshy/Features/Main/Views/ConversationView+LiftedOverlay.swift` :

```swift
extension ConversationView {
    func liftedOverlayContent(for message: Message) -> AnyView?   // nil ⇒ l'overlay actuel sert
}
```

- `overlayMenuContent` l'essaie d'abord (≤ 3 lignes, compensées).
- **`continueLongPressPresentation`** (version de la Tâche 16) : si `MeeshyFeatureFlags.isLiftedRowLongPressEnabled` et `overlayState.liftedRowLink.liftedRow(for:mode:)` rend une rangée :
  1. décision de recentrage sur `row.frameInWindow` ;
  2. après recentrage (délai existant), nouvelle lecture de la rangée ;
  3. `overlayState.liftedRow = row`, `overlayState.liftedStyle = style`, `showOverlayMenu = true`.
  
  Sinon, chemin de la Tâche 4.
- `restoreStateAfterLongPressIfNeeded` vide `overlayState.liftedRow`.

### Tâche 18 — Bulle Rivière (P4)

`RiverBubbleView.swift` :

```swift
enum RiverBubblePresentation: Equatable { case inStream, lifted }
// nouveaux paramètres, avec défaut, après `onReply` :
var isHiddenForOverlay: Bool = false
var presentation: RiverBubblePresentation = .inStream
var onLongPress: ((String) -> Void)? = nil
```

- **`.inStream` et `onLongPress != nil`** :
  - `LongPressGesture(minimumDuration: 0.35)` remplace `.contextMenu` ;
  - `.accessibilityAction(named:)` pour « Ouvrir dans le fil », « Répondre » et « Copier » ;
  - l'opacité suit `isHiddenForOverlay`, et le cadre reste publié.
- **`.inStream` et `onLongPress == nil`** : `.contextMenu` actuel, à l'identique.
- **`.lifted`** : ni `.contextMenu`, ni préférence de cadre, ni geste.

### Tâche 19 — Fournisseur Rivière et câblage (P4)

`apps/ios/Meeshy/Features/Main/Riviere/View/RiverLiftedRowProvider.swift` :

```swift
final class RiverLiftedRowProvider: LiftedRowProviding { /* alimenté par RiverStreamHost à chaque onPreferenceChange : cadres (repère pane), origine du pane dans la fenêtre, contenus, largeur de contenu */ }
```

- `RiverStreamHost` et `RiverConversationHost` reçoivent `liftedRowProvider`, `overlaidMessageId` et `onLongPress`.
- `ConversationView` enregistre le fournisseur sous `.river` et passe `onLongPress: { presentLongPressMenu(for:cellFrame: nil) }`.
- Menu compact avec `isRiver: true` (via `menuContext(for:isRiver:)`).
- Aucun recentrage (loi de la Tâche 3).

### Tâche 21 — Éligibilité du double tap (P4)

Fichier neuf dans `apps/ios/Meeshy/Features/Main/Focal/` (hors `FocalRow.swift`) :

```swift
enum ScriptDoubleTapEligibility {
    static func accepts(mode: ConversationReadingMode, kind: BubbleContent.Kind, flag: Bool) -> Bool
    // mode == .script && QuickReactionGesture.acceptsDoubleTap(kind: kind) && flag
}
```

### Tâche 22 — Double tap câblé (P4)

- `ScriptMessageDoubleTap: ViewModifier { let isEnabled: Bool; let onOpen: () -> Void }`, patron `QuickReactionDoubleTap`, sans haptique propre.
- Posé sur la rangée plate dans la méthode extraite en Tâche 14 (`forLiftedCopy == false` seulement).
- Rappel `onScriptDoubleTap: ((String, CGRect?) -> Void)?` sur `MessageListViewController` et `MessageListView`.
- `ConversationView` : `onScriptDoubleTap` → `presentLongPressMenu(for:cellFrame:style: .scriptDoubleTap)`.
- Action VoiceOver nommée « Toutes les options » (clé existante à rechercher, sinon clé neuve au catalogue).
- `LiftedMessageOverlay` en `.scriptDoubleTap` : barre avec capsule, à cheval sur le bord haut ; `MessageOptionsGlassMenu(sections: allOptionSections(ctx))` dessous.
