import XCTest
import SwiftUI
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le lecteur de stories consomme la loi de l'image seule** (#6636).
///
/// La loi est éprouvée au SDK (`StoryImageOnlyPresentationTests`) et sa mesure
/// face au rendu (`StorySceneFootprintTests`). Ce témoin porte sur ce que le
/// LECTEUR en fait : un verdict par story et non par image, une forme qui rogne
/// au rectangle de l'image, et les trois couches de la carte qui la partagent.
@MainActor
final class StoryImageOnlyReaderTests: XCTestCase {

    private let canvas = CGSize(width: 405, height: 720)

    /// Une photo paysage 1600 × 900 posée en fond AJUSTÉ — la story de la
    /// capture du porteur. `FeedMedia` porte les dimensions que
    /// `toRenderableSlide` hydrate dans le ratio du fond.
    private func story(id: String = "s", texteY: Double? = nil) -> StoryItem {
        var effets = StoryEffects()
        effets.mediaObjects = [StoryMediaObject(id: "fond", postMediaId: "pm-photo", kind: .image,
                                                aspectRatio: nil, isBackground: true)]
        effets.backgroundTransform = StoryBackgroundTransform(videoFitMode: StoryBackgroundFraming.fit)
        effets.textObjects = texteY.map { [StoryTextObject(id: "t", text: "Paris", y: $0)] } ?? []
        return StoryItem(id: id,
                         media: [FeedMedia(id: "pm-photo", type: .image, width: 1600, height: 900)],
                         storyEffects: effets,
                         createdAt: Date(timeIntervalSince1970: 0))
    }

    // MARK: - Le verdict du lecteur

    func test_uneStoryQuiNestQuUneImage_rendLeRectangleDeLImage() {
        let cache = StoryImageOnlyVerdictCache()
        guard case .imageOnly(let rect) = cache.verdict(for: story(), chain: [], canvasSize: canvas)
        else { return XCTFail("une photo ajustée seule se présente comme l'image") }
        XCTAssertEqual(rect.minX, 0, accuracy: 0.01)
        XCTAssertEqual(rect.width, 405, accuracy: 0.01)
        XCTAssertEqual(rect.height, 405 * 9.0 / 16.0, accuracy: 0.01)
        XCTAssertEqual(rect.midY, 360, accuracy: 0.01)
    }

    /// Le fusible : un texte posé sur la bande basse garde la carte — sans lui,
    /// un lecteur qui rognerait toujours passerait le témoin ci-dessus.
    func test_unTexteSurLaBande_gardeLaCarte() {
        XCTAssertEqual(StoryImageOnlyVerdictCache().verdict(for: story(texteY: 0.95), chain: [],
                                                            canvasSize: canvas),
                       .canvas)
    }

    // MARK: - Une fois par story

    /// Le `body` se réévalue à chaque tick de la barre de progression : un
    /// verdict recalculé à chaque passe configurerait un calque de texte par
    /// image.
    func test_leVerdict_seCalculeUneFoisParStory() {
        let cache = StoryImageOnlyVerdictCache()
        let courante = story()
        _ = cache.verdict(for: courante, chain: ["fr"], canvasSize: canvas)
        _ = cache.verdict(for: courante, chain: ["fr"], canvasSize: canvas)
        XCTAssertEqual(cache.computations, 1)
    }

    /// Pendant un fondu, le lecteur évalue la sortante ET la courante à chaque
    /// passe : le cache doit les tenir toutes les deux.
    func test_unFonduEntreDeuxStories_neRecalculeRien() {
        let cache = StoryImageOnlyVerdictCache()
        let sortante = story(id: "a"), courante = story(id: "b")
        for _ in 0..<10 {
            _ = cache.verdict(for: sortante, chain: [], canvasSize: canvas)
            _ = cache.verdict(for: courante, chain: [], canvasSize: canvas)
        }
        XCTAssertEqual(cache.computations, 2)
    }

    /// Ce qui change le verdict change la clé : la taille du canvas (rotation
    /// d'un iPad) et la chaîne du Prisme (un texte traduit n'a pas la même
    /// longueur).
    func test_uneAutreTailleOuUnAutrePrisme_recalcule() {
        let cache = StoryImageOnlyVerdictCache()
        let courante = story()
        _ = cache.verdict(for: courante, chain: ["fr"], canvasSize: canvas)
        _ = cache.verdict(for: courante, chain: ["fr"], canvasSize: CGSize(width: 810, height: 1440))
        _ = cache.verdict(for: courante, chain: ["en"], canvasSize: canvas)
        XCTAssertEqual(cache.computations, 3)
    }

    // MARK: - La forme de la carte

    func test_laForme_rogneAuRectangleDeLImage_ouAuCanvasEntier() {
        let entier = CGRect(origin: .zero, size: canvas)
        let image = CGRect(x: 0, y: 246, width: 405, height: 228)
        XCTAssertEqual(StoryReaderCardShape(imageRect: image, cornerRadius: 0).path(in: entier).boundingRect,
                       image)
        XCTAssertEqual(StoryReaderCardShape(imageRect: nil, cornerRadius: 0).path(in: entier).boundingRect,
                       entier)
    }

    /// Le clip vit dans l'espace non mis à l'échelle : une carte peinte à 0,5
    /// doit rogner à 44 pour montrer ses 22 pt de rayon.
    func test_leRayon_seCompensePourLEchelleDeLaCarte() {
        let cardee = StoryCanvasFraming.Result(scale: 0.5, offset: .zero, cornerRadius: 22)
        XCTAssertEqual(StoryReaderCardShape.unscaledCornerRadius(for: cardee), 44)
        let degeneree = StoryCanvasFraming.Result(scale: 0, offset: .zero, cornerRadius: 22)
        XCTAssertEqual(StoryReaderCardShape.unscaledCornerRadius(for: degeneree), 22)
    }

    // MARK: - Le montage

    /// **Les trois couches de la carte partagent la forme, et les quatre montages
    /// du canvas la décision de peindre les bandes.** Une couche restée sur
    /// l'ancien clip ferait sauter la forme quand le chargeur se retire ; un
    /// montage resté sur le défaut peindrait un flou rogné.
    func test_leLecteur_monteLaFormeEtLaDecisionSurChaqueCouche() throws {
        let source = AppSourceGuard.stripComments(try String(contentsOf: canvasSource, encoding: .utf8))
        XCTAssertEqual(source.components(separatedBy: ".readerCard(framing: readerCanvasFraming, imageRect: imageOnlyRect(of:").count - 1,
                       3, "canvas sortant, canvas courant, chargeur")
        XCTAssertEqual(source.components(separatedBy: "servesLetterboxFill: imageOnlyRect(of:").count - 1,
                       4, "deux hôtes, sortant et courant")
        XCTAssertFalse(source.contains("readerCanvasFraming.cornerRadius / readerCanvasFraming.scale"),
                       "aucune couche ne garde l'ancien clip écrit à la main")
    }

    private var canvasSource: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
    }
}
