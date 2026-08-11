# "Plus…" ouvre directement "Vues" — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make both "Plus…" (`.more`) entry points on a message — the custom long-press overlay AND the native iOS 26 context menu — open `MessageMoreSheet` directly on the "Vues" (read-receipts) detail view instead of the full action grid, unless the user has disabled read-receipt reciprocity (`showReadReceipts == false`), in which case both fall back to the full grid exactly as today.

**Architecture:** Two independent one-line-of-intent changes in `ConversationView.swift`: replace the hard-coded `overlayState.moreSheetInitialItem = nil` at each `.more` call site with a ternary read directly from `UserPreferencesManager.shared.privacy.showReadReceipts` (`.views` when shared, `nil` — full grid — when not). No new types, no SDK changes, no new call sites. Verified by source-analysis guard tests (the closures are inline and not independently instantiable in XCTest), following the exact pattern already used by `CallDetailRoutingTests` and `ConversationMenuSystemDesignGuardTests` on this same file.

**Tech Stack:** Swift 6, SwiftUI, XCTest (source-guard pattern — brace-balanced closure extraction, no fixed-character windows).

## Global Constraints

- iOS 16.0+ ; Swift 6 ; aucune nouvelle dépendance externe.
- Décisions produit côté `apps/ios/` (SDK purity) — ce chantier est 100% app-side (`ConversationView.swift`, deux sites d'action `.more`), rien à toucher côté SDK. `UserPreferencesManager.shared.privacy.showReadReceipts` (SDK, `packages/MeeshySDK/Sources/MeeshySDK/Services/UserPreferencesManager.swift` + `PreferenceModels.swift:166`) est consommé en lecture seule, exactement comme le font déjà `ConversationView.swift:1847` et `MessageOverlayMenu.swift:163` — aucune modification SDK requise.
- **Collision de fichier avec un AUTRE chantier** (`attachment-media-action-menu`, spec `docs/superpowers/specs/2026-08-11-attachment-media-action-menu-design.md`) : les deux modifient `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`. Zones disjointes (ce plan : ~1807-1810 + ~1976-1982 ; l'autre : le bloc `MessageMoreSheet(...)` ~728-772), mais **ne JAMAIS exécuter ce plan en parallèle de l'autre dans deux worktrees sans rebase** — merger l'un avant l'autre, ou rebaser avant de committer le second.
- NE JAMAIS committer le churn `project.pbxproj`/`Meeshy.xcscheme`/`Package.resolved` : `git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved` avant chaque commit.
- Tests app : simulateur iPhone 16 Pro UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`. `-only-testing` sélectionne des CLASSES, pas des fichiers.
- Commits : convention `fix(ios):` en français, SANS trailer Co-Authored-By.
- Commande de build/test complète : `./apps/ios/meeshy.sh test` (gate final uniquement — trop lent par tâche).
- Commandes de test réutilisées dans les tâches (adapter `<Classe>`) :
```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/<Classe> -derivedDataPath apps/ios/Build -quiet
```
- `ctx` (`MessageMenuContext`) n'est PAS en portée à aucun des deux call sites (vérifié) : `nativeMenuButton(_ action:msg:)` a la signature `(PrimaryAction, Message)` et `ctx` est construit en amont dans `buildNativeMessageMenu` sans être transmis ; `onShowMore` est une closure de `overlayMenuContent` qui ne construit aucun `MessageMenuContext` (celui de l'overlay vit dans `MessageOverlayMenu.menuContext`, privé, autre fichier). Chaque site lit donc `UserPreferencesManager.shared.privacy.showReadReceipts` directement — pas de refactor de signature dans ce lot (l'alternative "passer `ctx`/`showReadReceipts: Bool` en paramètre" a été explicitement écartée par la spec comme hors périmètre minimal).
- Rien d'autre ne change : la bande d'icônes horizontale (`explorableTabStrip`) affiche toujours `allMoreItems` (toutes les actions, pas seulement les explorables) ; le bouton "x" de `inlineContent(for:)` réaffiche déjà la grille complète en remettant `selectedItem = nil` — ces deux mécanismes existent déjà et ne doivent pas être touchés.
- Non-régression explicite : `MessageActionResolverTests` (`apps/ios/MeeshyTests/Unit/Components/MessageActionResolverTests.swift:190-215`) couvre déjà `showReadReceipts` true/false sur `moreSections` — ce plan ne touche PAS `MessageActionResolver.swift`, aucune modification n'y est prévue ni nécessaire.

---

## Contexte vérifié (ne pas re-découvrir)

Deux call sites de l'action `.more` dans `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`, tous deux posant aujourd'hui `moreSheetInitialItem = nil` (vérifié par `grep -Fn "moreSheetInitialItem = nil"` — exactement 2 occurrences, lignes 1808 et 1978 au moment de l'écriture de ce plan) :

1. **Overlay appui-long custom** (`MessageOverlayMenu`) — `onShowMore` closure dans `overlayMenuContent` (déclenché par `MessageOverlayMenu.handlePrimaryAction` → `case .more: onShowMore?()`, `MessageOverlayMenu.swift:185-186`).
2. **Menu contextuel natif iOS 26** — `case .more:` dans `nativeMenuButton(_:msg:)`, appelé depuis `buildNativeMessageMenu`.

`moreSheetInitialItem = nil` fait afficher `MessageMoreSheet` sur sa grille complète. `MessageMoreSheet.onAppear` (`MessageMoreSheet.swift:88-93`) ne teste QUE `isExploration(initialItem)` (pas l'appartenance à `sections`) — donc poser `initialItem = .views` pour un utilisateur `showReadReceipts == false` ouvrirait quand même la vue "Qui a vu" (elle est explorable), sur une feuille que le serveur ne remplira jamais : fuite UX/confidentialité, pas un crash. D'où le repli explicite sur `nil` (grille complète) quand `showReadReceipts == false`, jamais un `initialItem` pointant vers un item absent de `moreSections(_:)` (`MessageActionResolver.swift:100-103` : `.views` n'apparaît dans `.info` que si `ctx.showReadReceipts`).

Précédent exact pour le mécanisme `initialItem` déjà en production, inchangé : `ConversationView.swift:1259` (`onShowMessageInfo`) et `:1267` (`onShowReadStatus`) posent déjà `overlayState.moreSheetInitialItem = .views` sans condition (ce sont des taps directs sur le compteur de vues d'un message déjà envoyé par l'utilisateur courant — hors périmètre, ne pas toucher).

---

### Task 1: Overlay appui-long custom — `onShowMore` gate sur `showReadReceipts`

**Files:**
- Create: `apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (closure `onShowMore` dans `overlayMenuContent`, actuellement lignes 1807-1810)

**Interfaces:**
- Consumes (existant, non modifié) : `UserPreferencesManager.shared.privacy.showReadReceipts: Bool` (SDK) ; `MoreItem.views` (enum case, `MessageActionResolver.swift:19`) ; `overlayState.moreSheetInitialItem: MoreItem?` (propriété déclarée `ConversationView.swift:44`).
- Produces : le fichier de test `MessageMoreJumpsToViewsGuardTests.swift` avec les helpers `source(_:)` et `closureBody(after:in:)` — réutilisés tels quels par la Task 2 (mêmes signatures, ne pas les renommer).

- [ ] **Step 1: Write the failing test**

Crée `apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift` :

```swift
import XCTest
@testable import Meeshy

/// Garde de source pour "Plus…" → ouverture directe sur "Vues" (accusés de
/// lecture), sur les DEUX call sites de l'action `.more` (overlay appui-long
/// custom + menu contextuel natif iOS 26). `ctx`/`MessageMenuContext` n'est en
/// portée à aucun des deux sites (vérifié) — la source de vérité lue
/// directement est `UserPreferencesManager.shared.privacy.showReadReceipts`,
/// exactement comme `ConversationView.swift:1847` et `MessageOverlayMenu.swift:163`.
///
/// Précédents : `CallDetailRoutingTests`, `ConversationMenuSystemDesignGuardTests`
/// — même fichier (`ConversationView.swift`), même pattern d'extraction de
/// closure balancée sur les accolades (PAS de fenêtre de caractères fixe).
///
/// Voir `docs/superpowers/specs/2026-08-11-message-more-jumps-to-views-design.md`.
@MainActor
final class MessageMoreJumpsToViewsGuardTests: XCTestCase {

    private func source(_ path: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/\(path)")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Extrait le corps d'une closure/case en équilibrant ses accolades — PAS
    /// une fenêtre de caractères fixe (leçon repo : ça pourrit dès qu'un
    /// commentaire s'ajoute en tête). `marker` doit se terminer par "{".
    private func closureBody(after marker: String, in source: String) -> String? {
        guard let open = source.range(of: marker) else { return nil }
        var depth = 1
        var index = open.upperBound
        while index < source.endIndex {
            let ch = source[index]
            if ch == "{" { depth += 1 }
            if ch == "}" {
                depth -= 1
                if depth == 0 { return String(source[open.upperBound..<index]) }
            }
            index = source.index(after: index)
        }
        return nil
    }

    // MARK: - Site 1 : overlay appui-long custom (`onShowMore`)

    func test_overlayOnShowMore_gatesInitialItemOnShowReadReceipts() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let body = closureBody(after: "onShowMore: {", in: view) else {
            XCTFail("ConversationView must define the onShowMore closure passed to MessageOverlayMenu")
            return
        }
        XCTAssertFalse(
            body.contains("moreSheetInitialItem = nil"),
            "onShowMore must no longer hard-code moreSheetInitialItem = nil — « Plus… » must " +
            "jump straight to Vues when the user shares read receipts (2026-08-11 spec)."
        )
        XCTAssertTrue(
            body.contains("UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil"),
            "onShowMore must gate moreSheetInitialItem on showReadReceipts directly (ctx is not " +
            "in scope here), falling back to nil (full grid) when reciprocity is off — never " +
            "pointing initialItem at an item absent from moreSections."
        )
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/MessageMoreJumpsToViewsGuardTests -derivedDataPath apps/ios/Build -quiet
```
Expected: FAIL — both `XCTAssertFalse` and `XCTAssertTrue` fail, because the current closure body is still `overlayState.moreSheetInitialItem = nil`.

- [ ] **Step 3: Write minimal implementation**

In `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`, inside `overlayMenuContent`, locate the `onShowMore` closure (currently around line 1807):

```swift
                onShowMore: {
                    overlayState.moreSheetInitialItem = nil
                    overlayState.detailSheetMessage = msg
                },
```

Replace with:

```swift
                onShowMore: {
                    overlayState.moreSheetInitialItem =
                        UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil
                    overlayState.detailSheetMessage = msg
                },
```

- [ ] **Step 4: Run test to verify it passes**

Re-run the same two `xcodebuild` commands from Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift
git commit -m "$(cat <<'EOF'
fix(ios): "Plus…" ouvre directement "Vues" (overlay appui-long)
EOF
)"
```

---

### Task 2: Menu contextuel natif iOS 26 — `case .more:` gate sur `showReadReceipts` + invariant global

**Files:**
- Modify: `apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift` (ajoute 2 méthodes de test)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift` (`case .more:` dans `nativeMenuButton(_:msg:)`, actuellement lignes 1976-1982)

**Interfaces:**
- Consumes : les helpers `source(_:)` et `closureBody(after:in:)` créés en Task 1, dans le même fichier de test (mêmes signatures, ne pas les dupliquer).
- Produces : rien de nouveau consommé par une tâche ultérieure — dernière tâche de code de ce plan (Task 3 est vérification pure).

Note ligne : les numéros de ligne ci-dessous (1976-1982) sont ceux du fichier AVANT la Task 1. L'édit de la Task 1 ajoute une ligne dans `onShowMore` (le ternaire prend 2 lignes au lieu d'une), donc ce bloc a dérivé à ~1977-1983 après Task 1 — sans conséquence : l'outil d'édition matche sur le contenu du bloc (`case .more:` → `Button { ... }`), pas sur un numéro de ligne absolu.

