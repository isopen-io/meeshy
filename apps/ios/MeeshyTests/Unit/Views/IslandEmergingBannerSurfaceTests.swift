import XCTest
@testable import Meeshy

/// **Une seule capsule, et c'est celle de l'île** (#5974).
///
/// La bannière empilait DEUX fonds :
///
/// ```swift
/// .background(Capsule().fill(Color.black.opacity(Double(1 - p))))  // le noir, qui s'efface
/// .background(Capsule().fill(tint))                                 // l'indigo, dessous
/// ```
///
/// Le noir naissait opaque — la capsule de la Dynamic Island — puis s'effaçait
/// pendant l'émergence pour découvrir la teinte de marque. À l'œil, deux
/// composants superposés : le sombre devant, l'indigo qui dépasse derrière.
///
/// Directive porteur (2026-09-10, capture à l'appui) : « cette pill de
/// signalisation doit être plus simple, le noir doit venir seul et plus besoin
/// de celui derrière ; celui qu'il faut préserver c'est celui qui vient de la
/// Dynamic Island ».
///
/// Ce que ça retire n'est pas une couleur mais un MORPH : la capsule ne change
/// plus d'identité en chemin. Elle sort de l'île et reste l'île — ce qui est
/// aussi la seule lecture honnête du geste, une annonce qui vient de là-haut.
///
/// Garde de SOURCE, assumée : la composition SwiftUI n'est pas inspectable dans
/// ce dépôt (pas de ViewInspector), et c'est la SUPERPOSITION qu'on garde —
/// un fait sur le texte, pas sur un pixel.
final class IslandEmergingBannerSurfaceTests: XCTestCase {

    private func source() throws -> String {
        try AppSourceGuard.unit("Meeshy/Features/Main/Components/IslandEmergingBanner.swift")
    }

    /// Le fond ne s'empile plus. Deux `.background(Capsule()` à la suite EST la
    /// superposition que le porteur voit.
    func test_uneSeuleCapsuleDeFond() throws {
        let commandes = AppSourceGuard.stripComments(try source())
        let fonds = commandes.components(separatedBy: ".background(Capsule()").count - 1
        XCTAssertEqual(
            fonds, 1,
            "Deux fonds de capsule empilés = les deux composants superposés que le porteur voit à l'écran."
        )
    }

    /// Et celle qui reste est la NOIRE — celle de l'île. Garder la teinte
    /// aurait retiré la superposition en gardant le mauvais des deux.
    func test_laCapsuleQuiResteEstCelleDeLIle() throws {
        let commandes = AppSourceGuard.stripComments(try source())
        XCTAssertTrue(commandes.contains("Capsule().fill(Color.black)"),
                      "La capsule qui survit est celle de la Dynamic Island, pleine et sans fondu.")
        XCTAssertFalse(commandes.contains("Capsule().fill(tint)"),
                       "La teinte de marque était le fond DERRIÈRE : c'est lui qui devait partir.")
    }

    /// **Un paramètre qui ne peint plus rien est un mensonge.** `tint` était
    /// documenté « couleur finale de la capsule » ; il n'y a plus de couleur
    /// finale autre que le noir. Le laisser en place ferait croire à un réglage
    /// à un futur appelant.
    func test_laTeinteNestPlusUnParametre() throws {
        let commandes = AppSourceGuard.stripComments(try source())
        XCTAssertFalse(commandes.contains("let tint: Color"),
                       "Un paramètre sans effet invite à le régler, et rien ne rougirait.")
    }
}
