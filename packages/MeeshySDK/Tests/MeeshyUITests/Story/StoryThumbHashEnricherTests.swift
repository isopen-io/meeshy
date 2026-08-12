import XCTest
import UIKit
@testable import MeeshySDK
@testable import MeeshyUI

/// S3.1 — l'enrichissement thumbHash a quitté le chemin du tap « Publier ».
/// Il vit désormais dans un atome sans état : tout entre par paramètre, tout
/// sort par la valeur de retour, et une borne de temps par média garantit
/// qu'aucune vidéo pathologique ne peut le faire durer indéfiniment.
@MainActor
final class StoryThumbHashEnricherTests: XCTestCase {

    func test_enrich_slideWithBackgroundImage_populatesCompositeThumbHash() async {
        let slide = StorySlide(id: "slide-1")
        let enriched = await StoryThumbHashEnricher.enrich(
            slides: [slide],
            bgImages: ["slide-1": Self.solidImage(.red)],
            loadedImages: [:],
            videoURLs: [:]
        )

        XCTAssertNotNil(enriched.first?.effects.thumbHash)
    }

    func test_enrich_imageMedium_populatesMediumThumbHashFromLoadedImages() async {
        var slide = StorySlide(id: "slide-1")
        slide.effects.mediaObjects = [Self.medium(id: "media-1", type: "image")]

        let enriched = await StoryThumbHashEnricher.enrich(
            slides: [slide],
            bgImages: [:],
            loadedImages: ["media-1": Self.solidImage(.blue)],
            videoURLs: [:]
        )

        XCTAssertNotNil(enriched.first?.effects.mediaObjects?.first?.thumbHash)
    }

    func test_enrich_mediumWithExistingThumbHash_keepsItUnchanged() async {
        var medium = Self.medium(id: "media-1", type: "image")
        medium.thumbHash = "already-hashed"
        var slide = StorySlide(id: "slide-1")
        slide.effects.mediaObjects = [medium]

        let enriched = await StoryThumbHashEnricher.enrich(
            slides: [slide],
            bgImages: [:],
            loadedImages: ["media-1": Self.solidImage(.green)],
            videoURLs: [:]
        )

        XCTAssertEqual(enriched.first?.effects.mediaObjects?.first?.thumbHash, "already-hashed",
                       "Un thumbHash déjà présent n'est JAMAIS recalculé")
    }

    func test_enrich_videoMediumWithoutResolvableURL_leavesThumbHashNil() async {
        var slide = StorySlide(id: "slide-1")
        slide.effects.mediaObjects = [Self.medium(id: "media-1", type: "video")]

        let enriched = await StoryThumbHashEnricher.enrich(
            slides: [slide],
            bgImages: [:],
            loadedImages: [:],
            videoURLs: [:]
        )

        XCTAssertNil(enriched.first?.effects.mediaObjects?.first?.thumbHash)
    }

    func test_enrich_videoProviderExceedingTimeout_returnsNilAndDoesNotHang() async {
        var slide = StorySlide(id: "slide-1")
        slide.effects.mediaObjects = [Self.medium(id: "media-1", type: "video")]

        let started = Date()
        let enriched = await StoryThumbHashEnricher.enrich(
            slides: [slide],
            bgImages: [:],
            loadedImages: [:],
            videoURLs: ["media-1": URL(fileURLWithPath: "/tmp/never.mp4")],
            videoTimeout: .milliseconds(50),
            videoThumbHashProvider: { _ in
                try? await Task.sleep(nanoseconds: 30_000_000_000)
                return "too-late"
            }
        )

        XCTAssertLessThan(Date().timeIntervalSince(started), 1.0,
                          "La borne rend la main sans attendre la vidéo pathologique")
        XCTAssertNil(enriched.first?.effects.mediaObjects?.first?.thumbHash)
    }

    func test_enrich_preservesSlideOrderAndIdentifiers() async {
        let slides = ["a", "b", "c"].map { id -> StorySlide in
            var slide = StorySlide(id: id)
            slide.effects.mediaObjects = [Self.medium(id: "m-\(id)", type: "image")]
            return slide
        }

        let enriched = await StoryThumbHashEnricher.enrich(
            slides: slides,
            bgImages: [:],
            loadedImages: [:],
            videoURLs: [:]
        )

        XCTAssertEqual(enriched.map(\.id), ["a", "b", "c"])
        XCTAssertEqual(enriched.compactMap { $0.effects.mediaObjects?.first?.id },
                       ["m-a", "m-b", "m-c"])
    }

    func test_enrich_tenVideoSlides_completesWithinOneTimeoutBudget() async {
        let slides = (0..<10).map { idx -> StorySlide in
            var slide = StorySlide(id: "slide-\(idx)")
            slide.effects.mediaObjects = [Self.medium(id: "media-\(idx)", type: "video")]
            return slide
        }
        let urls = Dictionary(uniqueKeysWithValues: (0..<10).map {
            ("media-\($0)", URL(fileURLWithPath: "/tmp/clip-\($0).mp4"))
        })

        let started = Date()
        let enriched = await StoryThumbHashEnricher.enrich(
            slides: slides,
            bgImages: [:],
            loadedImages: [:],
            videoURLs: urls,
            videoThumbHashProvider: { _ in
                try? await Task.sleep(nanoseconds: 300_000_000)
                return "hash"
            }
        )

        // 10 × 300 ms en séquentiel = 3 s. Sous 1,5 s, l'enrichissement ne se
        // sérialise donc pas média par média — c'est l'EFFET attendu, pas un
        // nombre d'appels concurrents observé.
        XCTAssertLessThan(Date().timeIntervalSince(started), 1.5)
        XCTAssertEqual(enriched.compactMap { $0.effects.mediaObjects?.first?.thumbHash }.count, 10)
    }

    // MARK: - Helpers

    private static func medium(id: String, type: String) -> StoryMediaObject {
        StoryMediaObject(id: id, mediaType: type, aspectRatio: 1.0)
    }

    private static func solidImage(_ color: UIColor) -> UIImage {
        UIGraphicsImageRenderer(size: CGSize(width: 20, height: 20)).image { ctx in
            color.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: 20, height: 20))
        }
    }
}
