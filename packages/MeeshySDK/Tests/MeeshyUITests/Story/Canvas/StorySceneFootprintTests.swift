import XCTest
import CoreMedia
import UIKit
@testable import MeeshyUI
@testable import MeeshySDK

/// **Le mesureur de la loi `StoryImageOnlyPresentation` mesure ce que le rendu
/// POSE** (#6636).
///
/// La loi est éprouvée hors du rendu (`StoryImageOnlyPresentationTests`) ; ce
/// témoin pose la question qui la rend vraie à l'écran : l'empreinte d'un objet
/// est-elle le `frame` du calque que `StoryRenderer.render` pose pour lui ? Une
/// empreinte calculée à côté du rendu — une géométrie jumelle — resterait verte
/// sur la loi et fausse sur le pixel.
@MainActor
final class StorySceneFootprintTests: XCTestCase {

    private let canvas = CGSize(width: 405, height: 720)

    private func fondAjuste(ratio: Double? = 16.0 / 9.0) -> StoryMediaObject {
        var fond = StoryMediaObject(id: "fond", postMediaId: "pm-fond", kind: .image,
                                    aspectRatio: nil, isBackground: true)
        fond.measuredAspectRatio = ratio
        return fond
    }

    private func slide(textes: [StoryTextObject] = [],
                       medias: [StoryMediaObject] = [],
                       stickers: [StorySticker] = [],
                       lieux: [StoryLocationObject] = [],
                       audios: [StoryAudioPlayerObject] = [],
                       traits: [StoryDrawingStroke]? = nil,
                       fond: StoryMediaObject? = nil) -> StorySlide {
        var effets = StoryEffects()
        effets.textObjects = textes
        effets.mediaObjects = (fond.map { [$0] } ?? []) + medias
        effets.stickerObjects = stickers
        effets.locationObjects = lieux
        effets.audioPlayerObjects = audios
        effets.drawingStrokes = traits
        effets.backgroundTransform = StoryBackgroundTransform(videoFitMode: StoryBackgroundFraming.fit)
        return StorySlide(id: "s", effects: effets)
    }

    // MARK: - Le cadre du rendu

    /// **Chaque famille, confrontée au calque RÉEL.** Texte tourné et ancré
    /// ailleurs qu'au centre, média recadré à l'échelle, sticker emoji, sticker
    /// gabarit, pastille de lieu : l'empreinte de chacun doit tomber sur le
    /// `frame` que `StoryRenderer.render` lui donne.
    func test_chaqueEmpreinte_estLeCadreDuCalqueQueLeRenduPose() throws {
        let place = SharedPlace(latitude: 48.8566, longitude: 2.3522, name: "Tour Eiffel")
        let scene = slide(
            textes: [StoryTextObject(id: "texte", text: "Une phrase qui revient à la ligne",
                                     x: 0.4, y: 0.45, scale: 1.2, rotation: 15,
                                     anchor: CGPoint(x: 0.2, y: 0.8))],
            medias: [StoryMediaObject(id: "collage", kind: .image, aspectRatio: 4.0 / 3.0,
                                      x: 0.6, y: 0.55, scale: 0.8, rotation: -10)],
            stickers: [StorySticker(id: "emoji", emoji: "🔥", x: 0.3, y: 0.6, scale: 1.4, rotation: 30),
                       StorySticker(id: "gabarit", emoji: "📍",
                                    templateId: StickerTemplateCatalog.defaultLocationTemplateID,
                                    slots: ["name": "Paris"], x: 0.5, y: 0.4)],
            lieux: [StoryLocationObject(id: "lieu", place: place, x: 0.5, y: 0.5, rotation: 8)])
        let geometry = CanvasGeometry(renderSize: canvas)
        let racine = StoryRenderer.render(slide: scene, into: geometry, at: .zero, mode: .play,
                                          languages: [])

        for objet in scene.sceneObjects {
            let calque = try XCTUnwrap((racine.sublayers ?? []).first { $0.name == objet.id },
                                       "le rendu doit poser un calque pour \(objet.id)")
            let empreinte = try XCTUnwrap(StorySceneFootprint.footprint(of: objet, canvasSize: canvas,
                                                                        languages: []),
                                          "\(objet.id) doit se mesurer")
            XCTAssertEqual(empreinte.frame.minX, calque.frame.minX, accuracy: 0.5, objet.id)
            XCTAssertEqual(empreinte.frame.minY, calque.frame.minY, accuracy: 0.5, objet.id)
            XCTAssertEqual(empreinte.frame.width, calque.frame.width, accuracy: 0.5, objet.id)
            XCTAssertEqual(empreinte.frame.height, calque.frame.height, accuracy: 0.5, objet.id)
        }
    }