- [ ] **Step 1: Write the failing tests**

Ajoute ces deux méthodes à `apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift`, à l'intérieur de la classe `MessageMoreJumpsToViewsGuardTests`, après `test_overlayOnShowMore_gatesInitialItemOnShowReadReceipts()` :

```swift

    // MARK: - Site 2 : menu contextuel natif iOS 26 (`case .more:` → Button)

    func test_nativeMoreButton_gatesInitialItemOnShowReadReceipts() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        guard let caseRange = view.range(of: "case .more:") else {
            XCTFail("ConversationView's native menu builder must define a `case .more:` branch")
            return
        }
        let afterCase = String(view[caseRange.upperBound...])
        guard let body = closureBody(after: "Button {", in: afterCase) else {
            XCTFail("The .more case must wrap its action in a Button { } closure")
            return
        }
        XCTAssertFalse(
            body.contains("moreSheetInitialItem = nil"),
            "The native .more Button must no longer hard-code moreSheetInitialItem = nil — same " +
            "jump-to-Vues fix as the overlay site, on the iOS 26 native contextMenu path."
        )
        XCTAssertTrue(
            body.contains("UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil"),
            "The native .more Button must gate moreSheetInitialItem on showReadReceipts directly " +
            "(ctx is built in buildNativeMessageMenu and never passed to nativeMenuButton), falling " +
            "back to nil (full grid) when reciprocity is off."
        )
    }

    // MARK: - Invariant global : aucun 3e chemin, aucune régression du repli

    /// Repli explicite (2026-08-11) : si un futur refactor supprime la branche
    /// `: nil` du ternaire (ex. en codant en dur `.views` sans condition), plus
    /// aucune occurrence de la chaîne littérale ne resterait pour l'attraper —
    /// ce test lit donc les DEUX sites en une passe, indépendamment des deux
    /// tests ciblés ci-dessus.
    func test_noUnconditionalNilFallbackRemainsOnEitherMoreSite() throws {
        let view = try source("Features/Main/Views/ConversationView.swift")
        let occurrences = view.components(separatedBy: "moreSheetInitialItem = nil").count - 1
        XCTAssertEqual(
            occurrences, 0,
            "ConversationView must not hard-code `moreSheetInitialItem = nil` anywhere — both " +
            "« Plus… » call sites (overlay + native menu) must gate on " +
            "UserPreferencesManager.shared.privacy.showReadReceipts instead."
        )
    }
```

