import XCTest
import MeeshySDK
@testable import Meeshy

/// `AudioFullscreenSource.queuedAudio(urlString:)` maps a fullscreen source
/// (conversation OR standalone feed/comment/post/reel) into the `QueuedAudio`
/// the shared `ConversationAudioCoordinator` needs to keep the mini-player +
/// Now Playing card + queue alive once the fullscreen page hands playback
/// off to it. Conversation-context fields fall back to the attachment id /
/// empty string for standalone surfaces, which never carry a `messageId` or
/// `conversationId`.
@MainActor
final class AudioFullscreenSourceQueueTests: XCTestCase {

    func test_queuedAudio_mapsSourceFields() {
        let att = MessageAttachment(
            id: "att-9", fileName: "a.m4a", originalName: "a.m4a",
            mimeType: "audio/m4a", fileSize: 100, fileUrl: "https://x/original.m4a",
            width: nil, height: nil, duration: 4200
        )
        let created = Date(timeIntervalSince1970: 1_754_000_000)
        let source = AudioFullscreenSource(
            id: att.id, attachment: att, transcription: nil, translatedAudios: [],
            originalLanguage: "fr", caption: "", author: ProfileSheetUser(
                userId: "u1", username: "ashley", displayName: "Ashley",
                avatarURL: nil, accentColor: "#6366F1"
            ),
            createdAt: created, messageId: "msg-1", conversationId: "conv-1"
        )

        let queued = source.queuedAudio(urlString: "https://x/es.m4a")

        XCTAssertEqual(queued.attachmentId, "att-9")
        XCTAssertEqual(queued.messageId, "msg-1")
        XCTAssertEqual(queued.conversationId, "conv-1")
        XCTAssertEqual(queued.fileUrl, "https://x/es.m4a")
        XCTAssertEqual(queued.durationMs, 4200)
        XCTAssertEqual(queued.senderName, "Ashley")
        XCTAssertEqual(queued.receivedAt, created)
    }

    func test_queuedAudio_standaloneSource_fallsBackToAttachmentIds() {
        let att = MessageAttachment(
            id: "att-7", fileName: "f.m4a", originalName: "f.m4a",
            mimeType: "audio/m4a", fileSize: 100, fileUrl: "https://x/feed.m4a",
            width: nil, height: nil, duration: nil
        )
        let source = AudioFullscreenSource(
            id: att.id, attachment: att, transcription: nil, translatedAudios: [],
            originalLanguage: "fr", caption: "", author: ProfileSheetUser(
                userId: "u1", username: "ashley", displayName: nil,
                avatarURL: nil, accentColor: "#6366F1"
            ),
            createdAt: Date()
        )

        let queued = source.queuedAudio(urlString: att.fileUrl)

        XCTAssertEqual(queued.messageId, "att-7")
        XCTAssertEqual(queued.conversationId, "")
        XCTAssertEqual(queued.durationMs, 0)
        XCTAssertEqual(queued.senderName, "ashley")
    }

    // MARK: - F2: `.fromFeed` carrier-entity id propagation
    //
    // `CommentMediaView` / `FeedPostCard+Media` / `PostDetailView` play the
    // SAME attachment through two routes: an inline `CoordinatedAudioPlayer`
    // whose `QueuedAudio.conversationId` is set to the carrier entity's id
    // (commentId / post.id / repost.id — see `ConversationAudioCoordinator`
    // "same session" matching in `AudioFullscreenView.playThroughCoordinator`),
    // and the `.fromFeed`-built `AudioFullscreenSource` behind the "expand"
    // button. Both routes MUST agree on that id — else opening fullscreen for
    // a second audio item under the same entity looks like a different
    // session to the coordinator and needlessly resets the queue/Now Playing
    // card, breaking the invariant documented on `AudioFullscreenSource.conversationId`.

    func test_fromFeed_wiresCarrierEntityConversationId() {
        let media = FeedMedia.audio(duration: 3000)
        let author = ProfileSheetUser(
            userId: "u1", username: "ashley", displayName: "Ashley",
            avatarURL: nil, accentColor: "#6366F1"
        )

        let source = AudioFullscreenSource.fromFeed(
            media: media, author: author, originalLanguage: "fr",
            caption: "", createdAt: Date(), conversationId: "post-123"
        )

        XCTAssertEqual(source.conversationId, "post-123",
            "Le plein écran d'un post/commentaire doit porter l'id de l'entité porteuse, pas rester vide")
        XCTAssertEqual(source.queuedAudio(urlString: media.url ?? "").conversationId, "post-123",
            "L'id porteur doit survivre jusqu'au QueuedAudio consommé par le coordinator")
    }

    /// Sans id porteur explicite (surface réellement standalone, ex. réels
    /// non wirés à ce jour), `.fromFeed` garde le repli existant : aucune
    /// session à faire correspondre côté coordinator.
    func test_fromFeed_noConversationId_defaultsToNil() {
        let media = FeedMedia.audio(duration: 3000)
        let author = ProfileSheetUser(
            userId: "u1", username: "ashley", displayName: "Ashley",
            avatarURL: nil, accentColor: "#6366F1"
        )

        let source = AudioFullscreenSource.fromFeed(
            media: media, author: author, originalLanguage: "fr",
            caption: "", createdAt: Date()
        )

        XCTAssertNil(source.conversationId)
    }
}
