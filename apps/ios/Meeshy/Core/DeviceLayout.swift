import SwiftUI
import UIKit
import MeeshyUI

enum DeviceLayout {
    /// The scene the app is actually on screen in.
    ///
    /// Resolved by `activationState`, never by `connectedScenes.first`:
    /// `connectedScenes` is an *unordered* `Set`, so `.first` hands back an
    /// arbitrary scene, which under Split View, Slide Over or Stage Manager is
    /// routinely a **background** one. Every geometry read and every
    /// scene-targeted request below goes through this one resolution so the
    /// answer cannot drift between call sites.
    ///
    /// Written as a plain loop with early exit over the LAZY `windowScenes`
    /// rather than `compactMap { … }.first { … }`, which would allocate an
    /// intermediate array on every call. `windowSize` runs inside the `body` of
    /// a message-list cell — the hottest list in the app — so this must stay
    /// allocation-free on the nominal path, per the repo's "keep body pure and
    /// fast" rule.
    static var activeWindowScene: UIWindowScene? {
        pickActive(windowScenes, isForeground: { $0.activationState == .foregroundActive }, holdsKey: { $0.keyWindow != nil })
    }

    /// Quelle scène est « la » scène active. Avec une fenêtre détachée, DEUX scènes de l'app peuvent être au premier
    /// plan à la fois (Split View, Stage Manager) : celle qui tient la fenêtre CLÉ est celle où l'utilisateur agit — une
    /// feuille présentée, une mesure prise, vont là. À défaut, la première au premier plan. Deux passes sans allocation.
    static func pickActive<S: Sequence>(_ scenes: S, isForeground: (S.Element) -> Bool,
                                        holdsKey: (S.Element) -> Bool) -> S.Element? {
        for scene in scenes where isForeground(scene) && holdsKey(scene) { return scene }
        for scene in scenes where isForeground(scene) { return scene }
        return nil
    }

    /// The app's window scenes — the ONE place `connectedScenes` is read, so
    /// the active-scene resolution and the all-scenes question below cannot
    /// drift into two walks. Lazy: iterating it allocates nothing.
    private static var windowScenes: some Sequence<UIWindowScene> {
        UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene }
    }

    /// Plus d'une scène connectée : une fenêtre détachée existe, la principale peut ne pas être devant.
    static var hasSeveralScenes: Bool { windowScenes.dropFirst().contains { _ in true } }

    /// Every visible window of every connected scene.
    ///
    /// The one question that is genuinely about ALL scenes rather than about
    /// the one on screen: the app-switcher veil (#9574) must cover each scene
    /// the system is about to snapshot, and on iPad every scene of the app is
    /// snapshotted. It is asked from `willResignActive`, while the scene that
    /// was on screen is leaving `.foregroundActive` — `activeWindowScene` may
    /// already answer `nil` there and leave the protected content uncovered.
    /// Order does not matter to a question that visits every window, which is
    /// what makes walking the unordered `Set` correct here and only here.
    static var allVisibleWindows: [UIWindow] {
        windowScenes.flatMap(\.windows).filter { !$0.isHidden }
    }

    /// Whether any screen showing the app is being recorded or mirrored.
    ///
    /// Also a question about ALL scenes: a capture of the external display or of
    /// a Stage Manager window counts as much as one of the scene on screen
    /// (#9617, capture of a disappearing content is announced or black).
    static var anyScreenIsCaptured: Bool {
        windowScenes.contains { $0.screen.isCaptured }
    }

    /// The window to measure against.
    ///
    /// The key window is preferred, but any window of the active scene is a
    /// better answer than the display: a scene whose windows are all non-key for
    /// an instant (scene setup) still knows how much room the app has, and
    /// falling through to `UIScreen` there would reintroduce the very bug this
    /// resolves.
    static var activeWindow: UIWindow? {
        guard let scene = activeWindowScene else { return nil }
        for window in scene.windows where window.isKeyWindow {
            return window
        }
        return scene.windows.first
    }

    /// The window the app MEASURES against: its own normal-level window,
    /// never an overlay floating above it.
    ///
    /// Since #8725 the call screen lives in its own `UIWindow` above the app,
    /// and that window becomes key. Measured off `activeWindow`, the call
    /// view read `safeAreaInsets` of the very window SwiftUI was laying out —
    /// an AttributeGraph cycle (« cycle detected ») after which the call view
    /// never updated again: the caller stayed on « Appel en cours… » with no
    /// microphone control, the callee on « Appel entrant » after answering,
    /// and the peer's video never took the screen (2026-09-30, measured on the
    /// simulator: zero body re-evaluation once the cycle was reported). The
    /// app window and a full-screen overlay share the same insets; reading
    /// the app window breaks the loop.
    static var measurementWindow: UIWindow? {
        guard let scene = activeWindowScene else { return nil }
        var firstNormal: UIWindow?
        for window in scene.windows where window.windowLevel == .normal {
            if window.isKeyWindow { return window }
            if firstNormal == nil { firstNormal = window }
        }
        return firstNormal ?? activeWindow
    }

    /// Size of the window the app is actually rendered in.
    ///
    /// `UIScreen.main` is deprecated since iOS 16 *and* reports the physical
    /// display. Under iPad Split View, Slide Over or Stage Manager the app owns
    /// only a fraction of that display, so a ratio taken against the screen is
    /// a ratio of space the app does not have: it inflates until it stops
    /// constraining anything at all.
    ///
    /// The display is the last resort only when no foreground scene exists
    /// (teardown, background refresh) — no layout is happening then.
    ///
    /// Prefer a `GeometryReader`'s own `size` wherever one is already in scope:
    /// this is the answer for views that have no container measurement to read.
    static var windowSize: CGSize {
        measurementWindow?.bounds.size ?? WindowMetrics.physicalDisplay.points
    }

    /// Bottom safe-area inset of the window the app is actually rendered in.
    ///
    /// `0` is the correct last resort rather than a screen-derived guess: it is
    /// the honest value on a device with no home indicator, and when no
    /// foreground scene exists nothing is being laid out anyway.
    ///
    /// Prefer a `GeometryReader`'s own `safeAreaInsets` wherever one is in
    /// scope. This exists for views rendered inside `.ignoresSafeArea()`, where
    /// the reader reports `0` and the real inset is only knowable from the window.
    static var safeAreaBottom: CGFloat {
        measurementWindow?.safeAreaInsets.bottom ?? 0
    }

    /// Top safe-area inset of the window the app is actually rendered in.
    ///
    /// Doubles as the Dynamic Island probe: the island is present from ~59 pt
    /// up (iPhone 14 Pro → 16 Pro: 59–62), a classic notch reports 44–50. That
    /// discrimination is only sound when the inset comes from the window the
    /// user is looking at — read off a background scene it silently misreads
    /// the hardware.
    static var safeAreaTop: CGFloat {
        measurementWindow?.safeAreaInsets.top ?? 0
    }


    static func bubbleMaxWidth(containerWidth: CGFloat, sizeClass: UserInterfaceSizeClass?) -> CGFloat {
        let ratio: CGFloat = sizeClass == .regular ? 0.62 : 0.70
        let cap: CGFloat = sizeClass == .regular ? 560 : .infinity
        return min(containerWidth * ratio, cap)
    }

    /// Bubble cap for the conversation surfaces, which span the whole window.
    ///
    /// The gutter opposite a bubble is what tells sender from recipient at a
    /// glance; measuring it against the display collapses that gutter to the
    /// row's `Spacer(minLength:)` as soon as the window is narrower than the
    /// screen. Callers that can measure their own container should keep using
    /// `bubbleMaxWidth(containerWidth:sizeClass:)`.
    static func bubbleMaxWidth(sizeClass: UserInterfaceSizeClass?, containerWidth: CGFloat? = nil) -> CGFloat {
        bubbleMaxWidth(containerWidth: containerWidth ?? windowSize.width, sizeClass: sizeClass)
    }
}

