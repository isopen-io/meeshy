# PostDetailView — Header auteur révélé au scroll — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre le header de `PostDetailView` flottant/translucide et y révéler l'auteur (avatar + nom + date) centré au scroll, en réutilisant `CollapsibleHeader` du SDK.

**Architecture:** On étend `CollapsibleHeader` (SDK MeeshyUI) avec un slot générique optionnel « centre révélé » dont l'opacité est pilotée par une courbe pure (`revealOpacity(forProgress:)`). `PostDetailView` passe d'un `navBar` opaque poussant le contenu à un `CollapsibleHeader` flottant en `ZStack`, avec tracking du scroll via `ScrollOffsetPreferenceKey` (sentinel `GeometryReader` en tête du `ScrollView` + padding sur le contenu → `minY≈0` au repos ; pattern de `SettingsView`/`NotificationListView`, pas celui de `MeeshyRefreshableScroll`). Le bloc auteur inline (`textZone`) et ses drapeaux Prisme restent inchangés.

**Tech Stack:** SwiftUI (iOS 16+, Swift 6), SPM, XCTest. Build via `./apps/ios/meeshy.sh`, tests SDK via `xcodebuild -scheme MeeshySDK-Package`.

**Spec:** `docs/superpowers/specs/2026-06-14-ios-postdetail-collapsible-author-header-design.md`

---

## File Structure

| Fichier | Rôle | Action |
|---|---|---|
| `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift` | Header foldable réutilisable | Modifier : +generic `CenterContent`, +slot `centerReveal`, +`revealOpacity`, +overlay centré, MAJ des 3 inits |
| `packages/MeeshySDK/Tests/MeeshyUITests/Navigation/CollapsibleHeaderRevealTests.swift` | Test logique pure | Créer |
| `packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/CompatibilityLayerTests.swift` | Test rétro-compat instanciation | Modifier : +cas avec `centerReveal` |
| `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift` | Page détail post | Modifier : remplacer `navBar` par `CollapsibleHeader` flottant, ZStack + tracking scroll, `authorRevealView`, `postMenu` |

**Note rétro-compatibilité :** l'ajout d'un 4ᵉ paramètre générique `CenterContent` impose de contraindre `CenterContent == EmptyView` sur les 3 inits existantes. Les 8 call sites (`FeedView`, `SettingsView`, `ProfileView`, `LinksHubView`, `ContactsHubView`, `ConversationListView+Overlays`, `NotificationListView`, `CommunityListView`) n'écrivent jamais les génériques explicitement → ils restent inchangés et compilent.

---

## Task 1: Courbe pure `revealOpacity` dans CollapsibleHeader

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift`
- Test: `packages/MeeshySDK/Tests/MeeshyUITests/Navigation/CollapsibleHeaderRevealTests.swift`

- [ ] **Step 1: Write the failing test**

Create `packages/MeeshySDK/Tests/MeeshyUITests/Navigation/CollapsibleHeaderRevealTests.swift`:

```swift
import XCTest
import SwiftUI
@testable import MeeshyUI

// Pure-logic suite — NOT @MainActor (MeeshyUI defaultIsolation is MainActor;
// the function under test is `nonisolated`, so the test must stay off the actor).
final class CollapsibleHeaderRevealTests: XCTestCase {

