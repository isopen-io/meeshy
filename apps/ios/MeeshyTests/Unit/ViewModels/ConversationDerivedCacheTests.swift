import XCTest
@testable import Meeshy
import MeeshySDK

@MainActor
final class ConversationDerivedCacheTests: XCTestCase {

    private func makeMessage(_ id: String, attachments: [MeeshyMessageAttachment] = []) -> Message {
        Message(
            id: id,
            conversationId: "000000000000000000000081",
            senderId: "u1",
            content: "texte",
            createdAt: Date(timeIntervalSince1970: 100),
            updatedAt: Date(timeIntervalSince1970: 100),
            attachments: attachments,
            deliveryStatus: .sent,
            isMe: false
        )
    }

    private func makeAttachment(_ id: String, url: String) -> MeeshyMessageAttachment {
        MeeshyMessageAttachment(id: id, mimeType: "image/png", fileUrl: url)
    }

    private func fillEveryMemo(_ cache: ConversationDerivedCache) {
        cache.messageIdIndex = [:]
        cache.lastReceivedIndex = .resolved(1)
        cache.lastSentIndex = .resolved(2)
        cache.mediaSenderInfoMap = [:]
        cache.allVisualAttachments = []
        cache.allAudioItems = []
        cache.audioItemsByMessageId = [:]
        cache.mediaCaptionMap = [:]
        cache.mentionDisplayNames = [:]
        cache.mentionCandidates = []
        cache.topActiveMembers = []
    }

    func test_sameStructure_keepsMentionCandidates() {
        let cache = ConversationDerivedCache()
        let messages = [makeMessage("a"), makeMessage("b")]
        fillEveryMemo(cache)

        cache.invalidate(previous: messages, current: messages)

        XCTAssertNotNil(cache.mentionCandidates)
        XCTAssertNotNil(cache.mentionDisplayNames)
        XCTAssertNotNil(cache.topActiveMembers)
        XCTAssertNotNil(cache.mediaSenderInfoMap)
        XCTAssertNil(cache.messageIdIndex)
        XCTAssertEqual(cache.lastReceivedIndex, .uncomputed)
        XCTAssertEqual(cache.lastSentIndex, .uncomputed)
    }

    func test_countChange_dropsEveryMemo() {
        let cache = ConversationDerivedCache()
        fillEveryMemo(cache)

        cache.invalidate(previous: [makeMessage("a")], current: [makeMessage("a"), makeMessage("b")])

        XCTAssertNil(cache.mentionCandidates)
        XCTAssertNil(cache.mentionDisplayNames)
        XCTAssertNil(cache.topActiveMembers)
        XCTAssertNil(cache.mediaSenderInfoMap)
        XCTAssertNil(cache.allVisualAttachments)
        XCTAssertNil(cache.allAudioItems)
        XCTAssertNil(cache.mediaCaptionMap)
    }

    func test_firstInvalidationWithoutPrevious_isStructural() {
        let cache = ConversationDerivedCache()
        fillEveryMemo(cache)

        cache.invalidate(previous: nil, current: [makeMessage("a")])

        XCTAssertNil(cache.mentionCandidates)
        XCTAssertNil(cache.allVisualAttachments)
    }

    func test_attachmentIdentityChange_invalidatesMediaMaps() {
        let cache = ConversationDerivedCache()
        let before = [makeMessage("a", attachments: [makeAttachment("x", url: "local://x")])]
        let after = [makeMessage("a", attachments: [makeAttachment("x", url: "https://cdn/x")])]
        fillEveryMemo(cache)

        cache.invalidate(previous: before, current: after)

        XCTAssertNil(cache.mediaSenderInfoMap)
        XCTAssertNil(cache.allVisualAttachments)
        XCTAssertNil(cache.allAudioItems)
        XCTAssertNil(cache.mediaCaptionMap)
        XCTAssertNotNil(cache.mentionCandidates)
    }

    func test_translationChange_invalidatesCaptionMapOnly() {
        let cache = ConversationDerivedCache()
        fillEveryMemo(cache)

        cache.invalidateTranslationDerived()

        XCTAssertNil(cache.mediaCaptionMap)
        XCTAssertNotNil(cache.allAudioItems)
        XCTAssertNotNil(cache.allVisualAttachments)
        XCTAssertNotNil(cache.mentionCandidates)
    }

    func test_audioChange_dropsTheAudioItemsAndTheirPerMessageIndex() {
        let cache = ConversationDerivedCache()
        fillEveryMemo(cache)

        cache.invalidateAudioDerived()

        XCTAssertNil(cache.allAudioItems)
        XCTAssertNil(cache.audioItemsByMessageId)
        XCTAssertNotNil(cache.mediaCaptionMap)
    }

    func test_visualAttachmentsInvalidation_touchesNothingElse() {
        let cache = ConversationDerivedCache()
        fillEveryMemo(cache)

        cache.invalidateVisualAttachments()

        XCTAssertNil(cache.allVisualAttachments)
        XCTAssertNotNil(cache.allAudioItems)
    }

    func test_sameAttachmentIdentities_comparesPiecesByIdAndAddress() {
        let one = [makeMessage("a", attachments: [makeAttachment("x", url: "u1")])]
        let sameAddress = [makeMessage("a", attachments: [makeAttachment("x", url: "u1")])]
        let otherAddress = [makeMessage("a", attachments: [makeAttachment("x", url: "u2")])]

        XCTAssertTrue(ConversationDerivedCache.sameAttachmentIdentities(one, sameAddress))
        XCTAssertFalse(ConversationDerivedCache.sameAttachmentIdentities(one, otherAddress))
        XCTAssertFalse(ConversationDerivedCache.sameAttachmentIdentities(one, []))
    }
}
