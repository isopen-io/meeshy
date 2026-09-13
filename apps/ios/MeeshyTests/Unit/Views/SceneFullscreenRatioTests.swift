import XCTest
import CoreGraphics
@testable import Meeshy
@testable import MeeshySDK

/// **LE PLEIN ÉCRAN D'UNE SCÈNE CADRE AU RATIO RÉEL, JAMAIS EN 9:16 D'OFFICE.**
///
/// ## Le défaut, signalé par le porteur le 2026-09-13
///
/// « Lorsqu'on touche un média pour le mettre en plein écran, ça zoome trop au
/// point où on ne voit plus tout le contenu. »
///
/// `SocialSceneFullscreenView.scenePlayer(_:)` posait
/// `.aspectRatio(9.0 / 16.0, contentMode: .fit)` — un littéral. Une scène
/// composée en PAYSAGE y était donc ajustée dans une boîte portrait : le
/// contenu, dessiné pour du 16:9, débordait du cadre et ses bords sortaient de
/// l'écran.
///
/// ## Ce n'est pas une règle manquante — c'est une règle CONTREDITE
///
/// Le lecteur de story porte déjà la loi, et son doc-comment l'écrit :
/// « Une story v3-native se peint elle aussi dans son cadre RÉEL, pas
/// systématiquement en 9:16 […] un fond paysage composé nativement en v3 garde
/// donc son 16:9 ; seule une scène qui n'a jamais porté de `carrierAspect`
/// retombe sur le défaut portrait — et c'est alors le bon rendu. »
/// (`StoryViewerView+Canvas.swift`, `readerCanvasRatio`.)
///
/// Deux surfaces rendent le même document ; une seule suivait la loi. Le
/// littéral est resté invisible parce qu'il rend le BON cadre pour la scène la
/// plus fréquente — le portrait. Un défaut qui n'apparaît que sur la minorité
/// des cas ne se voit pas en relecture ; il se voit à l'usage, et c'est ainsi
/// qu'il a été trouvé.
final class SceneFullscreenRatioTests: XCTestCase {

    private func scene(carrierAspect: Double?) -> SceneV3 {
        SceneV3(id: "s1", objects: [], opening: nil, closing: nil,
                clipTransitions: nil, timelineDuration: nil,
                thumbHash: nil, carrierAspect: carrierAspect)
    }

    /// LE CAS QUI ÉTAIT CASSÉ : une scène paysage garde son 16:9.
    func test_aLandscapeScene_keepsItsOwnRatio() {
        let r = SceneFullscreenFraming.ratio(of: scene(carrierAspect: 16.0 / 9.0))
        XCTAssertEqual(r, CGFloat(16.0 / 9.0), accuracy: 0.0001,
                       "une scène paysage est cadrée en portrait : ses bords sortent de l'écran")
    }

    /// LE CAS NOMINAL, et la raison pour laquelle le défaut est resté invisible :
    /// une scène sans porteur logé EST portrait, et le littéral y rendait juste.
    func test_aSceneWithoutCarrier_fallsBackToPortrait() {
        XCTAssertEqual(SceneFullscreenFraming.ratio(of: scene(carrierAspect: nil)),
                       CanvasGeometry.portraitRatio, accuracy: 0.0001)
    }

    /// Un carré est un ratio comme un autre — il ne se rabat pas sur le défaut.
    func test_aSquareScene_isNotForcedToPortrait() {
        let r = SceneFullscreenFraming.ratio(of: scene(carrierAspect: 1.0))
        XCTAssertEqual(r, 1.0, accuracy: 0.0001)
        XCTAssertNotEqual(r, CanvasGeometry.portraitRatio, accuracy: 0.0001)
    }

    /// UNE VALEUR ABERRANTE NE DÉFORME RIEN. Zéro ou négatif rendrait une
    /// division par zéro dans `aspectRatio` ; le repli portrait est la seule
    /// réponse qui peint quelque chose.
    func test_anImpossibleRatio_fallsBackRatherThanDividingByZero() {
        for aberrante in [0.0, -1.0, Double.nan] {
            XCTAssertEqual(SceneFullscreenFraming.ratio(of: scene(carrierAspect: aberrante)),
                           CanvasGeometry.portraitRatio, accuracy: 0.0001,
                           "ratio \(aberrante) devrait retomber sur le portrait")
        }
    }

    /// LE TÉMOIN DE SOURCE, et il garde ce que le témoin de loi ne peut pas
    /// atteindre : que la VUE consomme bien la loi. Sans lui, `ratio(of:)`
    /// pourrait être juste et le littéral rester dans la vue — exactement
    /// l'état d'avant ce lot.
    func test_theFullscreenView_noLongerHardcodesPortrait() throws {
        var url = URL(fileURLWithPath: #filePath)
        for _ in 0..<4 { url.deleteLastPathComponent() }
        let source = try String(
            contentsOf: url.appendingPathComponent("Meeshy/Features/Main/Views/SocialSceneFullscreenView.swift"),
            encoding: .utf8)
        XCTAssertFalse(source.contains("aspectRatio(9.0 / 16.0"),
                       "le ratio est de nouveau codé en dur — une scène paysage débordera")
        XCTAssertTrue(source.contains("SceneFullscreenFraming.ratio"),
                      "la vue n'appelle plus la loi de cadrage")
    }
}
