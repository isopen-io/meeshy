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

    @Test func toRenderableSlide_staticBgWithForeground_routesUnreferencedMediaAsBackground() {
        // A static bg photo published as StoryItem.media[0] (NOT an isBackground
        // StoryMediaObject) alongside a foreground mediaObject: the bg asset is
        // the media entry NOT referenced by any object → it must survive as the
        // slide's legacy `mediaURL` so `StoryRenderer.renderBackground` routes it
        // via `directURLIfAny` instead of falling through to `.solidColor(.black)`
        // (black background bug on other users' stories). The foreground object
        // keeps resolving via `StoryMediaLayer`.
        let foreground = StoryMediaObject(id: "fg", postMediaId: "fg-media",
                                          kind: .image, aspectRatio: 1.5,
                                          isBackground: false)
        var effects = StoryEffects()
        effects.mediaObjects = [foreground]
        let fg = FeedMedia(id: "fg-media", type: .image,
                           url: "https://cdn.example.com/fg.jpg",
                           thumbnailColor: "000000")
        let bg = FeedMedia(id: "bg-media", type: .image,
                           url: "https://cdn.example.com/bg.jpg",
                           thumbnailColor: "000000")
        let item = StoryItem(id: "story-1", content: nil, media: [fg, bg],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])
        #expect(slide.mediaURL == "https://cdn.example.com/bg.jpg")
    }

    @Test func toRenderableSlide_foregroundOnlyReferencedMedia_keepsMediaURLNil() {
        // Pure foreground story: the only media entry IS referenced by the
        // foreground object → there is no static backdrop, so `mediaURL` must
        // stay nil and the background comes from `effects.background` /
        // `.solidColor`. Guards against mistaking a foreground asset for a bg.
        let foreground = StoryMediaObject(id: "fg", postMediaId: "fg-media",
                                          kind: .image, aspectRatio: 1.5,
                                          isBackground: false)
        var effects = StoryEffects()
        effects.mediaObjects = [foreground]
        let fg = FeedMedia(id: "fg-media", type: .image,
                           url: "https://cdn.example.com/fg.jpg",
                           thumbnailColor: "000000")
        let item = StoryItem(id: "story-1", content: nil, media: [fg],
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

    // MARK: - Forme legacy « média seul » (TRANSITOIRE)

    /// Un client sans `X-Canvas-Caps` reçoit d'une story canvas v3 une forme
    /// dégradée : `storyEffects` OMIS, le média porteur seul dans `media[0]`
    /// (règle 5 du gateway, `negotiateWireStoryEffects`). Le lecteur doit la
    /// peindre comme un fond VIDÉO — pas la décoder en image (constat du
    /// 2026-08-22 : `.mov` passé à ImageIO, écran vide). L'adaptateur migre la
    /// forme legacy vers le modèle unique (un `StoryMediaObject` de fond) ;
    /// il disparaîtra avec le dernier client legacy.
    @Test func toRenderableSlide_legacyVideoMedia_becomesBackgroundMediaObject() throws {
        let carrier = FeedMedia(id: "6a894bd7731e308cebfb49c3", type: .video,
                                url: "https://gate.example.com/file/EDE58BC9.mov",
                                thumbHash: "HNcJFwKVdodwanhneHhlmIiHVghndHAG",
                                thumbnailColor: "000000",
                                width: 1078, height: 1128, duration: 58)
        let item = StoryItem(id: "story-1", content: "Landing soon", media: [carrier],
                             storyEffects: nil, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])

        let bg = try #require(slide.effects.mediaObjects?.first)
        #expect(slide.effects.mediaObjects?.count == 1)
        #expect(bg.kind == .video)
        #expect(bg.isBackground)
        #expect(bg.postMediaId == "6a894bd7731e308cebfb49c3")
        #expect(bg.mediaURL == "https://gate.example.com/file/EDE58BC9.mov")
        #expect(bg.thumbHash == "HNcJFwKVdodwanhneHhlmIiHVghndHAG")
        #expect(bg.duration == 58)
        #expect(abs(bg.aspectRatio - 1078.0 / 1128.0) < 0.001)
        #expect(slide.mediaURL == nil, "Le média est référencé par l'objet de fond : plus de route legacy.")
    }

    /// `mimeType` est DÉCLARÉ par le client qui téléverse, jamais vérifié :
    /// l'extension de l'URL est la vérité du contenu (`StoryMediaStoreRouter`).
    @Test func toRenderableSlide_legacyMovDeclaredImage_isStillTreatedAsVideo() throws {
        let carrier = FeedMedia(id: "m1", type: .image,
                                url: "https://gate.example.com/file/clip.mov",
                                thumbnailColor: "000000")
        let item = StoryItem(id: "story-1", content: nil, media: [carrier],
                             storyEffects: nil, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])

        let bg = try #require(slide.effects.mediaObjects?.first)
        #expect(bg.kind == .video)
        #expect(slide.mediaURL == nil)
    }

    /// Une story legacy dont le média est une IMAGE garde sa route historique
    /// (`slide.mediaURL`) : elle fonctionne, on ne la déplace pas.
    @Test func toRenderableSlide_legacyImageMedia_keepsTheHistoricalRoute() {
        let carrier = FeedMedia(id: "m1", type: .image,
                                url: "https://gate.example.com/file/photo.jpg",
                                thumbnailColor: "000000")
        let item = StoryItem(id: "story-1", content: nil, media: [carrier],
                             storyEffects: nil, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])

        #expect(slide.effects.mediaObjects?.isEmpty ?? true)
        #expect(slide.mediaURL == "https://gate.example.com/file/photo.jpg")
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

    // MARK: - Hydratation de l'URL des pistes audio

    /// `StoryAudioPlayerObject` ne référence son asset que par `postMediaId` :
    /// l'URL vit dans `FeedMedia`. Sans cette hydratation, tout consommateur du
    /// slide qui n'a pas d'index postMediaId → URL sous la main (l'exporteur des
    /// chemins « Partager » / « Enregistrer ») ne peut pas retrouver le son.
    @Test func toRenderableSlide_hydratesAudioMediaURL_fromFeedMedia() throws {
        let audio = StoryAudioPlayerObject(id: "au1", postMediaId: "pm-audio")
        var effects = StoryEffects()
        effects.audioPlayerObjects = [audio]
        let feed = FeedMedia(id: "pm-audio", type: .audio,
                             url: "https://cdn.example.com/track.m4a",
                             thumbnailColor: "000000", duration: 12)
        let item = StoryItem(id: "story-1", content: nil, media: [feed],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])

        let resolved = try #require(slide.effects.audioPlayerObjects?.first)
        #expect(resolved.mediaURL == "https://cdn.example.com/track.m4a")
        #expect(resolved.duration == 12)
    }

    /// Une URL déjà persistée par le composer est la plus fiable : le repli par
    /// `FeedMedia` ne doit jamais l'écraser.
    @Test func toRenderableSlide_keepsPersistedAudioMediaURL() throws {
        var audio = StoryAudioPlayerObject(id: "au1", postMediaId: "pm-audio")
        audio.mediaURL = "https://cdn.example.com/persisted.m4a"
        var effects = StoryEffects()
        effects.audioPlayerObjects = [audio]
        let feed = FeedMedia(id: "pm-audio", type: .audio,
                             url: "https://cdn.example.com/other.m4a",
                             thumbnailColor: "000000")
        let item = StoryItem(id: "story-1", content: nil, media: [feed],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])

        #expect(slide.effects.audioPlayerObjects?.first?.mediaURL
                == "https://cdn.example.com/persisted.m4a")
    }
}
