import XCTest
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le plus petit côté d'un objet à l'échelle 1, en pixels de la scène de
/// référence** (#14299) — la grandeur dont le plancher de 5 px est le
/// quotient. Chaque famille la lit dans le MÊME calcul que son rendu.
@MainActor
final class SceneObjectUnitSideTests: XCTestCase {

    private let reference = CanvasGeometry(renderSize: CGSize(width: CanvasGeometry.designWidth,
                                                              height: CanvasGeometry.designHeight))

    func test_unGlyphe_mesureSonBaseSize() {
        let sticker = StorySticker(emoji: "🔥", scale: 3, baseSize: 140)
        XCTAssertEqual(SceneObjectUnitSide.designSide(of: .sticker(sticker)), 140, accuracy: 1e-9)
    }

    /// Le côté se mesure à l'échelle 1, quelle que soit l'échelle courante :
    /// sinon le plancher se déplacerait pendant le geste.
    func test_leCote_neDependPasDeLEchelleCourante() {
        let petit = StorySticker(emoji: "🔥", scale: 0.05, baseSize: 200)
        let grand = StorySticker(emoji: "🔥", scale: 40, baseSize: 200)
        XCTAssertEqual(SceneObjectUnitSide.designSide(of: .sticker(petit)),
                       SceneObjectUnitSide.designSide(of: .sticker(grand)), accuracy: 1e-9)
    }

    /// Un gabarit n'est pas carré : son plus petit côté est sa HAUTEUR mesurée,
    /// jamais `baseSize`.
    func test_unGabarit_mesureLePlusPetitCoteDeSaBoite() throws {
        let ruban = StorySticker(emoji: "\u{1F550}",
                                 templateId: StickerTemplateCatalog.ID.timeRibbon,
                                 slots: [StickerSlotFiller.timeSlot: "21:33"],
                                 scale: 2)
        let boite = try XCTUnwrap(StickerTemplateRenderer.measuredSize(
            templateID: ruban.templateId, slots: ruban.slots,
            metrics: .sticker(geometry: reference, baseSize: ruban.baseSize, scale: 1)))
        XCTAssertEqual(SceneObjectUnitSide.designSide(of: .sticker(ruban)),
                       Double(min(boite.width, boite.height)), accuracy: 1e-6)
        XCTAssertNotEqual(SceneObjectUnitSide.designSide(of: .sticker(ruban)), ruban.baseSize, accuracy: 1)
    }

    func test_unMedia_mesureLePlusPetitCoteDeSonCadreDeBase() {
        var media = StoryMediaObject(id: "m", kind: .image, aspectRatio: 0.75)
        media.scale = 2.5
        let cadre = StoryMediaLayer.baseMediaDesignSize(for: media)
        XCTAssertEqual(SceneObjectUnitSide.designSide(of: .media(media)),
                       Double(min(cadre.width, cadre.height)), accuracy: 1e-9)
    }

    /// Le texte s'arrête quand une ligne de sa police vaut 5 px — la
    /// définition Android de #14298, reprise telle quelle.
    func test_unTexte_mesureSaTailleDePolice() {
        var texte = StoryTextObject(id: "t", text: "salut")
        texte.fontSize = 72
        texte.scale = 3
        XCTAssertEqual(SceneObjectUnitSide.designSide(of: .text(texte)), 72, accuracy: 1e-9)
    }

    func test_unLieu_mesureLePlusPetitCoteDeSonBadge() {
        let lieu = StoryLocationObject(id: "l", place: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Gare"),
                                       scale: 4)
        var unitaire = lieu
        unitaire.scale = 1
        let badge = StoryLocationLayer.templateSize(for: unitaire, geometry: reference)
        XCTAssertGreaterThan(badge.height, 0)
        XCTAssertEqual(SceneObjectUnitSide.designSide(of: .place(lieu)),
                       Double(min(badge.width, badge.height)), accuracy: 1e-6)
    }

    func test_unSon_mesureLePlusPetitCoteDeSaCapsule() {
        var son = StoryAudioPlayerObject(id: "a")
        son.scale = 6
        var unitaire = son
        unitaire.scale = 1
        let capsule = StoryAudioChipPainter.placement(for: unitaire, renderSize: reference.renderSize,
                                                      elapsed: 0).size
        XCTAssertGreaterThan(capsule.height, 0)
        XCTAssertEqual(SceneObjectUnitSide.designSide(of: .audio(son)),
                       Double(min(capsule.width, capsule.height)), accuracy: 1e-6)
    }

    /// Bout en bout : au plancher, le côté RENDU d'un sticker vaut 5 px dans la
    /// scène de référence, et l'échelle sous-jacente le reproduit sur tout
    /// écran (le rapport largeur/1080).
    func test_auPlancher_leStickerRenduVautCinqPixels() {
        let sticker = StorySticker(emoji: "🔥", baseSize: 140)
        let echelle = SceneObjectScalePolicy.settled(
            base: 1, gestureScale: 1e-6, unitSide: SceneObjectUnitSide.designSide(of: .sticker(sticker)))
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: 140, scale: echelle,
                                                      canvasWidth: CanvasGeometry.designWidth),
                       5, accuracy: 1e-9)
        XCTAssertEqual(CanvasGeometry.stickerFontSize(baseSize: 140, scale: echelle, canvasWidth: 540),
                       2.5, accuracy: 1e-9)
    }
}