/// The bottom safe-area inset as the LAYOUT measures it, for views rendered
/// inside `.ignoresSafeArea()`.
///
/// Reading `DeviceLayout.safeAreaBottom` during a `body` pass asks UIKit for the
/// window's `safeAreaInsets`, which resolves the status bar through SwiftUI's
/// preferences and re-enters the graph update in progress: the story viewer
/// crashed there on 2026-10-10 (« Thread stack size exceeded », #10566), the
/// call screen and the mini-player froze there before it (#8772, #9048).
struct BottomSafeAreaInsetKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}

extension View {
    /// Writes the container's bottom inset — keyboard excluded — into `inset`.
    /// Apply it OUTSIDE the `.ignoresSafeArea()` that flattens the inner readers.
    func measuringBottomSafeArea(into inset: Binding<CGFloat>) -> some View {
        background(
            GeometryReader { proxy in
                Color.clear.preference(key: BottomSafeAreaInsetKey.self, value: proxy.safeAreaInsets.bottom)
            }
            .ignoresSafeArea(.keyboard)
        )
        .onPreferenceChange(BottomSafeAreaInsetKey.self) { measured in
            if inset.wrappedValue != measured { inset.wrappedValue = measured }
        }
    }
}

// MARK: - Les marges de la fenêtre qui porte la vue

/// Les marges sûres PUBLIÉES par la racine de la fenêtre (`\.sceneSafeAreaInsets`, mesurées hors de `body`), chaque
/// bord se repliant SEUL sur la fenêtre clé tant qu'aucune mesure n'existe. Un repli qui lirait les deux bords d'un
/// coup demanderait à UIKit la marge basse pendant le rendu d'une vue qui ne voulait que la haute — l'aller-retour
/// qui réentre la mise à jour en cours et fige le rendu (#10566, #8772, #9048 ; vécu sur la bande du haut).
struct WindowInsets {
    let published: EdgeInsets?
    var top: CGFloat { published?.top ?? DeviceLayout.safeAreaTop }
    var bottom: CGFloat { published?.bottom ?? DeviceLayout.safeAreaBottom }
}

// MARK: - La largeur de la liste qui porte la bulle

/// La largeur RÉELLE de la liste de messages, posée par sa cellule (`MessageListViewController`) : la bulle se mesure à
/// elle — la colonne de l'iPad, une fenêtre détachée, Split View. Mesurées contre la fenêtre (ou contre la colonne de la
/// fenêtre PRINCIPALE, quand une fenêtre détachée était plus étroite), les bulles s'étiraient jusqu'au `Spacer` de la
/// rangée et l'écart qui sépare envoyé et reçu disparaissait. `nil` hors d'une liste : la fenêtre.
private struct BubbleContainerWidthKey: EnvironmentKey {
    static let defaultValue: CGFloat? = nil
}

extension EnvironmentValues {
    var bubbleContainerWidth: CGFloat? {
        get { self[BubbleContainerWidthKey.self] }
        set { self[BubbleContainerWidthKey.self] = newValue }
    }
}
