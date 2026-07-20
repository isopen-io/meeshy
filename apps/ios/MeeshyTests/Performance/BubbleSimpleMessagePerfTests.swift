// apps/ios/MeeshyTests/Performance/BubbleSimpleMessagePerfTests.swift
//
// Performance baseline for a simple "Salut" bubble — the test the bubble
// decomposition refactor was designed to make fast. Measures BubbleContent
// construction (the hot path on cell scroll) for 1000 simple messages.
//
// XCTest performance tests pass on first run by recording a baseline. Subsequent
// runs flag regressions if the timing exceeds the recorded baseline by 10%+.

import XCTest
import MeeshySDK
@testable import Meeshy

@MainActor
final class BubbleSimpleMessagePerfTests: XCTestCase {

    func test_simpleHelloMessage_construction_isFast() {
        let messages = (0..<1000).map { i in
            makeMessage(id: "m\(i)", content: "Salut")
        }

        measure {
            for msg in messages {
                _ = BubbleContent(
                    message: msg,
                    translations: [],
                    preferredTranslation: nil,
                    currentUserId: "u1"
                )
            }
        }
    }

    // MARK: - Helpers

    /// Mirrors `BubbleContentMatrixTests.makeMessage` — kept local so the perf
    /// test stays standalone and doesn't accidentally pick up future changes
    /// to that helper which could skew the baseline.
    private func makeMessage(
        id: String = "m1",
        content: String,
        senderId: String = "u1",
        isMe: Bool = false
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: id,
            conversationId: "c1",
            senderId: senderId,
            content: content,
            originalLanguage: "fr",
            messageType: .text,
            messageSource: .user,
            isEdited: false,
            editedAt: nil,
            deletedAt: nil,
            replyToId: nil,
            storyReplyToId: nil,
            forwardedFromId: nil,
            forwardedFromConversationId: nil,
            expiresAt: nil,
            effects: MessageEffects(flags: []),
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            pinnedAt: nil,
            pinnedBy: nil,
            isEncrypted: false,
            encryptionMode: nil,
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0),
            attachments: [],
            reactions: [],
            replyTo: nil,
            forwardedFrom: nil,
            senderName: "Tester",
            senderUsername: "tester",
            senderColor: "#888",
            senderAvatarURL: nil,
            senderUserId: senderId,
            deliveryStatus: .sent,
            isMe: isMe,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            deliveredCount: 0,
            readCount: 0,
            cachedTimeString: "12:34"
        )
    }
}
