import Testing
import Foundation
@testable import MeeshySDK

@Suite("FeedPost reel classification")
struct FeedReelClassificationTests {

    private func post(type: String?, media: [FeedMedia] = []) -> FeedPost {
        FeedPost(author: "Alice", type: type, content: "hello", media: media, mediaUrl: nil)
    }

    // MARK: - isReel (server type is authoritative)

    @Test("a REEL-typed post is a reel")
    func reelType() {
        #expect(post(type: "REEL", media: [.video(duration: 12)]).isReel)
        #expect(post(type: "reel").isReel) // case-insensitive
    }

    @Test("a POST is never a reel, even with media")
    func postTypeNotReel() {
        #expect(post(type: "POST", media: [.video(duration: 12)]).isReel == false)
        #expect(post(type: "POST", media: [.image(), .image()]).isReel == false)
    }

    @Test("untyped, story and status are not reels")
    func otherTypesNotReel() {
        #expect(post(type: nil, media: [.video(duration: 5)]).isReel == false)
        #expect(post(type: "STORY", media: [.video(duration: 5)]).isReel == false)
        #expect(post(type: "STATUS", media: [.image()]).isReel == false)
    }

    // MARK: - primaryReelMedia

    @Test("primary media prefers video over audio over image")
    func primaryPrefersVideo() {
        let p = post(type: "REEL", media: [.image(), .audio(duration: 10), .video(duration: 20)])
        #expect(p.primaryReelMedia?.type == .video)
    }

    @Test("primary media falls back to audio when no video")
    func primaryFallsBackToAudio() {
        let p = post(type: "REEL", media: [.image(), .audio(duration: 10)])
        #expect(p.primaryReelMedia?.type == .audio)
    }

    @Test("primary media is the first image when image-only")
    func primaryImageOnly() {
        let p = post(type: "REEL", media: [.image(), .image()])
        #expect(p.primaryReelMedia?.type == .image)
    }

    @Test("primary media is nil for a non-reel")
    func primaryNilForNonReel() {
        #expect(post(type: "POST", media: [.video(duration: 1)]).primaryReelMedia == nil)
    }

    // MARK: - reels(from:)

    @Test("reels filter keeps only REEL posts and preserves order")
    func reelsFilter() {
        let a = post(type: "REEL", media: [.video(duration: 1)])
        let b = post(type: "POST", media: [.image()])
        let c = post(type: "REEL", media: [.image()])
        let filtered = FeedPost.reels(from: [a, b, c])
        #expect(filtered.map(\.id) == [a.id, c.id])
    }
}

@Suite("FeedPost reel display media (repost-aware)")
struct FeedPostReelDisplayMediaTests {

    private func post(type: String?, media: [FeedMedia] = []) -> FeedPost {
        FeedPost(author: "Alice", type: type, content: "hi", media: media, mediaUrl: nil)
    }

    @Test("a non-repost reel uses its own media")
    func ownMedia() {
        let p = post(type: "REEL", media: [.video(duration: 3)])
        #expect(p.reelDisplayMedia.count == 1)
        #expect(p.primaryReelDisplayMedia?.type == .video)
    }

    @Test("a reel repost with empty outer media falls back to the reposted reel media")
    func repostFallback() {
        var p = post(type: "REEL", media: [])
        p.repost = RepostContent(author: "Marie", content: "", type: "REEL",
                                 media: [.image(), .video(duration: 9)])
        #expect(p.reelDisplayMedia.count == 2)
        #expect(p.primaryReelDisplayMedia?.type == .video) // video preferred
    }

    @Test("image-only reel repost surfaces the first image")
    func repostImageOnly() {
        var p = post(type: "REEL", media: [])
        p.repost = RepostContent(author: "Marie", content: "", type: "REEL", media: [.image(), .image()])
        #expect(p.primaryReelDisplayMedia?.type == .image)
    }

    @Test("outer media wins when present even if a repost exists")
    func outerWins() {
        var p = post(type: "REEL", media: [.video(duration: 1)])
        p.repost = RepostContent(author: "Marie", content: "", type: "REEL", media: [.image()])
        #expect(p.primaryReelDisplayMedia?.type == .video)
    }

    @Test("no media anywhere returns nil")
    func empty() {
        #expect(post(type: "REEL", media: []).primaryReelDisplayMedia == nil)
    }
}

@Suite("RepostContent reel classification")
struct RepostContentReelClassificationTests {

    private func repost(type: String?, media: [FeedMedia] = []) -> RepostContent {
        RepostContent(author: "Marie", content: "", type: type, media: media)
    }

    // MARK: - isReel (mirrors FeedPost: server type is authoritative)

    @Test("a REEL-typed repost is a reel")
    func reelType() {
        #expect(repost(type: "REEL", media: [.video(duration: 12)]).isReel)
        #expect(repost(type: "reel").isReel) // case-insensitive
    }

    @Test("a POST repost, untyped, and story are not reels")
    func nonReelTypes() {
        #expect(repost(type: "POST", media: [.video(duration: 1)]).isReel == false)
        #expect(repost(type: nil).isReel == false)
        #expect(repost(type: "STORY", media: [.image()]).isReel == false)
    }

    // MARK: - primaryReelMedia (video > audio > image, nil when not a reel)

    @Test("primary media prefers video over audio over image")
    func primaryPrefersVideo() {
        let r = repost(type: "REEL", media: [.image(), .audio(duration: 10), .video(duration: 20)])
        #expect(r.primaryReelMedia?.type == .video)
    }