    /// **Le Prisme change la place d'un texte.** La traduction servie n'a pas
    /// la longueur de l'original : l'empreinte doit mesurer ce que le lecteur
    /// lit, pas ce que l'auteur a tapé.
    func test_lEmpreinteDUnTexte_mesureLaTraductionServie() throws {
        let texte = StoryTextObject(id: "t", text: "Hi",
                                    translations: ["fr": "Bonjour à toutes et à tous"],
                                    sourceLanguage: "en")
        let original = try XCTUnwrap(StorySceneFootprint.footprint(of: .text(texte), canvasSize: canvas,
                                                                   languages: ["en"]))
        let traduit = try XCTUnwrap(StorySceneFootprint.footprint(of: .text(texte), canvasSize: canvas,
                                                                  languages: ["fr"]))
        XCTAssertGreaterThan(traduit.size.width, original.size.width + 10)
    }

    // MARK: - Le verdict d'une slide

    /// **La story de la capture** : une photo paysage ajustée et un texte posé
    /// DANS la photo — l'image seule. Le même texte sur la bande basse : la
    /// carte.
    func test_leVerdictDUneSlide_suitLaPlaceDuTexte() {
        let dansLImage = StoryTextObject(id: "t", text: "Paris", y: 0.5)
        let surLaBande = StoryTextObject(id: "t", text: "Paris", y: 0.92)
        let rect = CGRect(x: 0, y: (720 - 405 * 9.0 / 16.0) / 2, width: 405, height: 405 * 9.0 / 16.0)

        guard case .imageOnly(let rendu) = StorySceneFootprint.verdict(
            for: slide(textes: [dansLImage], fond: fondAjuste()), canvasSize: canvas, languages: [])
        else { return XCTFail("un texte dans l'image garde l'image seule") }
        XCTAssertEqual(rendu.minY, rect.minY, accuracy: 0.001)
        XCTAssertEqual(rendu.height, rect.height, accuracy: 0.001)

        XCTAssertEqual(StorySceneFootprint.verdict(for: slide(textes: [surLaBande], fond: fondAjuste()),
                                                   canvasSize: canvas, languages: []),
                       .canvas)
    }

    /// Un fond dont le ratio n'a jamais été MESURÉ ne fabrique pas de
    /// rectangle : `1.0` y serait la sentinelle, pas une propriété (#5100).
    func test_unFondSansRatioMesure_gardeLaCarte() {
        XCTAssertEqual(StorySceneFootprint.verdict(for: slide(fond: fondAjuste(ratio: nil)),
                                                   canvasSize: canvas, languages: []),
                       .canvas)
    }

    /// Une puce de son se place dans le repère du LECTEUR, pas du canvas : elle
    /// ne se mesure pas ici, et la carte reste.
    func test_unePuceDeSonAffichee_gardeLaCarte() {
        XCTAssertNil(StorySceneFootprint.footprint(of: .audio(StoryAudioPlayerObject(id: "son")),
                                                   canvasSize: canvas, languages: []))
        XCTAssertEqual(StorySceneFootprint.verdict(for: slide(audios: [StoryAudioPlayerObject(id: "son")],
                                                              fond: fondAjuste()),
                                                   canvasSize: canvas, languages: []),
                       .canvas)
    }

    /// Un trait tracé sur la bande garde la carte ; les traits vivent dans
    /// l'espace design du rasteriseur (`CanvasGeometry.designSize`).
    func test_unTraitSurLaBande_gardeLaCarte() {
        let trait = StoryDrawingStroke(points: [StoryDrawingStrokePoint(x: 540, y: 100),
                                                StoryDrawingStrokePoint(x: 600, y: 140)],
                                       colorHex: "FFFFFF", width: 12)
        XCTAssertEqual(StorySceneFootprint.verdict(for: slide(traits: [trait], fond: fondAjuste()),
                                                   canvasSize: canvas, languages: []),
                       .canvas)
    }
}
