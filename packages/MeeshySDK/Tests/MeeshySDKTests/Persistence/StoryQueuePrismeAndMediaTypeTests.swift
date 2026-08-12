import Foundation
import Testing
@testable import MeeshySDK

/// WS5 — Prisme Linguistique + media-type integrity across the offline/queued
/// publish converters.
///
/// WS5.1: `StoryQueueItemConverter` must carry the source language (`originalLanguage`)
///         both ways so the gateway can route NLLB-200/TTS on flush.
/// WS5.3: visual media must keep their real kind (video vs image) — inferred from
///         the file extension — so a queued `.mp4` replays as video, not as a
///         corrupt image (`UIImage(contentsOfFile:)` → nil → unrecoverable).
struct StoryQueuePrismeAndMediaTypeTests {

    // MARK: - WS5.1 — originalLanguage round-trips through the converter

    @Test func convert_carriesOriginalLanguage_ontoPublishItem() {
        let legacy = StoryOfflineQueueItem(
            slideIds: ["s1"],
            slidePayloadJSON: "[]",
            originalLanguage: "de",
            visibility: "PUBLIC"
        )
        let unified = StoryQueueItemConverter.convert(legacy)
        #expect(unified.originalLanguage == "de")
    }

    @Test func reverse_surfacesOriginalLanguage_fromPublishItem() {
        let unified = StoryPublishQueueItem(
            visibility: "FRIENDS",
            slidesPayload: Data("[]".utf8),
            originalLanguage: "it"
        )
        let legacy = StoryQueueItemConverter.reverse(unified)
        #expect(legacy.originalLanguage == "it")
    }

    @Test func convertThenReverse_preservesOriginalLanguage() {
        let legacy = StoryOfflineQueueItem(
            slideIds: ["s1"],
            slidePayloadJSON: "[]",
            originalLanguage: "pt",
            visibility: "PUBLIC"
        )
        let roundTripped = StoryQueueItemConverter.reverse(
            StoryQueueItemConverter.convert(legacy)
        )
        #expect(roundTripped.originalLanguage == "pt")
    }

    // MARK: - WS5.3 — visual media-type inference

    @Test func inferVisualMediaType_videoExtensions_returnVideo() {
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/clip.mp4") == "video")
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/clip.MOV") == "video")
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/clip.m4v") == "video")
    }

    @Test func inferVisualMediaType_imageOrUnknownExtensions_returnImage() {
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/photo.jpg") == "image")
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/photo.PNG") == "image")
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/noext") == "image")
    }

    // MARK: - WS5.3 / F4 — extension edge cases (documents the closed-set boundary)

    @Test func inferVisualMediaType_uppercaseMP4_returnsVideo() {
        // Lowercasing before lookup — an uppercase container extension still
        // resolves as video (regression guard for the case-insensitivity).
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/clip.MP4") == "video")
    }

    @Test func inferVisualMediaType_hiddenFileWithVideoExtension_returnsVideo() {
        // A leading-dot (hidden) file that STILL carries a real extension keeps
        // its kind — `NSString.pathExtension` reads the trailing ".mp4".
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/.hidden.mp4") == "video")
    }

    @Test func inferVisualMediaType_dotfileWithoutExtension_returnsImage() {
        // A pure dotfile (".gitignore") has NO extension per `NSString`
        // semantics → falls back to the "image" default. Documents the boundary.
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/.gitignore") == "image")
    }

    @Test func inferVisualMediaType_queryStringPath_returnsImage_closedSetBoundary() {
        // A URL-shaped path with a query string CANNOT occur from the real
        // callers (they feed `URL.path`, which strips the query), so the closed
        // set treats `mp4?token=abc` as an unknown extension → "image". This
        // pins the documented assumption: if a future caller ever passes a raw
        // URL string here, this test fails loudly and forces a decision.
        #expect(StoryMediaReference.inferVisualMediaType(forPath: "/tmp/movie.mp4?token=abc") == "image")
    }

    // MARK: - WS5.3 — converter tags a queued .mp4 as video, .jpg as image

    @Test func convert_tagsMp4AsVideo_andJpgAsImage() {
        let legacy = StoryOfflineQueueItem(
            slideIds: ["s1"],
            slidePayloadJSON: "[]",
            mediaURLPaths: ["vid": "/tmp/movie.mp4", "img": "/tmp/pic.jpg"],
            originalLanguage: "fr",
            visibility: "PUBLIC"
        )
        let unified = StoryQueueItemConverter.convert(legacy)
        let byElement = Dictionary(
            uniqueKeysWithValues: unified.mediaReferences.map { ($0.elementId, $0.mediaType) }
        )
        #expect(byElement["vid"] == "video")
        #expect(byElement["img"] == "image")
    }
}
