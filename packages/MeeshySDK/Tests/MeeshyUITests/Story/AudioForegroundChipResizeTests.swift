import XCTest
@testable import MeeshyUI

/// **La puce sonore se REDIMENSIONNE** (#4722, directive porteur 2026-09-01 :
/// « en chip resizable sur la scène »).
///
/// Le geste et la taille rendue vivent dans un corps de vue, donc hors de
/// portée d'une assertion de valeur : ces témoins lisent la SOURCE. Ils
/// épinglent les trois décisions qui se perdraient en silence — l'ordre des
/// modificateurs, la simultanéité des deux gestes, et le fait que la borne
/// passe par la règle partagée plutôt que par un littéral rejoué.
final class AudioForegroundChipResizeTests: XCTestCase {

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Story/
            .deletingLastPathComponent()   // MeeshyUITests/
            .deletingLastPathComponent()   // Tests/
            .deletingLastPathComponent()   // MeeshySDK/
            .appendingPathComponent(chemin)
        return try String(contentsOf: url, encoding: .utf8)
    }

    private var chip: String {
        get throws {
            try source("Sources/MeeshyUI/Story/Controls/AudioForegroundChip.swift")
        }
    }

    /// La taille du modèle est bien RENDUE. Sans ce modificateur, `scale`
    /// s'écrirait dans la slide, voyagerait jusqu'à la publication, et la puce
    /// resterait de la même taille à l'écran — un réglage qui ne se voit pas
    /// est indiscernable d'un réglage qui ne marche pas.
    func test_laTailleDuModele_estRENDUE() throws {
        XCTAssertTrue(try chip.contains(".scaleEffect(renderedScale)"))
    }

    /// **L'ORDRE des modificateurs porte une décision.** `.scaleEffect` doit
    /// précéder `.position` : le second place le CENTRE, que l'échelle ne
    /// déplace pas. Appliqué après, il mettrait la coordonnée elle-même à
    /// l'échelle, et une puce posée à droite de la scène partirait hors cadre
    /// en grandissant.
    func test_lEchelle_sAppliqueAVANTLaPosition() throws {
        let code = try chip
        guard let echelle = code.range(of: ".scaleEffect(renderedScale)"),
              let position = code.range(of: ".position(") else {
            return XCTFail("les deux modificateurs doivent être présents")
        }
        XCTAssertLessThan(echelle.lowerBound, position.lowerBound,
                          "sinon la position est mise à l'échelle avec le contenu")
    }

    /// **Les deux gestes SIMULTANÉMENT.** Chaînés par deux `.gesture()`
    /// successifs, SwiftUI n'en reconnaît qu'un — et c'est le drag qui gagne,
    /// puisqu'un pinch commence toujours par un déplacement. La puce se
    /// déplacerait au lieu de grandir, ce qui a l'air d'un geste mal fait
    /// plutôt que d'une capacité absente.
    func test_lePinchEtLeDrag_sontSIMULTANES() throws {
        XCTAssertTrue(try chip.contains("dragGesture.simultaneously(with: pinchGesture)"))
    }

    /// **La borne passe par la règle PARTAGÉE.** Le pinch UIKit du canvas borne
    /// la même grandeur ; deux littéraux identiques se ressemblent le jour où
    /// on les écrit et divergent au premier ajustement de l'un — sans qu'aucun
    /// témoin ne puisse l'attraper, chacun restant juste vis-à-vis de lui-même.
    func test_laBorne_passeParLaRegleEtNonParUnLitteral() throws {
        let code = try chip
        XCTAssertTrue(code.contains("SceneObjectScalePolicy.settled("))
        XCTAssertFalse(code.contains("min(4.0"),
                       "la borne haute ne se réécrit pas ici")
    }

    /// **Le modèle n'est écrit qu'au RELÂCHEMENT**, comme pour le déplacement :
    /// la slide est un `@Binding` que la scène entière observe, et la republier
    /// à chaque tick ferait re-rendre le canvas pendant le geste — l'image
    /// perdue que la dimension 4 interdit. `@GestureState` est ce qui garantit
    /// que le facteur en cours reste éphémère.
    func test_leFacteurEnCours_resteEPHEMERE() throws {
        XCTAssertTrue(try chip.contains("@GestureState private var pinchScale"))
    }

    /// **VoiceOver ne pince pas.** Sans les deux actions nommées, redimensionner
    /// serait réservé à qui voit l'écran et pose deux doigts dessus — la
    /// dimension 5 dans le cas où son absence ne se voit jamais.
    func test_leRedimensionnement_estAtteignableSansPincer() throws {
        let code = try chip
        XCTAssertTrue(code.contains("accessibilityAction(named: Text(Self.enlargeActionLabel))"))
        XCTAssertTrue(code.contains("accessibilityAction(named: Text(Self.shrinkActionLabel))"))
    }

    /// **Et elles ne sont posées QU'EN composer.** Le lecteur n'a pas de geste
    /// de taille : une action nommée qui n'agirait pas y serait un contrôle
    /// inerte annoncé à VoiceOver — la loi 4 dans la forme où elle coûte le
    /// plus, puisque seule une personne qui n'entend pas la promesse échouer la
    /// découvrirait.
    func test_lesActions_neSontPasAnnonceesAuLecteur() throws {
        let code = try chip
        guard let composer = code.range(of: "case .composer:"),
              let lecteur = code.range(of: "case .reader:", range: composer.upperBound..<code.endIndex),
              let action = code.range(of: "accessibilityAction(named:") else {
            return XCTFail("les deux branches de mode et l'action doivent exister")
        }
        XCTAssertLessThan(action.lowerBound, lecteur.lowerBound,
                          "l'action vit dans la branche composer, avant que la branche lecteur ouvre")
    }
}
