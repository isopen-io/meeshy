import SwiftUI
import UIKit

enum DeviceLayout {
    static var isPad: Bool {
        UIDevice.current.userInterfaceIdiom == .pad
    }

    static func isRegular(_ sizeClass: UserInterfaceSizeClass?) -> Bool {
        sizeClass == .regular
    }

    /// Size of the window the app is actually rendered in.
    ///
    /// `UIScreen.main` is deprecated since iOS 16 *and* reports the physical
    /// display. Under iPad Split View, Slide Over or Stage Manager the app owns
    /// only a fraction of that display, so a ratio taken against the screen is
    /// a ratio of space the app does not have: it inflates until it stops
    /// constraining anything at all.
    ///
    /// The scene is resolved by `activationState`, never by `connectedScenes.first`
    /// — `connectedScenes` is an *unordered* `Set`, so `.first` can hand back a
    /// background scene in any multi-window configuration.
    ///
    /// Within that scene the key window is preferred, but any of its windows is
    /// a better answer than the display: a scene whose windows are all non-key
    /// for an instant (scene setup) still knows how much room the app has, and
    /// falling through to `UIScreen` there would reintroduce the very bug this
    /// resolves. The display is the last resort only when no foreground scene
    /// exists at all (teardown, background refresh) — no layout is happening then.
    ///
    /// Prefer a `GeometryReader`'s own `size` wherever one is already in scope:
    /// this is the answer for views that have no container measurement to read.
    static var windowSize: CGSize {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first(where: { $0.activationState == .foregroundActive })
        let window = scene?.windows.first(where: { $0.isKeyWindow }) ?? scene?.windows.first
        return window?.bounds.size ?? UIScreen.main.bounds.size
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