- [ ] **Step 2: Run test to verify it fails**

```bash
xcodebuild build-for-testing -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "generic/platform=iOS Simulator" -derivedDataPath apps/ios/Build -quiet
xcodebuild test-without-building -project apps/ios/Meeshy.xcodeproj -scheme Meeshy \
  -destination "platform=iOS Simulator,id=30BFD3A6-C80B-489D-825E-5D14D6FCCAB5" \
  -only-testing:MeeshyTests/MessageMoreJumpsToViewsGuardTests -derivedDataPath apps/ios/Build -quiet
```
Expected: `test_overlayOnShowMore_gatesInitialItemOnShowReadReceipts` PASSES (Task 1 already fixed that site). `test_nativeMoreButton_gatesInitialItemOnShowReadReceipts` FAILS (site 2 still hard-codes `nil`). `test_noUnconditionalNilFallbackRemainsOnEitherMoreSite` FAILS (1 occurrence remains, expected 0).

- [ ] **Step 3: Write minimal implementation**

In `apps/ios/Meeshy/Features/Main/Views/ConversationView.swift`, inside `nativeMenuButton(_:msg:)`, locate the `case .more:` branch:

```swift
        case .more:
            Button {
                overlayState.moreSheetInitialItem = nil
                overlayState.detailSheetMessage = msg
            } label: {
                Label(String(localized: "action.more", defaultValue: "Plus…", bundle: .main), systemImage: "ellipsis")
            }
```

