import UIKit

/// SDK-local twin of `apps/ios/Meeshy/Core/DeviceLayout.windowSize` — the
/// `MeeshyUI` package cannot depend on the app target, so this mirrors the
/// exact same resolution algorithm rather than importing it. Any change to
/// one must be mirrored in the other.
///
/// `UIScreen.main` is deprecated since iOS 16 and reports the physical
/// display; under iPad Split View, Slide Over or Stage Manager the app owns
/// only a fraction of it, so a size taken from the screen is a size the app
/// does not have. The scene is picked by `activationState`, never by
/// `connectedScenes.first`: `connectedScenes` is an unordered `Set`, so
/// `.first` routinely hands back a background scene under multi-window.
public enum WindowMetrics {
    /// Miroir de `DeviceLayout.activeWindowScene` : deux scènes au premier plan (fenêtre détachée) — celle qui tient la
    /// fenêtre clé l'emporte.
    private static var activeWindowScene: UIWindowScene? {
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene, windowScene.activationState == .foregroundActive,
                  windowScene.keyWindow != nil else { continue }
            return windowScene
        }
        for scene in UIApplication.shared.connectedScenes {
            guard let windowScene = scene as? UIWindowScene,
                  windowScene.activationState == .foregroundActive else { continue }
            return windowScene
        }
        return nil
    }

    /// L'unique lecture de l'écran principal du module.
    public static var mainScreen: UIScreen { UIScreen.main }

    public static var physicalDisplay: DisplayMetrics {
        let screen = mainScreen
        return DisplayMetrics(points: screen.bounds.size, scale: screen.scale)
    }

    static var activeWindow: UIWindow? {
        guard let scene = activeWindowScene else { return nil }
        for window in scene.windows where window.isKeyWindow {
            return window
        }
        return scene.windows.first
    }

    /// Size of the window the app is actually rendered in. Falls back to the
    /// physical display only when no foreground scene exists (teardown,
    /// background refresh) — no layout is happening then.
    static var windowSize: CGSize {
        activeWindow?.bounds.size ?? physicalDisplay.points
    }

    /// Trame de la fenêtre active en coordonnées d'ÉCRAN — l'espace des trames de clavier. `nil` sans fenêtre.
    public static var activeWindowFrameInScreen: CGRect? {
        guard let window = activeWindow else { return nil }
        return window.convert(window.bounds, to: window.screen.coordinateSpace)
    }

    /// Safe-area insets of the window the app is actually rendered in. `.zero`
    /// is the correct last resort rather than a screen-derived guess: it is
    /// the honest value on a device with no home indicator/notch, and when no
    /// foreground scene exists nothing is being laid out anyway.
    static var safeAreaInsets: UIEdgeInsets {
        activeWindow?.safeAreaInsets ?? .zero
    }
}
