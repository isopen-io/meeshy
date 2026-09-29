import XCTest
import CoreGraphics
@testable import MeeshyUI
import MeeshySDK

/// #8680 — **le texte qu'on écrit a, sur la scène réduite, la taille qu'il aura
/// publié.** Directive porteur 2026-09-29 : « le texte qui apparaît pour écrire
/// doit être proportionnel en taille par rapport à cette scène ».
///
/// Deux lois, et c'est leur composition qui tient la promesse :
/// 1. le champ de saisie et le calque peignent la MÊME taille de police sur le
///    canvas monté (`StoryTextLayer.renderedFontSize`) ;
/// 2. la carte applique à ce canvas une échelle UNIFORME
///    (`SceneCardProjection`) — une longueur design rapportée à la largeur de
///    la carte ne dépend pas de la taille de la carte.
@MainActor
final class SceneCardProjectionTests: XCTestCase {

    private let referenceViewport = CGSize(width: 392, height: 696)

    private func texte(fontSize: Double = 96, scale: Double = 1) -> StoryTextObject {
        StoryTextObject(text: "", x: 0.5, y: 0.5, scale: scale, rotation: 0,
                        fontSize: fontSize, textStyle: "classic",
                        textColor: "FFFFFF", textAlign: "center")
    }

    private func carte(_ conteneur: CGSize) -> SceneCardProjection {
        SceneCardProjection(container: conteneur,
                            ratio: CanvasGeometry.portraitRatio,
                            referenceViewport: referenceViewport)
    }

    /// **LE témoin de la directive** : la scène pleine (clavier baissé) et la
    /// scène réduite (clavier levé, outil ouvert) donnent au texte la MÊME part
    /// de la largeur — celle du référentiel publié, 96 / 1080.
    func test_uneSceneReduite_gardeLaProportionDuTexte() {
        let pleine = carte(CGSize(width: 370, height: 740))
        let reduite = carte(CGSize(width: 370, height: 440))
        XCTAssertLessThan(reduite.fit.width, pleine.fit.width * 0.7,
                          "Le témoin doit comparer deux cartes VRAIMENT différentes.")

        let publie = CGFloat(96) / CanvasGeometry.designWidth
        for projection in [pleine, reduite] {
            let part = projection.onScreen(designLength: 96) / projection.fit.width
            XCTAssertEqual(part, publie, accuracy: 0.0001,
                           "Le texte en saisie n'occupe pas la part de la scène qu'il aura publié.")
        }
    }

    /// Le texte PINCÉ (échelle d'objet ≠ 1) suit la même loi.
    func test_unTextePince_resteProportionnel() {
        let reduite = carte(CGSize(width: 300, height: 380))
        let t = texte(fontSize: 64, scale: 1.75)
        let part = StoryTextLayer.renderedFontSize(of: t, in: reduite.mountedGeometry)
            * reduite.scale / reduite.fit.width
        XCTAssertEqual(part, CGFloat(64 * 1.75) / CanvasGeometry.designWidth, accuracy: 0.0001)
    }

    /// **Le champ de saisie peint la taille du calque**, jamais une taille à
    /// lui : sans cette égalité, le texte « sauterait » à la sortie de saisie.
    func test_leChampDeSaisie_peintLaTailleDuCalque() {
        let projection = carte(CGSize(width: 370, height: 440))
        let geometry = projection.mountedGeometry
        let t = texte(fontSize: 96, scale: 1.2)

        let champ = StoryInlineTextEditor()
        champ.apply(textObject: t, geometry: geometry, setText: true)

        let calque = StoryTextLayer()
        calque.configure(with: t, geometry: geometry, mode: .edit)

        let attendu = StoryTextLayer.renderedFontSize(of: t, in: geometry)
        XCTAssertEqual(champ.font?.pointSize ?? 0, attendu, accuracy: 0.01)
        XCTAssertEqual(calque.fontSize, attendu, accuracy: 0.01)
    }

    /// L'échelle est celle de la carte : 1 quand la carte a la taille de
    /// référence, jamais une valeur par axe.
    func test_laCarteDeReference_neReduitRien() {
        let projection = carte(referenceViewport)
        XCTAssertEqual(projection.scale, 1, accuracy: 0.0001)
    }
}