Replace with:

```swift
        case .more:
            Button {
                overlayState.moreSheetInitialItem =
                    UserPreferencesManager.shared.privacy.showReadReceipts ? .views : nil
                overlayState.detailSheetMessage = msg
            } label: {
                Label(String(localized: "action.more", defaultValue: "Plus…", bundle: .main), systemImage: "ellipsis")
            }
```

- [ ] **Step 4: Run test to verify it passes**

Re-run the same two `xcodebuild` commands from Step 2.
Expected: PASS — all 3 methods of `MessageMoreJumpsToViewsGuardTests` green.

- [ ] **Step 5: Commit**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git add apps/ios/Meeshy/Features/Main/Views/ConversationView.swift \
        apps/ios/MeeshyTests/Unit/Views/MessageMoreJumpsToViewsGuardTests.swift
git commit -m "$(cat <<'EOF'
fix(ios): "Plus…" ouvre directement "Vues" (menu natif iOS 26)
EOF
)"
```

---

### Task 3: Full regression gate

**Files:** none modified — verification only.

**Interfaces:**
- Consumes: everything produced by Task 1 and Task 2.
- Produces: nothing (terminal task).

- [ ] **Step 1: Run the full phased test suite**

```bash
./apps/ios/meeshy.sh test
```
Expected: exit code 0. All phases green (phase0 SDK, phase1 isolated, phase2 content/connexion, phase3 connected-session), including:
- `MessageMoreJumpsToViewsGuardTests` (new, this plan) — 3/3 green.
- `CallDetailRoutingTests` and `ConversationMenuSystemDesignGuardTests` (same-file precedents, non-regression) — green.
- `MessageActionResolverTests` (untouched by this plan — `MessageActionResolver.swift` was not modified) — green, including `test_moreSections_sharing_offersViews` / `test_moreSections_optedOut_hidesViews` / `test_moreSections_optedOut_keepsTheOtherInfoEntries`.

- [ ] **Step 2: Clean any generated churn**

```bash
git checkout -- apps/ios/Meeshy.xcodeproj apps/ios/Package.resolved
git status
```
Expected: working tree clean except the two commits already made in Task 1 and Task 2 (no residual diff — `meeshy.sh test` does not run `xcodegen`, but SPM resolution during build can still touch `Package.resolved`; discard it, never commit it).

- [ ] **Step 3: Manual smoke check (optional but recommended before merge)**

Using the `ios-simulator` skill against the iPhone 16 Pro simulator (UDID `30BFD3A6-C80B-489D-825E-5D14D6FCCAB5`):
1. Open a conversation with at least one sent message that has been read by the recipient.
2. Long-press the message → tap "Plus…" in the overlay → confirm `MessageMoreSheet` opens directly on the "Qui a vu" (Vues) detail, with the horizontal icon strip showing `.views` as the active tab.
3. Tap the "x" close button on the inline detail → confirm it returns to the full grid (unchanged behavior).
4. In Settings, disable "Partager mes accusés de lecture" (`showReadReceipts = false`). Repeat step 2 → confirm `MessageMoreSheet` now opens on the full grid (no "Vues" tab in the strip, no privacy leak).
5. Repeat steps 2-4 using the native iOS 26 context menu (long-press → system menu, if running iOS 26+) instead of the custom overlay, to confirm parity between both call sites.

---

## Self-Review (writing-plans skill — auto-relecture)

**1. Spec coverage:**
- DEUX call sites (overlay `onShowMore` + menu natif `case .more:`) → Task 1 (site 1) + Task 2 (site 2). ✓
- Comportement cible : `.views` quand `showReadReceipts`, sinon `nil` (grille complète), jamais `translations.first`-style fallback ni un item absent de `sections` → assertions `XCTAssertTrue(body.contains("... ? .views : nil"))` sur les deux sites. ✓
- "Rien d'autre ne change" (bande d'icônes = `allMoreItems` toujours complet ; bouton "x" réaffiche la grille) → documenté dans Global Constraints comme invariant NON touché, aucune tâche ne modifie `MessageMoreSheet.swift`. ✓
- Décision explicite repli `showReadReceipts == false` → `nil` → grille complète → couvert par l'assertion `: nil` du ternaire (Task 1 Step 1, Task 2 Step 1) ET par l'invariant global `test_noUnconditionalNilFallbackRemainsOnEitherMoreSite` (Task 2), qui empêche un futur refactor de supprimer silencieusement la branche `: nil`. ✓
- `ctx` non en portée aux deux sites, lecture directe de `UserPreferencesManager.shared.privacy.showReadReceipts` → documenté en Global Constraints + code des deux tâches lit directement le singleton, pas de paramètre `ctx` ajouté. ✓
- Tests : pattern de source-analysis avec précédents cités (`CallDetailRoutingTests`, `ConversationMenuSystemDesignGuardTests`) → helpers `source(_:)`/`closureBody(after:in:)` copiés du même pattern, brace-balanced (pas de fenêtre fixe). ✓
- Non-régression `MessageActionResolverTests` → cité explicitement en Global Constraints et Task 3 Step 1 ; aucune tâche ne touche `MessageActionResolver.swift`. ✓
- Collision de fichier avec le chantier `attachment-media-action-menu` → section Global Constraints dédiée, zones disjointes listées, règle "pas en parallèle sans rebase". ✓
- Alternative "passer `ctx`/`showReadReceipts` en paramètre" mentionnée par la spec comme non retenue → documentée en Global Constraints comme explicitement écartée (lot minimal = lecture directe du singleton). ✓

**2. Placeholder scan:** Aucun "TBD"/"TODO"/"add appropriate X" — toutes les steps portent soit du code Swift complet, soit une commande shell exécutable, soit des assertions concrètes avec messages d'échec explicites. Le smoke test manuel (Task 3 Step 3) est explicitement marqué "optionnel" et ne fait pas partie du gate automatisé.

**3. Type consistency:** `MoreItem.views`, `overlayState.moreSheetInitialItem: MoreItem?`, `UserPreferencesManager.shared.privacy.showReadReceipts: Bool` utilisés identiquement dans les trois tâches. Le nom de classe de test (`MessageMoreJumpsToViewsGuardTests`) et ses deux helpers (`source(_:)`, `closureBody(after:in:)`) sont introduits en Task 1 et réutilisés à l'identique en Task 2 (mêmes signatures, même fichier, pas de duplication ni de renommage).
