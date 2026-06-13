import Testing
import Foundation
@testable import MeeshySDK

@Suite("FeedPost reel classification")
struct FeedReelClassificationTests {

    private func post(type: String? = "POST", media: [FeedMedia] = [], repost: RepostContent? = nil) -> FeedPost {
        FeedPost(author: "Alice", type: type, content: "hello", media: media, mediaUrl: nil)
            .with(repost: repost)
    }

    // MARK: - isReel

    @Test("text-only post is not a reel")
    func textOnly() {
        #expect(post(media: []).isReel == false)
    }

    @Test("a single video makes a reel")
    func singleVideo() {
        #expect(post(media: [.video(duration: 12)]).isReel)
    }

    @Test("a single image makes a reel")
    func singleImage() {
        #expect(post(media: [.image()]).isReel)
    }

    @Test("multiple images make a reel")
    func multipleImages() {
        #expect(post(media: [.image(), .image(), .image()]).isReel)
    }

    @Test("audio alone makes a reel")
    func audioOnly() {
        #expect(post(media: [.audio(duration: 30)]).isReel)
    }

    @Test("audio with images makes a reel")
    func audioWithImages() {
        #expect(post(media: [.audio(duration: 30), .image()]).isReel)
    }

    @Test("a document-only post is not a reel")
    func documentOnly() {
        #expect(post(media: [.document(name: "spec.pdf", size: "1 MB", pages: 3)]).isReel == false)
    }

    @Test("a location-only post is not a reel")
    func locationOnly() {
        #expect(post(media: [.location(name: "Paris", lat: 48.8, lon: 2.3)]).isReel == false)
    }

    @Test("an untyped media post is treated as a reel")
    func untypedDefaultsToPost() {
        #expect(post(type: nil, media: [.video(duration: 5)]).isReel)
    }

    @Test("stories and statuses are never reels even with media")
    func storyAndStatusExcluded() {
        #expect(post(type: "STORY", media: [.video(duration: 5)]).isReel == false)
        #expect(post(type: "STATUS", media: [.image()]).isReel == false)
    }

    @Test("a repost is never a reel even with media")
    func repostExcluded() {
        let source = RepostContent(author: "Bob", content: "original", media: [.video(duration: 9)])
        #expect(post(media: [.video(duration: 9)], repost: source).isReel == false)
    }

    // MARK: - primaryReelMedia

    @Test("primary media prefers video over audio over image")
    func primaryPrefersVideo() {
        let p = post(media: [.image(), .audio(duration: 10), .video(duration: 20)])
        #expect(p.primaryReelMedia?.type == .video)
    }

    @Test("primary media falls back to audio when no video")
    func primaryFallsBackToAudio() {
        let p = post(media: [.image(), .audio(duration: 10)])
        #expect(p.primaryReelMedia?.type == .audio)
    }

    @Test("primary media is the first image when image-only")
    func primaryImageOnly() {
        let p = post(media: [.image(), .image()])
        #expect(p.primaryReelMedia?.type == .image)
    }

    @Test("primary media is nil for a non-reel")
    func primaryNilForNonReel() {
        #expect(post(media: []).primaryReelMedia == nil)
    }

    // MARK: - reels(from:)

    @Test("reels filter keeps only media posts and preserves order")
    func reelsFilter() {
        let a = post(media: [.video(duration: 1)])
        let b = post(media: [])
        let c = post(media: [.image()])
        let filtered = FeedPost.reels(from: [a, b, c])
        #expect(filtered.map(\.id) == [a.id, c.id])
    }
}

// Test-only helper: rebuilds a post with a repost attached, since `FeedPost`
// exposes `repost` as a mutable property but its initializer takes no repost.
private extension FeedPost {
    func with(repost: RepostContent?) -> FeedPost {
        guard let repost else { return self }
        var copy = self
        copy.repost = repost
        return copy
    }
}
