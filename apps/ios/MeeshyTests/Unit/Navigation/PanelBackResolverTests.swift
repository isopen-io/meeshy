import XCTest
@testable import Meeshy

/// Le bouton « retour » des écrans secondaires doit fonctionner dans les TROIS
/// contextes de présentation Meeshy :
///   1. poussé dans le `NavigationStack` iPhone  → `dismiss()` pop la pile
///   2. posé dans le panneau droit iPad          → `dismiss()` est un NO-OP,
///      il faut fermer le panneau (`rightPanelRoute = nil`)
///   3. présenté en sheet / fullScreenCover      → `dismiss()` ferme la modale,
///      et surtout PAS le panneau qui l'héberge
///
/// Sans ce départage, les 9 écrans qui n'avaient que `@Environment(\.dismiss)`
/// (Stats, Affiliation, liens tracking/partage/communauté, export de données,
/// messages suivis, demandes d'amis, édition de profil) offraient un bouton
/// retour totalement inerte sur iPad.
final class PanelBackResolverTests: XCTestCase {

    func test_resolve_whenPresentedModally_usesDismiss() {
        XCTAssertEqual(
            PanelBackResolver.resolve(isPresented: true, hasPanelDismiss: false),
            .dismiss
        )
    }

    /// Cas critique : une sheet ouverte DEPUIS le panneau droit iPad hérite de
    /// la valeur d'environnement `meeshyPanelDismiss`. Fermer le panneau au lieu
    /// de la sheet laisserait la modale orpheline à l'écran.
    func test_resolve_whenPresentedModallyInsidePanel_stillUsesDismiss() {
        XCTAssertEqual(
            PanelBackResolver.resolve(isPresented: true, hasPanelDismiss: true),
            .dismiss
        )
    }

    func test_resolve_whenInPanelAndNotPresented_closesPanel() {
        XCTAssertEqual(
            PanelBackResolver.resolve(isPresented: false, hasPanelDismiss: true),
            .panel
        )
    }

    /// iPhone : poussé dans le NavigationStack, aucune closure de panneau —
    /// `dismiss()` pop correctement, comportement historique préservé.
    func test_resolve_whenPushedOnNavigationStack_usesDismiss() {
        XCTAssertEqual(
            PanelBackResolver.resolve(isPresented: false, hasPanelDismiss: false),
            .dismiss
        )
    }
}
