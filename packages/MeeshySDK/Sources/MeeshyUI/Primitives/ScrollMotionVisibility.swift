import SwiftUI

// MARK: - Scroll Motion Visibility
//
// Loi d'affichage commune à l'application (directive produit 2026-08-14) :
// **une vue en mouvement ne montre pas ses boutons d'action.** Pendant qu'une
// liste défile, les boutons du chrome (appel, recherche, actions de header…)
// s'effacent ; ils reviennent dès que le mouvement s'arrête. Le contenu, lui,
// ne bouge pas d'un point : seule l'incrustation d'actions cède la place.
//
// Deux moitiés, à brancher ensemble :
//   1. une SOURCE déclare le mouvement — `.scrollMotionActive(_:)` quand on
//      dispose du vrai signal UIKit (drag / décélération), ou
//      `.scrollMotionActive(offset:)` quand on n'a que l'offset d'un
//      `ScrollView` SwiftUI, qui s'apaise après `ScrollMotion.settleDelay` ;
//   2. les BOUTONS s'y abonnent — `.hiddenWhileScrolling()`.
//
// La source publie dans l'environnement, donc elle se pose sur n'importe quel
// ancêtre commun : le chrome n'a pas besoin d'être dans le scroll (il en est
// presque toujours le frère, en overlay).

/// Constantes et décisions de la loi « en mouvement ⇒ pas de boutons ».
///
/// `nonisolated` sur le TYPE : `MeeshyUI` compile avec
/// `.defaultIsolation(MainActor.self)` (SE-0466), et ces valeurs pures doivent
/// rester lisibles depuis n'importe quel contexte — y compris les suites de
/// tests, qui gardent l'isolation par défaut de `XCTestCase`.
nonisolated public enum ScrollMotion {
    /// Silence à observer avant de déclarer l'arrêt, pour les sources qui ne
    /// connaissent que l'offset. Une frame de scroll ne dure que ~8 ms : un
    /// délai plus court ferait clignoter les boutons entre deux ticks.
    public static let settleDelay: Duration = .milliseconds(160)

    /// Durée du fondu. Assez courte pour que les boutons soient déjà partis
    /// quand le regard suit le contenu, assez longue pour ne pas claquer.
    public static let fadeDuration: Double = 0.22

    public static var fadeAnimation: Animation { .easeInOut(duration: fadeDuration) }

    public static func opacity(isMoving: Bool) -> Double { isMoving ? 0 : 1 }

    /// Un bouton effacé ne doit plus répondre : le doigt qui freine la liste
    /// atterrit exactement là où le bouton se tenait.
    public static func allowsHitTesting(isMoving: Bool) -> Bool { !isMoving }
}

// MARK: - Environnement

private struct ScrollMotionActiveKey: EnvironmentKey {
    static let defaultValue = false
}

public extension EnvironmentValues {
    /// `true` tant que la vue englobante défile. Défaut `false` : une vue
    /// montée hors de toute source est au repos, donc ses boutons sont là.
    var isScrollMotionActive: Bool {
        get { self[ScrollMotionActiveKey.self] }
        set { self[ScrollMotionActiveKey.self] = newValue }
    }
}

// MARK: - Sources

/// Dérive le mouvement d'un offset qui change à chaque frame puis se tait.
///
/// `.task(id:)` EST le debounce : SwiftUI annule la tâche en cours à chaque
/// nouvelle valeur d'`offset` et en relance une. Le `sleep` n'arrive donc à
/// son terme que lorsque l'offset s'est tu — sans minuterie à retenir, sans
/// `ObservableObject` à démonter (voir la note de `ScrollOffsetRelay` sur la
/// deinit isolée qui tuait le processus sur iOS < 26).
private struct ScrollMotionFromOffset: ViewModifier {
    let offset: CGFloat
    let settleDelay: Duration

    @State private var isMoving = false
    /// `.task(id:)` s'exécute AUSSI au montage, avec l'offset initial : sans
    /// cette garde, tout écran ouvrirait sur des boutons d'action effacés le
    /// temps du premier apaisement. Le montage n'est pas un mouvement.
    @State private var hasMounted = false

    func body(content: Content) -> some View {
        content
            .environment(\.isScrollMotionActive, isMoving)
            .task(id: offset) {
                guard hasMounted else {
                    hasMounted = true
                    return
                }
                if !isMoving { isMoving = true }
                try? await Task.sleep(for: settleDelay)
                guard !Task.isCancelled else { return }
                isMoving = false
            }
    }
}

public extension View {
    /// Déclare que ce sous-arbre défile — à utiliser quand on dispose du vrai
    /// signal de défilement (délégués `UIScrollView` : drag ou décélération).
    func scrollMotionActive(_ isActive: Bool) -> some View {
        environment(\.isScrollMotionActive, isActive)
    }

    /// Déclare le mouvement à partir du seul offset de scroll, pour les
    /// `ScrollView` SwiftUI qui n'exposent pas de phase avant iOS 17.
    func scrollMotionActive(
        offset: CGFloat,
        settleDelay: Duration = ScrollMotion.settleDelay
    ) -> some View {
        modifier(ScrollMotionFromOffset(offset: offset, settleDelay: settleDelay))
    }
}

// MARK: - Consommateurs

private struct HiddenWhileScrolling: ViewModifier {
    @Environment(\.isScrollMotionActive) private var isMoving

    func body(content: Content) -> some View {
        content
            .opacity(ScrollMotion.opacity(isMoving: isMoving))
            .allowsHitTesting(ScrollMotion.allowsHitTesting(isMoving: isMoving))
            .animation(ScrollMotion.fadeAnimation, value: isMoving)
    }
}

public extension View {
    /// Efface ce bouton (ou ce groupe de boutons) tant que la vue englobante
    /// défile, et le ramène à l'arrêt. À réserver aux ACTIONS : le contenu,
    /// l'identité de l'écran et les repères de lecture restent en place.
    func hiddenWhileScrolling() -> some View {
        modifier(HiddenWhileScrolling())
    }
}
