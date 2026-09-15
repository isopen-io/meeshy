import XCTest
import CoreGraphics
@testable import MeeshySDK
@testable import MeeshyUI

/// **Une scène qui n'est qu'une image se présente au rapport de son image**
/// (#6697, recette staging du 2026-09-15).
///
/// ## Ce que la recette a mesuré
///
/// Le post « PAYSAGE 16:9 » est une scène dont le seul objet est un fond
/// `isBackground` au `aspectRatio` 1,7778, sans cadrage déclaré — donc rempli
/// (`StoryBackgroundFraming.rendersFilled(nil)`). Trois surfaces le lisaient :
///
/// | surface | cadre du player | image dessinée | part visible |
/// |---|---|---|---|
/// | Réels | 402 × 226 | 402 × 226 (ajustée) | entière |
/// | carte du fil | 338 × 601 derrière une fenêtre 338 × 190 | 1 068 × 601 | 31,6 % × 31,6 % |
/// | détail | 370 × 657 | 1 168 × 657 | 31,7 % × 100 % |
///
/// La carte et le détail dessinaient l'image à la MÊME échelle — celle d'un
/// 16:9 rempli dans un 9:16, 3,16 fois sa largeur ajustée — et donc la
/// rognaient pareil. Ce n'est pas une échelle recopiée qui divergeait : c'est
/// le CADRE donné au player, 9:16 partout, qui ne disait pas la forme de ce que
/// la scène montre.
final class ScenePresentationTests: XCTestCase {

    // MARK: - Fabriques

    private let paysage: CGFloat = 16.0 / 9.0

    /// Un fond tel que la production l'écrit (`plane: content`,
    /// `isBackground: true`, `aspectRatio` au payload) — la forme exacte du
    /// post de la recette.
    private func fond(aspect: Double = 16.0 / 9.0,
                      x: Double = 0.5, y: Double = 0.5,
                      scale: Double = 1, rotation: Double = 0,
                      timing: TimingV3? = nil,
                      extra: [String: CanvasJSONValue] = [:]) -> ObjectV3 {
        ObjectV3(id: "fond", kind: .media, anchor: .free(x: x, y: y),
                 plane: .content, z: 0,
                 transform: TransformV3(scale: scale, rotation: rotation, opacity: 1),
                 timing: timing,
                 payload: ["isBackground": .bool(true),
                           "aspectRatio": .number(aspect),
                           "postMediaId": .string("m1"),
                           "mediaType": .string("image")].merging(extra) { _, neuf in neuf })
    }

    private func objet(_ kind: ObjectKind, id: String, y: Double = 0.5) -> ObjectV3 {
        ObjectV3(id: id, kind: kind, anchor: .free(x: 0.5, y: y), plane: .content, z: 1,
                 transform: TransformV3())
    }

    /// Le porteur du CADRAGE du fond — un objet `media` de plan `bg` qui ne porte
    /// qu'une couleur et `transform.videoFitMode`, sans aucun pixel.
    private func porteurDeCadrage() -> ObjectV3 {
        ObjectV3(id: "bg", kind: .media, anchor: .free(x: 0.5, y: 0.5), plane: .bg, z: 0,
                 transform: TransformV3(),
                 payload: ["background": .string("#101010"),
                           "transform": .object(["videoFitMode": .string("fit")])])
    }

    private func scene(_ objets: [ObjectV3], carrierAspect: Double? = nil) -> SceneV3 {
        SceneV3(id: "s1", objects: objets, carrierAspect: carrierAspect)
    }

    // MARK: - LE cas de la recette

    func test_uneSceneQuiNestQuUneImagePaysage_sePresenteAuRapportDeSonImage() throws {
        let s = scene([fond()])
        XCTAssertEqual(try XCTUnwrap(SceneFraming.imageAspect(scene: s)), paysage, accuracy: 0.0001)
        XCTAssertEqual(SceneFraming.presentationAspect(scene: s), paysage, accuracy: 0.0001,
                       "présentée en 9:16, l'image remplie sort des deux côtés du cadre")
    }

    // MARK: - La loi d'échelle : une scène 16:9 → cadre 16:9, cadre portrait

