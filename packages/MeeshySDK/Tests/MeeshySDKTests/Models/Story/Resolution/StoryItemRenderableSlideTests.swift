import Foundation
import Testing
@testable import MeeshySDK

struct StoryItemRenderableSlideTests {
    @Test func toRenderableSlide_preservesEffects() {
        let textObj = StoryTextObject(id: "t1", text: "Hello",
                                      translations: ["fr": "Bonjour"])
        var effects = StoryEffects()
        effects.textObjects = [textObj]
        let item = StoryItem(id: "story-1", content: "Hello", media: [],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])

        #expect(slide.id == "story-1")
        #expect(slide.effects.textObjects.count == 1)
        #expect(slide.effects.textObjects[0].text == "Hello")
    }

    @Test func toRenderableSlide_emptyContent_returnsSlideWithoutContent() {
        let item = StoryItem(id: "story-1", content: nil, media: [],
                             storyEffects: nil, createdAt: Date(),
                             expiresAt: nil, isViewed: false)
        let slide = item.toRenderableSlide(preferredLanguages: ["fr"])
        #expect(slide.id == "story-1")
        #expect(slide.content == nil)
    }

    @Test func toRenderableSlide_resolvesContent_viaPreferredLanguageChain() {
        let item = StoryItem(id: "story-1", content: "Hello", media: [],
                             storyEffects: nil, createdAt: Date(),
                             expiresAt: nil, isViewed: false)
        let slide = item.toRenderableSlide(preferredLanguages: ["fr"])
        // fallback to "Hello" when no translations on the item
        #expect(slide.content == "Hello")
    }

    // MARK: - WS1.5 — aspectRatio legacy hydration depuis FeedMedia

    @Test func toRenderableSlide_hydratesLegacyAspectRatio_fromFeedMediaDimensions() throws {
        // Média avec aspectRatio legacy (≈1.0, sentinelle d'avant le champ) + un
        // FeedMedia correspondant portant width/height → le reader doit recadrer
        // à la vraie proportion (1080×1920 = 0.5625), pas en carré squishé.
        let obj = StoryMediaObject(id: "obj1", postMediaId: "m1", kind: .image, aspectRatio: 1.0)
        var effects = StoryEffects()
        effects.mediaObjects = [obj]
        let feed = FeedMedia(id: "m1", type: .image, thumbnailColor: "000000",
                             width: 1080, height: 1920)
        let item = StoryItem(id: "story-1", content: nil, media: [feed],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])
        let ratio = try #require(slide.effects.mediaObjects?.first?.aspectRatio)
        #expect(abs(ratio - (1080.0 / 1920.0)) < 0.001)
    }

    @Test func toRenderableSlide_keepsRealAspectRatio_whenAlreadyPersisted() throws {
        // Un aspectRatio réel (≠ 1.0) ne doit JAMAIS être écrasé par FeedMedia.
        let obj = StoryMediaObject(id: "obj1", postMediaId: "m1", kind: .image, aspectRatio: 1.7)
        var effects = StoryEffects()
        effects.mediaObjects = [obj]
        let feed = FeedMedia(id: "m1", type: .image, thumbnailColor: "000000",
                             width: 1080, height: 1920)
        let item = StoryItem(id: "story-1", content: nil, media: [feed],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])
        let ratio = try #require(slide.effects.mediaObjects?.first?.aspectRatio)
        #expect(abs(ratio - 1.7) < 0.001)
    }

    // MARK: - legacy mediaURL routing (F1 revert: any mediaObject nulls mediaURL)

    @Test func toRenderableSlide_staticBgWithForeground_currentlyDropsBg_deferred() {
        // KNOWN DEFERRED limitation (adversarial-review F1): a static bg photo
        // published as StoryItem.media[0] (NOT an isBackground StoryMediaObject)
        // alongside a foreground mediaObject currently LOSES its background —
        // `mediaURL` is nulled the moment ANY mediaObject exists. The WS5.4
        // attempt to preserve it was reverted because the only consumer,
        // `StoryRenderer.renderBackground`, discards the URL and feeds `slide.id`
        // (a post id) to a resolver keyed on `FeedMedia.id`, so the bg never
        // resolved AND a non-nil mediaURL pre-empted the solid-color fallback —
        // turning modern foreground-only stories BLACK. The proper fix routes the
        // URL via `directURLIfAny` in renderBackground + on-device verification.
        let foreground = StoryMediaObject(id: "fg", postMediaId: "fg-media",
                                          kind: .image, aspectRatio: 1.5,
                                          isBackground: false)
        var effects = StoryEffects()
        effects.mediaObjects = [foreground]
        let bg = FeedMedia(id: "bg-media", type: .image,
                           url: "https://cdn.example.com/bg.jpg",
                           thumbnailColor: "000000")
        let item = StoryItem(id: "story-1", content: nil, media: [bg],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])
        #expect(slide.mediaURL == nil)
    }

    @Test func toRenderableSlide_keepsLegacyMediaURL_whenNoMediaObjects() {
        // Pure legacy story (no `effects.mediaObjects` at all): the static bg
        // asset lives directly in StoryItem.media[0] and MUST survive as the
        // slide's legacy mediaURL. This is the original behavior the F1 revert
        // preserves.
        var effects = StoryEffects()
        effects.textObjects = [StoryTextObject(id: "t1", text: "hi")]
        let bg = FeedMedia(id: "bg-media", type: .image,
                           url: "https://cdn.example.com/legacy-bg.jpg",
                           thumbnailColor: "000000")
        let item = StoryItem(id: "story-1", content: nil, media: [bg],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])
        #expect(slide.mediaURL == "https://cdn.example.com/legacy-bg.jpg")
    }

    @Test func toRenderableSlide_nullsLegacyMediaURL_whenBackgroundIsMediaObject() {
        // Modern story: the background IS an isBackground StoryMediaObject. The
        // legacy mediaURL must stay nil so StoryRenderer.renderBackground does
        // not feed a post id to the URL resolver.
        let bgObject = StoryMediaObject(id: "bgo", postMediaId: "bgo-media",
                                        kind: .image, aspectRatio: 0.5625,
                                        isBackground: true)
        var effects = StoryEffects()
        effects.mediaObjects = [bgObject]
        let media = FeedMedia(id: "bgo-media", type: .image,
                              url: "https://cdn.example.com/should-not-leak.jpg",
                              thumbnailColor: "000000")
        let item = StoryItem(id: "story-1", content: nil, media: [media],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])
        #expect(slide.mediaURL == nil)
    }
}
