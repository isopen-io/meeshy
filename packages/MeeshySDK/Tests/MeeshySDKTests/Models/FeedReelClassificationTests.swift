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

@Suite("ReelComposition (creation-time default type)")
struct ReelCompositionTests {

    @Test("any media kind suggests a reel")
    func suggests() {
        #expect(ReelComposition.suggestsReel(mediaKinds: [.video]))
        #expect(ReelComposition.suggestsReel(mediaKinds: [.image]))
        #expect(ReelComposition.suggestsReel(mediaKinds: [.image, .image]))
        #expect(ReelComposition.suggestsReel(mediaKinds: [.audio]))
        #expect(ReelComposition.suggestsReel(mediaKinds: [.audio, .image]))
    }

    @Test("no media or only non-reel media does not suggest a reel")
    func doesNotSuggest() {
        #expect(ReelComposition.suggestsReel(mediaKinds: []) == false)
        #expect(ReelComposition.suggestsReel(mediaKinds: [.document]) == false)
        #expect(ReelComposition.suggestsReel(mediaKinds: [.location]) == false)
    }

    @Test("media posts default to REEL")
    func defaultsToReel() {
        #expect(ReelComposition.defaultType(mediaKinds: [.video]) == .reel)
        #expect(ReelComposition.defaultType(mediaKinds: [.image, .audio]) == .reel)
    }

    @Test("forcing a plain post overrides the reel default")
    func forcePlainPost() {
        #expect(ReelComposition.defaultType(mediaKinds: [.video], forcePlainPost: true) == .post)
    }

    @Test("text-only posts default to POST")
    func textDefaultsToPost() {
        #expect(ReelComposition.defaultType(mediaKinds: []) == .post)
        #expect(ReelComposition.defaultType(mediaKinds: [.document]) == .post)
    }
}