    /// La carte du fil de la recette : 338 × 190. La scène la remplit, ni plus
    /// ni moins — l'image n'est donc plus dessinée plus large que la carte.
    func test_laLoiDEchelle_uneScene16x9_remplitLeCadre16x9DeLaCarte() {
        let taille = SceneFraming.presentedSize(scene: scene([fond()]),
                                                in: CGSize(width: 338, height: 190))
        XCTAssertEqual(taille.width, 338, accuracy: 0.5)
        XCTAssertEqual(taille.height, 190, accuracy: 0.5)
    }

    /// Le détail de la recette : 370 × 657. La scène y tient ENTIÈRE, en largeur,
    /// à la même échelle relative que dans la carte.
    func test_laLoiDEchelle_uneScene16x9_tientEntiereDansUnCadrePortrait() {
        let taille = SceneFraming.presentedSize(scene: scene([fond()]),
                                                in: CGSize(width: 370, height: 657))
        XCTAssertEqual(taille.width, 370, accuracy: 0.001)
        XCTAssertEqual(taille.height, 370 / paysage, accuracy: 0.001)
    }

    /// Même échelle relative partout : la largeur présentée rapportée à la
    /// largeur du cadre vaut 1 dans la carte, dans le détail, et dans le lecteur
    /// de Réels qui servait de référence (402 × 226).
    func test_laLoiDEchelle_estLaMemePourLesTroisSurfaces() {
        let s = scene([fond()])
        for cadre in [CGSize(width: 338, height: 190),
                      CGSize(width: 370, height: 657),
                      CGSize(width: 402, height: 226)] {
            let taille = SceneFraming.presentedSize(scene: s, in: cadre)
            XCTAssertEqual(taille.width / cadre.width, 1, accuracy: 0.002, "cadre \(cadre)")
        }
    }

    // MARK: - Une scène 9:16 ne change pas

    func test_uneScene9x16_nePresenteRienDAutreQueSonGabarit() {
        let portraitSeul = scene([fond(aspect: 9.0 / 16.0)])
        let texteSeul = scene([objet(.text, id: "t")])
        for s in [portraitSeul, texteSeul] {
            XCTAssertNil(SceneFraming.imageAspect(scene: s))
            XCTAssertEqual(SceneFraming.presentationAspect(scene: s), SceneFraming.sceneAspect,
                           accuracy: 0.0001)
            let taille = SceneFraming.presentedSize(scene: s, in: CGSize(width: 370, height: 657))
            XCTAssertEqual(taille.width, 369.56, accuracy: 0.5)
            XCTAssertEqual(taille.height, 657, accuracy: 0.5)
        }
    }

    /// Une image plus ÉTROITE que la scène la remplit déjà en hauteur : la
    /// présenter à son rapport allongerait la carte au-delà du gabarit.
    func test_uneImagePlusEtroiteQueLaScene_gardeLeGabarit() {
        XCTAssertNil(SceneFraming.imageAspect(scene: scene([fond(aspect: 0.4)])))
    }

    // MARK: - La carte

    /// La carte ne resserre plus une scène qui n'est qu'une image : la fenêtre
    /// posée sur un canvas 9:16 rempli montrait le milieu de l'image, jamais
    /// l'image. Son rapport, lui, ne bouge pas — c'est déjà celui de l'image.
    func test_laCarte_neCadrePlusUneImageSeule_etGardeSonRapport() throws {
        let s = scene([fond()])
        XCTAssertNil(SceneFraming.cardFocus(scene: s))
        let rapport = try XCTUnwrap(SceneFraming.cardAspect(scene: s))
        XCTAssertEqual(rapport, SceneFraming.presentationAspect(scene: s), accuracy: 0.0001)
        let boite = CGSize(width: 338, height: 338 / rapport)
        let taille = SceneFraming.presentedSize(scene: s, in: boite)
        XCTAssertEqual(taille.width, boite.width, accuracy: 0.001)
        XCTAssertEqual(taille.height, boite.height, accuracy: 0.001)
    }

