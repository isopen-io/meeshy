import SwiftUI

/// La taille de la fenêtre qui PORTE la vue, publiée par la racine de chaque fenêtre.
///
/// `WindowMetrics.windowSize` (et `DeviceLayout.windowSize` côté app) lisent la fenêtre CLÉ de la scène active : avec
/// deux fenêtres de l'app à l'écran (Split View, Stage Manager, fenêtre détachée), une vue de l'autre fenêtre mesurait
/// la mauvaise, et aucune des deux lectures ne relance un rendu quand la fenêtre change de taille. Cette valeur est
/// mesurée par la mise en page, par fenêtre, et suit chaque redimensionnement. `nil` hors d'une racine qui la publie.
public enum SceneWindowSize {
    /// La taille mesurée, ou — tant qu'aucune mesure n'existe — le repli (la fenêtre active).
    public static func resolve(_ measured: CGSize?, fallback: @autoclosure () -> CGSize) -> CGSize {
        guard let measured, measured.width > 0, measured.height > 0 else { return fallback() }
        return measured
    }
}

public extension SceneWindowSize {
    /// Les marges publiées, sinon celles que la racine a déjà mesurées, sinon zéro le temps d'une passe. Une marge
    /// nulle EST une mesure (appareil sans encoche) : seul `nil` se replie. **Jamais la fenêtre** (#12470) : un
    /// `fullScreenCover` ne reçoit pas la publication, et lire `UIWindow.safeAreaInsets` pendant son `body` rappelle le
    /// contrôleur hôte (`statusBarHidden`) — cycle du graphe, puis gel jusqu'au chien de garde.
    static func resolveInsets(_ published: EdgeInsets?, remembered: EdgeInsets? = RememberedSceneInsets.last) -> EdgeInsets {
        published ?? remembered ?? EdgeInsets()
    }
}

/// Les dernières marges qu'une racine publiante a mesurées, hors de `body` (#12470). C'est le repli des écrans qui ne
/// reçoivent pas `\.sceneSafeAreaInsets` — `fullScreenCover`, présentés dans la même fenêtre, donc aux mêmes marges.
public enum RememberedSceneInsets {
    public internal(set) static var last: EdgeInsets?
}

private struct SceneSafeAreaInsetsKey: EnvironmentKey {
    static let defaultValue: EdgeInsets? = nil
}

public extension EnvironmentValues {
    /// Les marges sûres de la fenêtre qui PORTE la vue, clavier exclu, publiées par sa racine. Lues hors de `body`
    /// (`onGeometryChange`) : jamais l'aller-retour UIKit qui réentrait dans la mise à jour en cours (#10566).
    var sceneSafeAreaInsets: EdgeInsets? {
        get { self[SceneSafeAreaInsetsKey.self] }
        set { self[SceneSafeAreaInsetsKey.self] = newValue }
    }
}

private struct SceneWindowSizeKey: EnvironmentKey {
    static let defaultValue: CGSize? = nil
}

public extension EnvironmentValues {
    var sceneWindowSize: CGSize? {
        get { self[SceneWindowSizeKey.self] }
        set { self[SceneWindowSizeKey.self] = newValue }
    }
}

public extension View {
    /// À poser sur la RACINE d'une fenêtre : mesure la fenêtre entière (zones sûres comprises) et la publie.
    func publishingSceneWindowSize() -> some View {
        modifier(SceneWindowSizePublisher())
    }
}

private struct SceneWindowSizePublisher: ViewModifier {
    @State private var measured: CGSize?
    @State private var insets: EdgeInsets?

    func body(content: Content) -> some View {
        content
            .environment(\.sceneWindowSize, measured)
            .environment(\.sceneSafeAreaInsets, insets)
            // Les marges de la racine, CLAVIER EXCLU (le fond s'étend sous lui) : barre d'état, indicateur d'accueil,
            // encoche — celles que les vues sous `.ignoresSafeArea()` ne savent plus lire elles-mêmes.
            .background(
                Color.clear
                    .onGeometryChange(for: EdgeInsets.self) { $0.safeAreaInsets } action: { measuredInsets in
                        if insets != measuredInsets { insets = measuredInsets }
                        if RememberedSceneInsets.last != measuredInsets { RememberedSceneInsets.last = measuredInsets }
                    }
                    .ignoresSafeArea(.keyboard)
            )
            // Lu sur un fond qui ignore les zones sûres : la fenêtre ENTIÈRE, comme `window.bounds`. Hors de `body`
            // (`onGeometryChange`), donc sans réentrer dans la mise à jour en cours.
            .background(
                Color.clear
                    .onGeometryChange(for: CGSize.self) { $0.size } action: { size in
                        if measured != size { measured = size }
                    }
                    .ignoresSafeArea()
            )
    }
}
