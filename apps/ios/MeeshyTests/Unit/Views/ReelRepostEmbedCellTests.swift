import XCTest
@testable import Meeshy
import MeeshySDK

/// WS4 reposts media + sound — pure resolvers behind the repost rendering paths.
/// RF1: the POST/STATUS repost media preview model + tap routing.
/// RF2: the reposted-reel video resolver + the cell-identity election key.
@MainActor
final class ReelRepostEmbedCellTests: XCTestCase {

    // MARK: - Factories

    private func reelRepost(id: String = "reelX", media: [FeedMedia]) -> RepostContent {
        RepostContent(id: id, author: "Marie", content: "", type: "REEL", media: media)
    }

    private func postRepost(id: String = "p0", media: [FeedMedia]) -> RepostContent {
        RepostContent(id: id, author: "Marie", content: "Hello", type: "POST", media: media)
    }

    // MARK: - RF1 — repostMediaPreviewModel

    func test_repostMediaPreviewModel_emptyMedia_isNil() {
        let model = FeedPostCard.repostMediaPreviewModel(for: postRepost(media: []))
        XCTAssertNil(model, "A text-only repost must keep its byte-identical layout (no preview block)")
    }

    func test_repostMediaPreviewModel_singleMedia_primaryAndCountOne() {
        let img = FeedMedia.image(url: "https://cdn/a.jpg")
        let model = FeedPostCard.repostMediaPreviewModel(for: postRepost(media: [img]))
        XCTAssertEqual(model?.primary.id, img.id)
        XCTAssertEqual(model?.count, 1)
    }

    func test_repostMediaPreviewModel_multiMedia_primaryIsFirstAndCountTotal() {
        let first = FeedMedia.image(url: "https://cdn/a.jpg")
        let model = FeedPostCard.repostMediaPreviewModel(
            for: postRepost(media: [first, .image(url: "https://cdn/b.jpg"), .video(duration: 4)])
        )
        XCTAssertEqual(model?.primary.id, first.id)
        XCTAssertEqual(model?.count, 3)
    }

    // MARK: - RF1 — tap routing (review correction)

    func test_repostTapTargetId_routesToOriginalRepostedPost_notOuterCard() {
        let repost = postRepost(id: "originalPost", media: [.image()])
        XCTAssertEqual(FeedPostCard.repostTapTargetId(for: repost), "originalPost",
                       "Tapping the reposted media must open the ORIGINAL reposted post, not the reposter's card")
    }

    // MARK: - RF2 — reelVideoMedia resolver

    func test_reelVideoMedia_videoReel_returnsVideo() {
        let video = FeedMedia.video(duration: 12)
        let media = ReelRepostEmbedCell.reelVideoMedia(for: reelRepost(media: [.image(), video]))
        XCTAssertEqual(media?.id, video.id)
        XCTAssertEqual(media?.type, .video)
    }

    func test_reelVideoMedia_audioOnlyReel_isNil() {
        XCTAssertNil(ReelRepostEmbedCell.reelVideoMedia(for: reelRepost(media: [.audio(duration: 10)])),
                     "Audio-only reels keep the tinted music backdrop — no autoplay surface")
    }

    func test_reelVideoMedia_imageOnlyReel_isNil() {
        XCTAssertNil(ReelRepostEmbedCell.reelVideoMedia(for: reelRepost(media: [.image()])))
    }

    func test_reelVideoMedia_nonReelRepost_isNil() {
        XCTAssertNil(ReelRepostEmbedCell.reelVideoMedia(for: postRepost(media: [.video(duration: 3)])),
                     "A POST/STATUS repost is not a reel — primaryReelMedia is nil")
    }

    // MARK: - RF2 — cell identity election key (review correction)

    func test_reelCellId_isContainingPostId_notRepostedReelId() {
        let post = FeedPost(
            id: "outerPostB",
            author: "Alex",
            type: "POST",
            content: "republished a reel",
            repost: reelRepost(id: "reelX", media: [.video(duration: 9)])
        )
        let cell = ReelRepostEmbedCell(post: post)
        XCTAssertEqual(cell.reelCellId, "outerPostB",
                       "Election must key on the containing (reposter's) post id")
        XCTAssertNotEqual(cell.reelCellId, post.repost?.id,
                          "Keying on the reposted reel id would collide with the native reel card")
    }
}