    /// Un texte posé sur l'image fait de la scène une COMPOSITION : son cadrage
    /// reste celui du fil, au texte près.
    func test_uneImageAccompagneeDUnTexte_resteUneScene() {
        let s = scene([fond(), objet(.text, id: "t", y: 0.1)])
        XCTAssertNil(SceneFraming.imageAspect(scene: s))
        XCTAssertEqual(SceneFraming.cardFocus(scene: s), SceneFraming.focus(scene: s))
        XCTAssertNotNil(SceneFraming.cardFocus(scene: s))
    }

    // MARK: - Ce qui ne compte pas comme contenu

    func test_unSonEtUneMention_nEmpechentPasLaSceneDEtreUneImage() throws {
        let s = scene([fond(), objet(.audio, id: "a"), objet(.mention, id: "m")])
        XCTAssertEqual(try XCTUnwrap(SceneFraming.imageAspect(scene: s)), paysage, accuracy: 0.0001)
    }

    /// La forme que la production écrit depuis #5406 : un porteur de cadrage
    /// `bg` sans pixel, et le fond réel en plan `content`.
    func test_lePorteurDuCadrage_nEstNiUnContenuNiUneImage() throws {
        let s = scene([porteurDeCadrage(), fond()])
        XCTAssertEqual(try XCTUnwrap(SceneFraming.imageAspect(scene: s)), paysage, accuracy: 0.0001)
    }

    func test_unRecadrageEntier_nEstPasUnRecadrage() throws {
        let entier: [String: CanvasJSONValue] = ["cropX": .number(0), "cropY": .number(0),
                                                 "cropW": .number(1), "cropH": .number(1)]
        let s = scene([fond(extra: entier)])
        XCTAssertEqual(try XCTUnwrap(SceneFraming.imageAspect(scene: s)), paysage, accuracy: 0.0001)
    }

    // MARK: - Échouer FERMÉ : un fond que l'auteur a posé reste une scène

    func test_unFondRecadreDeplaceOuAnime_resteUneScene() {
        let recadre: [String: CanvasJSONValue] = ["cropX": .number(0.2), "cropY": .number(0),
                                                  "cropW": .number(0.6), "cropH": .number(1)]
        let cas: [(String, ObjectV3)] = [
            ("zoomé", fond(scale: 1.4)),
            ("tourné", fond(rotation: 12)),
            ("décentré", fond(x: 0.3)),
            ("animé", fond(timing: TimingV3(keyframes: [KeyframeV3(time: 0, scale: 1),
                                                         KeyframeV3(time: 1, scale: 2)]))),
            ("recadré", fond(extra: recadre)),
        ]
        for (quoi, objet) in cas {
            XCTAssertNil(SceneFraming.imageAspect(scene: scene([objet])), quoi)
            XCTAssertEqual(SceneFraming.presentationAspect(scene: scene([objet])),
                           SceneFraming.sceneAspect, accuracy: 0.0001, quoi)
        }
    }

    func test_unFondSansFormeDeclaree_neSePresentePasCommeUneImage() {
        let sansForme = ObjectV3(id: "fond", kind: .media, anchor: .free(x: 0.5, y: 0.5),
                                 plane: .content, z: 0, transform: TransformV3(),
                                 payload: ["isBackground": .bool(true),
                                           "postMediaId": .string("m1")])
        XCTAssertNil(SceneFraming.imageAspect(scene: scene([sansForme])))
    }

    // MARK: - Le cadre du canvas, quand la scène en porte un

    /// Une scène qui a logé son porteur (`carrierAspect`) a déjà sa forme : la
    /// règle de l'image ne la réinterprète pas, et le rapport servi est celui du
    /// canvas que l'appelant tient de la loi du porteur.
    func test_uneSceneQuiPorteSonCadre_gardeLeRapportDeSonCanvas() {
        let s = scene([fond(aspect: 4.0 / 3.0)], carrierAspect: 16.0 / 9.0)
        XCTAssertNil(SceneFraming.imageAspect(scene: s))
        XCTAssertEqual(SceneFraming.presentationAspect(scene: s, canvasAspect: paysage),
                       paysage, accuracy: 0.0001)
    }
}
