import SwiftUI
import UIKit

enum DeviceLayout {
    static var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    static func isRegular(_ sizeClass: UserInterfaceSizeClass?) -> Bool {
        sizeClass == .regular
    }

    /// The window the app is actually rendered in — the single answer every
    /// window metric is derived from.
    ///
    /// The scene is resolved by `activationState`, never by `connectedScenes.first`
    /// — `connectedScenes` is an *unordered* `Set`, so `.first` can hand back a
    /// background scene in any multi-window configuration.
    ///
    /// Within that scene the key window is preferred, but any of its windows is
    /// a better answer than the display: a scene whose windows are all non-key
    /// for an instant (scene setup) still knows how much room the app has, and
    /// falling through to `UIScreen` there would reintroduce the very bug this
    /// resolves. `nil` means no foreground scene exists at all (teardown,
    /// background refresh) — no layout is happening then.
    ///
    /// Written as a plain loop with early exit rather than
    /// `compactMap { … }.first { … }`, which would allocate an intermediate
    /// array on every call. This runs inside the `body` of a message-list cell
    /// — the hottest list in the app — so it must stay allocation-free on the
    /// nominal path, per the repo's "keep body pure and fast" rule.
    static var activeWindow: UIWindow? {
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene,
                  windowScene.activationState == .foregroundActive else { continue }
            for window in windowScene.windows where window.isKeyWindow {
                return window
            }
            if let anyWindow = windowScene.windows.first {
                return anyWindow
            }
        }
        return nil
    }

    /// Size of the window the app is actually rendered in.
    ///
    /// `UIScreen.main` is deprecated since iOS 16 *and* reports the physical
    /// display. Under iPad Split View, Slide Over or Stage Manager the app owns
    /// only a fraction of that display, so a ratio taken against the screen is
    /// a ratio of space the app does not have: it inflates until it stops
    /// constraining anything at all.
    ///
    /// Prefer a `GeometryReader`'s own `size` wherever one is already in scope:
    /// this is the answer for views that have no container measurement to read.
    static var windowSize: CGSize {
        activeWindow?.bounds.size ?? UIScreen.main.bounds.size
    }

    /// Safe area of that same window.
    ///
    /// Read it only where a `GeometryReader`'s `safeAreaInsets` cannot be: a
    /// container rendered under `.ignoresSafeArea()` reports flat zeros, which
    /// is how the story composer once ended up sitting on the home indicator.
    ///
    /// `.zero` when no foreground window exists — an inset is *added* to layout
    /// heights and *compared* against thresholds, so the absent value has to
    /// read as "no inset", never as a subtraction.
    static var safeAreaInsets: UIEdgeInsets {
        activeWindow?.safeAreaInsets ?? .zero
    }

    /// Scene hosting that same window — for the few callers that address the
    /// scene itself (window title, geometry requests) rather than measure it.
    static var activeWindowScene: UIWindowScene? {
        activeWindow?.windowScene
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

    static func sheetMaxHeight(screenHeight: CGFloat, sizeClass: UserInterfaceSizeClass?) -> CGFloat {
        if sizeClass == .regular {
            return min(screenHeight * 0.72, 720)
        }
        return screenHeight * 0.85
    }

    static func pickerSheetHeight(screenHeight: CGFloat, sizeClass: UserInterfaceSizeClass?) -> CGFloat {
        if sizeClass == .regular {
            return min(screenHeight * 0.55, 640)
        }
        return screenHeight * 0.65
    }
}

extension View {
    /// Applies sensible presentation detents on iPad form-sheet contexts.
    /// On compact (iPhone) returns the view unchanged so existing sheet
    /// layouts (which often manage their own heights) remain in control.
    @ViewBuilder
    func adaptivePresentationDetents(_ detents: Set<PresentationDetent> = [.medium, .large]) -> some View {
        if #available(iOS 16.0, *) {
            self.presentationDetents(detents)
        } else {
            self
        }
    }
}
