import SwiftUI
import UIKit

enum DeviceLayout {
    static var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    /// The scene the app is actually on screen in.
    ///
    /// Resolved by `activationState`, never by `connectedScenes.first`:
    /// `connectedScenes` is an *unordered* `Set`, so `.first` hands back an
    /// arbitrary scene, which under Split View, Slide Over or Stage Manager is
    /// routinely a **background** one. Every geometry read and every
    /// scene-targeted request below goes through this one resolution so the
    /// answer cannot drift between call sites.
    ///
    /// Written as a plain loop with early exit rather than
    /// `compactMap { … }.first { … }`, which would allocate an intermediate
    /// array on every call. `windowSize` runs inside the `body` of a
    /// message-list cell — the hottest list in the app — so this must stay
    /// allocation-free on the nominal path, per the repo's "keep body pure and
    /// fast" rule.
    static var activeWindowScene: UIWindowScene? {
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene,
                  windowScene.activationState == .foregroundActive else { continue }
            return windowScene
        }
        return nil
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
        measurementWindow?.bounds.size ?? UIScreen.main.bounds.size
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
    static func bubbleMaxWidth(sizeClass: UserInterfaceSizeClass?) -> CGFloat {
        bubbleMaxWidth(containerWidth: windowSize.width, sizeClass: sizeClass)
    }
}
