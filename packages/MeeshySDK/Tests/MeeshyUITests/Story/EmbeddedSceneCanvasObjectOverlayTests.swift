import XCTest
@testable import MeeshyUI

/// **Deux slots d'overlay, deux rapports au DOIGT** (#4722).
///
/// `canvasOverlay` sert l'outil qui CAPTURE la carte — le dessin — et éteint
/// pour cela le hit-test du canvas. `objectOverlay` sert ce qui est POSÉ
/// dessus : une puce sonore ne veut que sa propre surface, et le texte comme le
/// sticker sous elle doivent rester saisissables.
///
/// > Faire passer la puce par `canvasOverlay` aurait rendu la scène entière
/// > inerte pour tous les autres objets — un défaut qui ne se voit pas en
/// > regardant la puce, seulement en essayant de déplacer un voisin.
///
/// Ces témoins existent parce que les deux slots se RESSEMBLENT : même
/// bornage, même découpe, même endroit dans le corps. Ce qui les distingue
/// tient dans une ligne, et « harmoniser » cette ligne est le geste naturel de
/// qui les lit côte à côte sans savoir pourquoi ils diffèrent.
final class EmbeddedSceneCanvasObjectOverlayTests: XCTestCase {

    private var source: String {
        get throws {
            let url = URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Story/
                .deletingLastPathComponent()   // MeeshyUITests/
                .deletingLastPathComponent()   // Tests/
                .deletingLastPathComponent()   // MeeshySDK/
                .appendingPathComponent("Sources/MeeshyUI/Story/EmbeddedSceneCanvas.swift")
            return try String(contentsOf: url, encoding: .utf8)
        }
    }

    /// **Le hit-test ne dépend QUE du slot qui capture.** C'est l'affirmation
    /// entière de ce lot : si `objectOverlay` entrait dans cette condition,
    /// poser une puce sonore figerait la scène.
    func test_leHitTest_neDependQueDuSlotQuiCapture() throws {
        let code = try source
        XCTAssertTrue(code.contains(".allowsHitTesting(canvasOverlay == nil)"))
        XCTAssertFalse(code.contains("allowsHitTesting(canvasOverlay == nil && objectOverlay == nil)"),
                       "un objet posé sur la carte ne capture pas la carte")
        XCTAssertFalse(code.contains("allowsHitTesting(objectOverlay == nil)"))
    }

    /// **Le slot d'objets reçoit la taille de la CARTE.** Une puce porte des
    /// coordonnées normalisées `0…1` et ne peut pas se placer sans elle ; seul
    /// ce corps connaît `fit`, et la faire recalculer chez l'appelant
    /// redonnerait deux géométries à tenir d'accord — ce que la note de
    /// `canvasOverlay` dit déjà pour son propre compte.
    func test_leSlotDObjets_recoitLaTailleDeLaCarte() throws {
        XCTAssertTrue(try source.contains("objectOverlay(fit)"))
    }

    /// **Il est rendu SOUS le slot qui capture.** Pendant qu'un outil prend la
    /// carte, ce qui est posé dessus ne doit ni le masquer ni lui disputer le
    /// doigt.
    func test_lesObjets_sontRendusSOUSLOutilQuiCapture() throws {
        let code = try source
        guard let objets = code.range(of: "if let objectOverlay {"),
              let outil = code.range(of: "if let canvasOverlay {") else {
            return XCTFail("les deux slots doivent être montés")
        }
        XCTAssertLessThan(objets.lowerBound, outil.lowerBound)
    }
}
