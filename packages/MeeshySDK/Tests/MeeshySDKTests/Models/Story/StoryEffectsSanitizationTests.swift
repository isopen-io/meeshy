import Testing
import Foundation
@testable import MeeshySDK

/// Le composer iOS stocke un `file://` local sur `StoryMediaObject.mediaURL`
/// pendant l'édition pour que le canvas preview puisse charger l'asset depuis
/// le sandbox de l'auteur (cf. `StoryComposerViewModel.setMediaURL`). Ce path
/// local n'a aucun sens côté serveur ni côté lecteur (sandbox différent) — il
/// DOIT être effacé avant le `POST /posts` qui publie la story, sinon les
/// lecteurs voient un canvas vide (cf. incident 2026-05-22, story
/// `6a10128bd884010643facd33` de jcnm).
///
/// Le contract documenté dans `StoryMediaLayer.swift:132-134` :
/// > "a published story never stamps `mediaURL` onto a per-object
/// > `StoryMediaObject` (the URL lives on `StoryItem.media`, reachable only
/// > via the resolver)"
struct StoryEffectsSanitizationTests {

    @Test func sanitized_nullifies_fileURL_mediaURL_on_mediaObject() {
        let media = makeMedia(
            postMediaId: "abc123",
            mediaURL: "file:///private/var/mobile/Containers/Data/Application/UUID/tmp/photo.jpg"
        )
        let effects = StoryEffects(mediaObjects: [media])

        let sanitized = effects.sanitizedForServerPublish()

        #expect(sanitized.mediaObjects?.first?.mediaURL == nil)
        #expect(sanitized.mediaObjects?.first?.postMediaId == "abc123")
    }

    @Test func sanitized_preserves_https_mediaURL() {
        let media = makeMedia(
            postMediaId: "abc123",
            mediaURL: "https://gate.meeshy.me/api/v1/attachments/file/foo.jpg"
        )
        let effects = StoryEffects(mediaObjects: [media])

        let sanitized = effects.sanitizedForServerPublish()

        #expect(sanitized.mediaObjects?.first?.mediaURL == "https://gate.meeshy.me/api/v1/attachments/file/foo.jpg")
    }

    @Test func sanitized_preserves_fixture_mediaURL() {
        let media = makeMedia(postMediaId: "abc", mediaURL: "fixture://media/red-square")
        let effects = StoryEffects(mediaObjects: [media])

        let sanitized = effects.sanitizedForServerPublish()

        #expect(sanitized.mediaObjects?.first?.mediaURL == "fixture://media/red-square")
    }

    @Test func sanitized_preserves_nil_mediaURL() {
        let media = makeMedia(postMediaId: "abc", mediaURL: nil)
        let effects = StoryEffects(mediaObjects: [media])

        let sanitized = effects.sanitizedForServerPublish()

        #expect(sanitized.mediaObjects?.first?.mediaURL == nil)
        #expect(sanitized.mediaObjects?.first?.postMediaId == "abc")
    }

    @Test func sanitized_preserves_layout_metadata_on_sanitized_media() {
        let media = StoryMediaObject(
            id: "media-1",
            postMediaId: "uploaded-id",
            mediaURL: "file:///tmp/foo.jpg",
            mediaType: "image",
            placement: "media",
            aspectRatio: 1.5,
            x: 0.42, y: 0.66,
            scale: 1.8, rotation: 0.5,
            anchor: CGPoint(x: 0.5, y: 0.5),
            volume: 0.75,
            isBackground: false,
            loop: false,
            zIndex: 52,
            sourceLanguage: "fr",
            thumbHash: "OQgGBoCQibl3d3eddqhoqGiF0IANCZU="
        )
        let effects = StoryEffects(mediaObjects: [media])

        let sanitized = effects.sanitizedForServerPublish()
        let result = sanitized.mediaObjects?.first

        #expect(result?.mediaURL == nil)
        #expect(result?.id == "media-1")
        #expect(result?.postMediaId == "uploaded-id")
        #expect(result?.aspectRatio == 1.5)
        #expect(result?.x == 0.42)
        #expect(result?.y == 0.66)
        #expect(result?.scale == 1.8)
        #expect(result?.rotation == 0.5)
        #expect(result?.zIndex == 52)
        #expect(result?.thumbHash == "OQgGBoCQibl3d3eddqhoqGiF0IANCZU=")
    }

    @Test func sanitized_handles_multiple_mediaObjects_independently() {
        let local = makeMedia(postMediaId: "id1", mediaURL: "file:///tmp/a.jpg")
        let remote = makeMedia(postMediaId: "id2", mediaURL: "https://cdn.meeshy.me/b.jpg")
        let empty = makeMedia(postMediaId: "id3", mediaURL: nil)
        let effects = StoryEffects(mediaObjects: [local, remote, empty])

        let sanitized = effects.sanitizedForServerPublish()
        let results = sanitized.mediaObjects ?? []

        #expect(results.count == 3)
        #expect(results[0].mediaURL == nil)
        #expect(results[1].mediaURL == "https://cdn.meeshy.me/b.jpg")
        #expect(results[2].mediaURL == nil)
    }

    @Test func sanitized_passthrough_when_mediaObjects_nil() {
        let effects = StoryEffects(textObjects: [], mediaObjects: nil)

        let sanitized = effects.sanitizedForServerPublish()

        #expect(sanitized.mediaObjects == nil)
    }

    @Test func sanitized_strips_uppercase_FILE_scheme() {
        // URL parsing en Swift n'est pas strictement case-sensitive sur le scheme.
        // On normalise tout en lowercase avant comparaison pour défense profonde.
        let media = makeMedia(postMediaId: "abc", mediaURL: "FILE:///tmp/foo.jpg")
        let effects = StoryEffects(mediaObjects: [media])

        let sanitized = effects.sanitizedForServerPublish()

        #expect(sanitized.mediaObjects?.first?.mediaURL == nil)
    }

    // Helper minimal pour construire un StoryMediaObject de test.
    private func makeMedia(postMediaId: String, mediaURL: String?) -> StoryMediaObject {
        StoryMediaObject(
            id: "test-\(postMediaId)",
            postMediaId: postMediaId,
            mediaURL: mediaURL,
            mediaType: "image",
            placement: "media",
            aspectRatio: 1.0
        )
    }
}
