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
    /// fenêtre clé l'emporte ; et seulement quand AUCUNE n'est active, une scène `.foregroundInactive` (Centre de
    /// contrôle, alerte système, appel qui s'annonce), toujours à l'écran (#6633).
    private static var activeWindowScene: UIWindowScene? {
        pickActive(UIApplication.shared.connectedScenes.lazy.compactMap { $0 as? UIWindowScene },
                   isForeground: { windowScene in windowScene.activationState == .foregroundActive },
                   holdsKey: { $0.keyWindow != nil },
                   isOnScreen: { $0.activationState == .foregroundInactive })
    }

    /// Miroir de `DeviceLayout.pickActive` — même ordre de passes, sans allocation.
    static func pickActive<S: Sequence>(_ scenes: S, isForeground: (S.Element) -> Bool,
                                        holdsKey: (S.Element) -> Bool,
                                        isOnScreen: (S.Element) -> Bool) -> S.Element? {
        for scene in scenes where isForeground(scene) && holdsKey(scene) { return scene }
        for scene in scenes where isForeground(scene) { return scene }
        for scene in scenes where isOnScreen(scene) && holdsKey(scene) { return scene }
        for scene in scenes where isOnScreen(scene) { return scene }
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

    /// Safe-area insets of the window the app is actually rendered in.
    /// Without a measurable window, the last MEASURED insets (`.zero` before
    /// any measurement), never a screen-derived guess — miroir de
    /// `DeviceLayout.safeAreaTop` / `safeAreaBottom` (#6633).
    static var safeAreaInsets: UIEdgeInsets {
        let measured = activeWindow?.safeAreaInsets
        if let measured, measured != lastMeasuredInsets { lastMeasuredInsets = measured }
        return insetsRemembering(measured: measured, last: lastMeasuredInsets)
    }

    /// Une marge ne change pas parce qu'une alerte s'affiche : sans fenêtre mesurable, la dernière MESURÉE. Une mesure
    /// qui vaut zéro (paysage, appareil sans encoche) reste la vérité — seule l'absence de mesure se comble.
    static func insetsRemembering(measured: UIEdgeInsets?, last: UIEdgeInsets) -> UIEdgeInsets {
        measured ?? last
    }

    private static var lastMeasuredInsets: UIEdgeInsets = .zero
}