    @Test("primary media falls back to audio, then to image")
    func primaryFallback() {
        #expect(repost(type: "REEL", media: [.image(), .audio(duration: 10)]).primaryReelMedia?.type == .audio)
        #expect(repost(type: "REEL", media: [.image(), .image()]).primaryReelMedia?.type == .image)
    }

    @Test("primary media is nil for a non-reel repost")
    func primaryNilForNonReel() {
        #expect(repost(type: "POST", media: [.video(duration: 1)]).primaryReelMedia == nil)
    }
}

@Suite("ReelComposition (creation-time qualification, règle produit 2026-08-02 + directive durée minimale)")
struct ReelCompositionTests {

    /// Durée large, au-dessus du plancher — les cas de qualification non liés
    /// à la durée l'utilisent pour ne pas se soucier du plancher de 3s.
    private let long = 5000

    private func media(_ kinds: FeedMediaType...) -> [(kind: FeedMediaType, durationMs: Int?)] {
        kinds.map { (kind: $0, durationMs: long) }
    }

    // MARK: - qualifiesAsReel(mediaKinds:) — video (>=3s) || audio (>=3s) || >= 2 images

    @Test("a video, an audio, or at least two images qualifies as a reel (sufficient duration)")
    func qualifies() {
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.video)))
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.audio)))
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.image, .image)))
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.image, .image, .image)))
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.audio, .image)))
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.video, .image)))
    }

    @Test("a single image does NOT qualify — the 2→1 removal trap")
    func singleImageDoesNotQualify() {
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.image)) == false)
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.image, .document)) == false)
    }

    @Test("no media or only non-reel media never qualifies")
    func doesNotQualify() {
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: []) == false)
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.document)) == false)
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: media(.document, .document)) == false)
    }

    @Test("a video or audio under 3 seconds does NOT qualify")
    func shortDurationDoesNotQualify() {
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: [(kind: .video, durationMs: 2999)]) == false)
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: [(kind: .audio, durationMs: 2999)]) == false)
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: [(kind: .video, durationMs: 0)]) == false)
    }

    @Test("a video or audio at exactly 3 seconds qualifies")
    func boundaryDurationQualifies() {
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: [(kind: .video, durationMs: 3000)]))
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: [(kind: .audio, durationMs: 3000)]))
    }

    @Test("a missing duration on video/audio does NOT qualify")
    func nilDurationDoesNotQualify() {
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: [(kind: .video, durationMs: nil)]) == false)
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: [(kind: .audio, durationMs: nil)]) == false)
    }

    @Test("images are never subject to the duration floor")
    func imagesIgnoreDuration() {
        #expect(ReelComposition.qualifiesAsReel(mediaKinds: [(kind: .image, durationMs: 0), (kind: .image, durationMs: nil)]))
    }

    // MARK: - qualifiesAsReel(mimeTypes:durationsMs:) — same rule from MIME strings

    @Test("MIME variant mirrors the kinds variant")
    func mimeMirrorsKinds() {
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["video/mp4"], durationsMs: [long]))
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["audio/mp4"], durationsMs: [long]))
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["image/jpeg", "image/png"]))
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["audio/mpeg", "image/heic"], durationsMs: [long]))
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["image/jpeg"]) == false)
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["application/pdf"]) == false)
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: []) == false)
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["IMAGE/JPEG", "Image/PNG"])) // case-insensitive
    }

    @Test("MIME variant applies the duration floor to video/audio")
    func mimeAppliesDurationFloor() {
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["video/mp4"], durationsMs: [2999]) == false)
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["video/mp4"]) == false) // missing duration entry
        #expect(ReelComposition.qualifiesAsReel(mimeTypes: ["video/mp4"], durationsMs: [3000]))
    }

    // MARK: - defaultType

    @Test("qualifying compositions default to REEL")
    func defaultsToReel() {
        #expect(ReelComposition.defaultType(mediaKinds: media(.video)) == .reel)
        #expect(ReelComposition.defaultType(mediaKinds: media(.audio)) == .reel)
        #expect(ReelComposition.defaultType(mediaKinds: media(.image, .image)) == .reel)
        #expect(ReelComposition.defaultType(mimeTypes: ["audio/mp4"], durationsMs: [long]) == .reel)
    }

    @Test("a single image defaults to POST even without forcePlainPost")
    func singleImageDefaultsToPost() {
        #expect(ReelComposition.defaultType(mediaKinds: media(.image)) == .post)
        #expect(ReelComposition.defaultType(mimeTypes: ["image/jpeg"]) == .post)
    }

    @Test("a video under 3 seconds defaults to POST")
    func shortVideoDefaultsToPost() {
        #expect(ReelComposition.defaultType(mediaKinds: [(kind: .video, durationMs: 1000)]) == .post)
        #expect(ReelComposition.defaultType(mimeTypes: ["video/mp4"], durationsMs: [1000]) == .post)
    }

    @Test("forcing a plain post overrides the reel default")
    func forcePlainPost() {
        #expect(ReelComposition.defaultType(mediaKinds: media(.video), forcePlainPost: true) == .post)
        #expect(ReelComposition.defaultType(mimeTypes: ["audio/mp4"], durationsMs: [long], forcePlainPost: true) == .post)
    }

    @Test("text-only or document-only posts default to POST")
    func textDefaultsToPost() {
        #expect(ReelComposition.defaultType(mediaKinds: []) == .post)
        #expect(ReelComposition.defaultType(mediaKinds: media(.document)) == .post)
    }
}