    func test_revealOpacity_atRest_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_belowStartThreshold_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.5), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_atStartThreshold_isZero() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.6), 0, accuracy: 0.0001)
    }

    func test_revealOpacity_fullyCollapsed_isOne() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 1), 1, accuracy: 0.0001)
    }

    func test_revealOpacity_midReveal_isHalf() {
        // start=0.6 → midpoint of the reveal band [0.6, 1.0] is 0.8
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 0.8), 0.5, accuracy: 0.0001)
    }

    func test_revealOpacity_isClampedAboveOne() {
        XCTAssertEqual(CollapsibleHeader<EmptyView, EmptyView, EmptyView, EmptyView>.revealOpacity(forProgress: 1.5), 1, accuracy: 0.0001)
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/CollapsibleHeaderRevealTests -quiet
```
Expected: FAIL — compile error `type 'CollapsibleHeader' ... has no member 'revealOpacity'` AND `CollapsibleHeader` is not yet a 4-generic type.

- [ ] **Step 3: Add the 4th generic + the pure function (minimal)**

In `CollapsibleHeader.swift`, change the type declaration (line 8) to add `CenterContent` and add the `centerReveal` stored property below the existing slots (after `let trailing: () -> TrailingContent`, ~line 19):

```swift
public struct CollapsibleHeader<LeadingContent: View, TitleContent: View, TrailingContent: View, CenterContent: View>: View {
```
```swift
    let trailing: () -> TrailingContent
    let centerReveal: (() -> CenterContent)?
```

Add the pure curve near `progress` (after the `progress` computed property, ~line 52):

```swift
    /// Reveal curve for the centered slot. Stays fully hidden during the first
    /// 60% of the collapse, then fades linearly to fully visible at full
    /// collapse — gives the "author appears once the inline header scrolled
    /// away" feel (style X). Pure + `nonisolated` so it is testable off the
    /// MainActor under MeeshyUI's default isolation.
    nonisolated public static func revealOpacity(forProgress progress: CGFloat) -> CGFloat {
        let start: CGFloat = 0.6
        guard progress > start else { return 0 }
        return min(1, (progress - start) / (1 - start))
    }
```

This step will NOT yet compile the whole file (inits don't set `centerReveal`) — that's Task 2. To get a green test fast, also do Task 2 Step 1's init updates now if needed; otherwise proceed to Task 2 and run the test at the end of Task 2. (The two tasks share the same file; if executing inline, treat Task 1 + Task 2 as one compile unit and run the Task 1 test after Task 2 Step 4.)

- [ ] **Step 4: (Deferred) run test after Task 2 compiles the file**

The `revealOpacity` test passes once Task 2 makes the file compile. Run the same command as Step 2; Expected: PASS (5 tests).

---

## Task 2: Slot générique `centerReveal` + overlay centré

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift`
- Modify: `packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/CompatibilityLayerTests.swift`

- [ ] **Step 1: Constrain the 3 existing inits to `CenterContent == EmptyView`**

In the **main init** (inside the struct, ~lines 24-48), add a `where` clause and set `centerReveal = nil`:

```swift
    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder leading: @escaping () -> LeadingContent,
        @ViewBuilder titleView: @escaping () -> TitleContent,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) where CenterContent == EmptyView {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.leading = leading
        self.titleView = titleView
        self.trailing = trailing
        self.centerReveal = nil
    }
```

In the **convenience init** `extension CollapsibleHeader where LeadingContent == EmptyView, TitleContent == EmptyView` (~lines 201-225), change the constraint and add `centerReveal = nil`:

```swift
extension CollapsibleHeader where LeadingContent == EmptyView, TitleContent == EmptyView, CenterContent == EmptyView {
    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.leading = nil
        self.titleView = nil
        self.trailing = trailing
        self.centerReveal = nil
    }
}
```

In the **convenience init** `extension CollapsibleHeader where LeadingContent == EmptyView` (~lines 229-254), change the constraint and add `centerReveal = nil`:

```swift
extension CollapsibleHeader where LeadingContent == EmptyView, CenterContent == EmptyView {
    public init(
        title: String,
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder titleView: @escaping () -> TitleContent,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.leading = nil
        self.titleView = titleView
        self.trailing = trailing
        self.centerReveal = nil
    }
}
```

- [ ] **Step 2: Add the new convenience init exposing `centerReveal`**

Append a new extension at the end of `CollapsibleHeader.swift`. It targets the PostDetail use case (no leading, no left title; a centered reveal slot + trailing):

```swift
// MARK: - Convenience init (centered reveal slot, no leading, no left title)

extension CollapsibleHeader where LeadingContent == EmptyView, TitleContent == EmptyView {
    public init(
        title: String = "",
        subtitle: String? = nil,
        scrollOffset: CGFloat,
        showBackButton: Bool = true,
        onBack: (() -> Void)? = nil,
        titleColor: Color,
        backArrowColor: Color,
        backgroundColor: Color,
        @ViewBuilder centerReveal: @escaping () -> CenterContent,
        @ViewBuilder trailing: @escaping () -> TrailingContent = { EmptyView() }
    ) {
        self.title = title
        self.subtitle = subtitle
        self.scrollOffset = scrollOffset
        self.showBackButton = showBackButton
        self.onBack = onBack
        self.titleColor = titleColor
        self.backArrowColor = backArrowColor
        self.backgroundColor = backgroundColor
        self.leading = nil
        self.titleView = nil
        self.trailing = trailing
        self.centerReveal = centerReveal
    }
}
```

- [ ] **Step 3: Render the centered reveal overlay in `body`**

In `body`, the header row is the inner `HStack` ending with `.frame(height: headerHeight, alignment: .bottom)` (~line 139). Add a centered, bottom-aligned overlay right after that `.frame(...)` modifier and before the `Divider()` sibling — i.e. attach `.overlay` to the `HStack`:

```swift
            .padding(.horizontal, 12)
            .padding(.bottom, titleBottomPadding)
            .frame(height: headerHeight, alignment: .bottom)
            .overlay(alignment: .bottom) {
                if let centerReveal {
                    centerReveal()
                        .padding(.horizontal, 56)   // réserve l'espace du back button (gauche) + trailing (droite)
                        .padding(.bottom, titleBottomPadding)
                        .opacity(Double(Self.revealOpacity(forProgress: progress)))
                        .offset(y: lerp(6, 0, Self.revealOpacity(forProgress: progress)))
                        .allowsHitTesting(Self.revealOpacity(forProgress: progress) > 0.5)
                        .accessibilityHidden(Self.revealOpacity(forProgress: progress) < 0.5)
                }
            }
```

- [ ] **Step 4: Add a compile-level compat case to `CompatibilityLayerTests.swift`**

Read the two existing `_ = CollapsibleHeader(...)` cases (~lines 92, 102) to match their style, then add a third case exercising the new `centerReveal` init (place it right after the second case, inside the same test function):

```swift
        _ = CollapsibleHeader(
            title: "",
            scrollOffset: 0,
            showBackButton: true,
            titleColor: .primary,
            backArrowColor: .blue,
            backgroundColor: .black,
            centerReveal: { Text("author") },
            trailing: { Image(systemName: "ellipsis") }
        )
```

- [ ] **Step 5: Build SDK + run both test suites**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy && xcodebuild test \
  -scheme MeeshySDK-Package \
  -destination 'platform=iOS Simulator,name=iPhone 16 Pro' \
  -derivedDataPath apps/ios/Build \
  -only-testing:MeeshyUITests/CollapsibleHeaderRevealTests \
  -only-testing:MeeshyUITests/CompatibilityLayerTests -quiet
```
Expected: PASS (CollapsibleHeaderRevealTests 5 tests + CompatibilityLayerTests green). If a call site fails to compile, it means an existing init lost its `CenterContent == EmptyView` constraint — re-check Step 1.

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  packages/MeeshySDK/Sources/MeeshyUI/Navigation/CollapsibleHeader.swift \
  packages/MeeshySDK/Tests/MeeshyUITests/Navigation/CollapsibleHeaderRevealTests.swift \
  packages/MeeshySDK/Tests/MeeshyUITests/Compatibility/CompatibilityLayerTests.swift && \
  git commit -m "feat(sdk): add generic centered-reveal slot to CollapsibleHeader"
```

---

## Task 3: `PostDetailView` — header flottant + tracking scroll + centre révélé

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift`

- [ ] **Step 1: Add scroll-offset state + coordinate-space constant**

Near the other `@State` declarations (after line 26, `composerFocusTrigger`), add:

```swift
    @State private var headerScrollOffset: CGFloat = 0
    private static let scrollSpace = "postDetailScroll"
```

- [ ] **Step 2: Add the `authorRevealView` and `postMenu` builders**

Add these two members (e.g. right after the `navBar` property block, before `// MARK: - Text Zone`):

```swift
    // MARK: - Floating Header (CollapsibleHeader)

    /// Centered author chip revealed in the floating header as the inline
    /// author block scrolls away. Tapping opens the profile sheet (mirrors the
    /// inline name tap).
    @ViewBuilder
    private func authorRevealView(_ post: FeedPost) -> some View {
        Button {
            selectedProfileUser = .from(feedPost: post)
        } label: {
            HStack(spacing: 8) {
                MeeshyAvatar(
                    name: post.author,
                    context: .custom(26),
                    accentColor: post.authorColor,
                    avatarURL: post.authorAvatarURL
                )
                VStack(alignment: .leading, spacing: 1) {
                    Text(post.author)
                        .font(.subheadline.weight(.bold))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    Text(RelativeTimeFormatter.shortString(for: post.timestamp))
                        .font(.caption2)
                        .foregroundColor(theme.textMuted)
                }
            }
        }
        .buttonStyle(.plain)
    }

    /// The `…` menu, lifted out of the old navBar into the header's trailing slot.
    private var postMenu: some View {
        Menu {
            Button {
                Task { await mintShareLink(action: .copyToPasteboard) }
            } label: {
                Label(String(localized: "feed.post.detail.copy_link", defaultValue: "Copier le lien", bundle: .main), systemImage: "link")
            }
            Button {
                Task { await mintShareLink(action: .presentShareSheet) }
            } label: {
                Label(String(localized: "feed.post.detail.share", defaultValue: "Partager", bundle: .main), systemImage: "square.and.arrow.up")
            }
            if displayPost?.authorId == AuthManager.shared.currentUser?.id {
                Button {
                    isEditing = true
                    HapticFeedback.light()
                } label: {
                    Label(String(localized: "feed.post.edit", defaultValue: "Modifier", bundle: .main), systemImage: "pencil")
                }
            }
            Button(role: .destructive) {
                HapticFeedback.light()
                Task { await viewModel.reportPost(postId) }
            } label: {
                Label(String(localized: "feed.post.detail.report", defaultValue: "Signaler", bundle: .main), systemImage: "exclamationmark.triangle")
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.callout.weight(.semibold))
                .foregroundColor(theme.textPrimary)
                .frame(width: 36, height: 36)
                .background(Circle().fill(theme.inputBackground.opacity(0.6)))
        }
    }

    private func postDetailHeader(_ post: FeedPost) -> some View {
        CollapsibleHeader(
            title: "",
            scrollOffset: headerScrollOffset,
            showBackButton: true,
            onBack: { HapticFeedback.light(); router.pop() },
            titleColor: theme.textPrimary,
            backArrowColor: theme.textPrimary,
            backgroundColor: theme.backgroundPrimary,
            centerReveal: { authorRevealView(post) },
            trailing: { postMenu }
        )
    }
```

- [ ] **Step 3: Restructure `body` — float the header over the scroll view**

Replace the current `body` opening (lines 412-445, from `var body: some View {` down to and including the `composer` line, i.e. the whole `VStack(spacing: 0) { … }` block but NOT the trailing modifiers `.background`/`.task`/etc.) with:

```swift
    var body: some View {
        VStack(spacing: 0) {
            // Connection status banner (banner manages its own socket observation)
            ConnectionBanner()

            if let post = displayPost {
                ZStack(alignment: .top) {
                    ScrollViewReader { scrollProxy in
                        ScrollView(showsIndicators: false) {
                            // Sentinel: publishes the scroll offset so the floating
                            // header collapses + reveals the author. Sentinel sits at
                            // the top of the content (before the LazyVStack's top
                            // padding) → minY≈0 at rest, goes negative on scroll.
                            // Same pattern as SettingsView.
                            GeometryReader { geo in
                                Color.clear.preference(
                                    key: ScrollOffsetPreferenceKey.self,
                                    value: geo.frame(in: .named(Self.scrollSpace)).minY
                                )
                            }
                            .frame(height: 0)

                            LazyVStack(spacing: 0) {
                                postDetailContent(post)
                            }
                            .padding(.top, CollapsibleHeaderMetrics.expandedHeight)
                            .padding(.bottom, 80)
                        }
                        .coordinateSpace(name: Self.scrollSpace)
                        .onPreferenceChange(ScrollOffsetPreferenceKey.self) { offset in
                            headerScrollOffset = offset
                        }
                        .onAppear {
                            if showComments {
                                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                                    withAnimation {
                                        scrollProxy.scrollTo("commentsSection", anchor: .top)
                                    }
                                    composerFocusTrigger.toggle()
                                }
                            }
                        }
                    } // ScrollViewReader

                    postDetailHeader(post)
                } // ZStack
            } else if viewModel.isLoading {
                Spacer()
                ProgressView()
                Spacer()
            }

            composer
        }
```

Leave every modifier after the closing `}` of the `VStack` (`.background(...)`, `.navigationBarHidden(true)`, `.task { ... }`, all `.sheet`/`.onReceive`/`.adaptiveOnChange`/`.fullScreenCover`) exactly as-is.

- [ ] **Step 4: Delete the now-unused `navBar` property**

Remove the entire `private var navBar: some View { … }` block (lines ~594-644, the `< ` button + `Menu { … }` whose menu content now lives in `postMenu`). Keep the `// MARK: - Nav Bar` comment removed too.

- [ ] **Step 5: Build the app**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build
```
Expected: BUILD SUCCEEDED. If `navBar` is referenced elsewhere, the compiler will flag it — confirm the only reference was in `body` (now replaced).

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy && git add \
  apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift && \
  git commit -m "feat(ios): floating CollapsibleHeader with scroll-revealed author on PostDetailView"
```

---

## Task 4: Vérification visuelle + non-régression

**Files:** none (verification only)

- [ ] **Step 1: Run on simulator**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh run
```

- [ ] **Step 2: Verify the behavior (open a post detail)**

Confirm, with eyes on the simulator:
- **Au repos** : header minimal translucide — `‹` à gauche, `⋯` à droite, centre vide ; le haut du contenu (bloc auteur) est visible **derrière** le blur.
- **Au scroll** : le header se replie ; **avatar + nom + date** apparaissent **centrés** (fade-in) au moment où le bloc auteur inline passe derrière le header.
- **Prisme intact** : le bloc auteur inline conserve ses drapeaux de langue + icône translate cliquables.
- **Menu `⋯`** : Copier le lien / Partager / Modifier (si auteur) / Signaler fonctionnent.
- **Back `‹`** : revient en arrière. **Scroll-to-comments** : ouvrir le post via une notification/`showComments` scrolle bien vers les commentaires.

- [ ] **Step 3: Verify no regression on screens reusing CollapsibleHeader**

Navigate to **Feed**, **Settings**, **Profile**, **Links hub** and confirm their headers render and collapse exactly as before (the new `centerReveal` slot is absent → no visual change).

- [ ] **Step 4: Tune reveal threshold if needed**

If the author chip appears too early/late relative to the inline block disappearing, adjust `start` in `CollapsibleHeader.revealOpacity(forProgress:)` (Task 1 Step 3) and re-run. Re-run Task 1 test if the midpoint expectation changes.

---

## Self-Review (done before handoff)

- **Spec coverage:** floating translucent header (T3 S3) ✓ ; revealed centered author avatar+name+**date** (T2 S2-S3 + T3 S2) ✓ ; reuse CollapsibleHeader, no custom header / no surface extraction (T2) ✓ ; scroll tracking via ScrollOffsetPreferenceKey (T3 S1/S3) ✓ ; textZone/Prisme untouched (T3 leaves `textZone` intact) ✓ ; backward-compat of 8 call sites (T2 S1/S5) ✓ ; pure testable reveal curve (T1) ✓ ; Reels topics explicitly out of scope (not in any task) ✓.
- **Placeholder scan:** every code step shows full code; commands have expected output. No TBD/TODO.
- **Type consistency:** `revealOpacity(forProgress:)`, `centerReveal`, `CenterContent`, `Self.scrollSpace`, `CollapsibleHeaderMetrics.expandedHeight`, `RelativeTimeFormatter.shortString(for:)`, `AvatarContext.custom(_:)` used consistently across tasks.
