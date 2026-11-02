import XCTest
@testable import Meeshy

/// **#3903 — le chip « Position » chevauchait l'icône caméra dans `toolRow`.**
///
/// Cause : `documentLocationTile` était posé en `.overlay(alignment:
/// .bottomLeading)` sur TOUTE `ComposerDocumentSurface`, exactement où
/// `toolRow` peint sa première icône (elle aussi calée au bord de tête, sans
/// retrait). Un overlay et le premier enfant d'un `HStack` occupent le MÊME
/// point de l'écran — rien n'empêchait la superposition, à aucune taille
/// d'écran ni palier de Dynamic Type.
///
/// Le correctif fait entrer le chip DANS la disposition de `toolRow` (un slot
/// de tête rendu par le même `HStack` que les icônes) plutôt que de le
/// stacker par-dessus : deux enfants d'un `HStack` ne se superposent jamais,
/// par construction, quelle que soit la taille — c'est la rangée elle-même
/// qui garantit l'absence de chevauchement, pas une mesure de frame au cas
/// par cas. La rangée et sa surface sont parties au #13864 (un post se compose
/// sur la scène) ; la garde garde ce qui reste vrai : le lieu a UN site.
final class ComposerToolRowLeadingAccessoryGuardTests: XCTestCase {

    private func hostSource() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
    }

    /// **Le lieu a un site, et un seul (#4034).** La rangée d'outils du
    /// document est partie avec sa surface (#13864) ; reste la moitié positive :
    /// le lieu est peint, et une seule fois.
    func test_host_paintsTheLocationExactlyOnce_inTheLocationCard() throws {
        let source = try hostSource()
        XCTAssertFalse(source.isEmpty, "Source du meuble vide — la garde serait verte par omission.")

        XCTAssertEqual(
            source.components(separatedBy: "NearbyDiscoverabilityControl(").count - 1, 1,
            "Le composant Position doit être monté par EXACTEMENT un site : deux montages donneraient deux "
                + "entêtes pour un seul lieu."
        )
        XCTAssertTrue(
            source.contains("placeName: MediaKindLabel.placeTitle(name: place.name, address: place.address)"),
            "L'entête doit porter le TITRE du lieu — nom, à défaut ADRESSE. `placeLabel` s'arrête au nom et "
                + "retombe sur le mot « Position » à côté d'une adresse connue : c'est le défaut de #4034 une "
                + "couche plus bas, mesuré au simulateur le 2026-08-28."
        )
    }
}
