import XCTest
import SwiftUI
import MeeshySDK
@testable import Meeshy

/// Wrapper-level Equatable coverage for `ThemedMessageBubble`.
///
/// The wrapper Equatable gates body re-evaluation: when it returns `true`,
/// SwiftUI skips body and the granular sub-view Equatables never fire. This
/// suite locks in the fields that must invalidate the wrapper because they
/// can change WITHOUT the server bumping `message.updatedAt`:
///   - sender state (presence, mood, story ring) — pushed live
///   - group context (isLastInGroup, showAvatar, isDirect) — recomputed by parent
///   - user-level prefs (userLanguages, activeAudioLanguage) — settings flips
///   - effects flags + reaction identity (emoji swap with same count)
///
/// `BubbleEquatableTests` covers the granular sub-views; this file covers the
/// outer gate.
@MainActor
final class ThemedMessageBubbleEquatableTests: XCTestCase {

    // MARK: - Identical inputs

    func test_identicalInputs_areEqual() {
        let a = makeBubble()
        let b = makeBubble()
        XCTAssertEqual(a, b)
    }

    // MARK: - Sender state (server pushes without bumping message.updatedAt)

    func test_presenceStateChange_invalidates() {
        let a = makeBubble(presenceState: .offline)
        let b = makeBubble(presenceState: .online)
        XCTAssertNotEqual(a, b)
    }

    func test_senderMoodEmojiChange_invalidates() {
        let a = makeBubble(senderMoodEmoji: nil)
        let b = makeBubble(senderMoodEmoji: "🔥")
        XCTAssertNotEqual(a, b)
    }

    func test_senderStoryRingStateChange_invalidates() {
        let a = makeBubble(senderStoryRingState: .none)
        let b = makeBubble(senderStoryRingState: .unread)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Group state (recomputed by parent on neighbor changes)

    func test_isLastInGroupChange_invalidates() {
        let a = makeBubble(isLastInGroup: false)
        let b = makeBubble(isLastInGroup: true)
        XCTAssertNotEqual(a, b)
    }

    func test_showAvatarChange_invalidates() {
        let a = makeBubble(showAvatar: true)
        let b = makeBubble(showAvatar: false)
        XCTAssertNotEqual(a, b)
    }

    func test_isDirectChange_invalidates() {
        let a = makeBubble(isDirect: false)
        let b = makeBubble(isDirect: true)
        XCTAssertNotEqual(a, b)
    }

    // MARK: - User-level prefs (settings flips that don't touch the message)

    func test_userLanguagesRegionalChange_invalidates() {
        let a = makeBubble(userLanguages: (regional: "en", custom: nil))
        let b = makeBubble(userLanguages: (regional: "es", custom: nil))
        XCTAssertNotEqual(a, b)
    }

    func test_userLanguagesCustomChange_invalidates() {
        let a = makeBubble(userLanguages: (regional: "en", custom: nil))
        let b = makeBubble(userLanguages: (regional: "en", custom: "de"))
        XCTAssertNotEqual(a, b)
    }

    func test_activeAudioLanguageChange_invalidates() {
        let a = makeBubble(activeAudioLanguage: "fr")
        let b = makeBubble(activeAudioLanguage: "en")
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Effects + reaction identity

    func test_effectsFlagChange_invalidates() {
        let a = makeBubble(effects: MessageEffects(flags: []))
        let b = makeBubble(effects: MessageEffects(flags: [.glow]))
        XCTAssertNotEqual(a, b)
    }

    /// Same count, different emoji — count-based comparison would miss this.
    func test_reactionEmojiSwap_sameCount_invalidates() {
        let a = makeBubble(reactions: [makeReaction(emoji: "👍", participantId: "u1")])
        let b = makeBubble(reactions: [makeReaction(emoji: "❤️", participantId: "u1")])
        XCTAssertNotEqual(a, b)
    }

    /// Same emoji, different participants (e.g. user A removes, user B adds the
    /// same emoji) — count-based comparison would miss this too.
    func test_reactionParticipantSwap_sameEmoji_invalidates() {
        let a = makeBubble(reactions: [makeReaction(emoji: "👍", participantId: "u1")])
        let b = makeBubble(reactions: [makeReaction(emoji: "👍", participantId: "u2")])
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Sanity: existing fields still gate

    func test_messageUpdatedAtBump_invalidates() {
        let a = makeBubble(updatedAt: Date(timeIntervalSince1970: 100))
        let b = makeBubble(updatedAt: Date(timeIntervalSince1970: 200))
        XCTAssertNotEqual(a, b)
    }

    // MARK: - Edge: callbacks differ but rendering inputs identical → equal

    func test_callbacksDiffer_stillEqual() {
        var a = makeBubble()
        var b = makeBubble()
        a.onAddReaction = { _ in }
        b.onAddReaction = nil
        XCTAssertEqual(a, b)
    }

    // MARK: - Helpers

    private func makeBubble(
        updatedAt: Date = Date(timeIntervalSince1970: 0),
        isDirect: Bool = false,
        presenceState: PresenceState = .offline,
        senderMoodEmoji: String? = nil,
        senderStoryRingState: StoryRingState = .none,
        isLastInGroup: Bool = true,
        showAvatar: Bool = true,
        userLanguages: (regional: String?, custom: String?) = (nil, nil),
        activeAudioLanguage: String? = nil,
        effects: MessageEffects = .none,
        reactions: [MeeshyReaction] = []
    ) -> ThemedMessageBubble {
        let message = makeMessage(updatedAt: updatedAt, effects: effects, reactions: reactions)
        return ThemedMessageBubble(
            message: message,
            contactColor: "FF0000",
            isDirect: isDirect,
            isDark: false,
            showAvatar: showAvatar,
            presenceState: presenceState,
            senderMoodEmoji: senderMoodEmoji,
            senderStoryRingState: senderStoryRingState,
            activeAudioLanguage: activeAudioLanguage,
            isLastInGroup: isLastInGroup,
            isLastReceivedMessage: false,
            mentionDisplayNames: [:],
            highlightSearchTerm: nil,
            isEditSaving: false,
            hasEditHistory: false,
            currentUserId: "",
            userLanguages: userLanguages
        )
    }

    private func makeMessage(
        updatedAt: Date,
        effects: MessageEffects,
        reactions: [MeeshyReaction]
    ) -> MeeshyMessage {
        MeeshyMessage(
            id: "m1",
            conversationId: "c1",
            senderId: "u1",
            content: "Hello",
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
            effects: effects,
            maxViewOnceCount: nil,
            viewOnceCount: 0,
            pinnedAt: nil,
            pinnedBy: nil,
            isEncrypted: false,
            encryptionMode: nil,
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: updatedAt,
            attachments: [],
            reactions: reactions,
            replyTo: nil,
            forwardedFrom: nil,
            senderName: "Tester",
            senderUsername: "tester",
            senderColor: "#888",
            senderAvatarURL: nil,
            senderUserId: "u1",
            deliveryStatus: .sent,
            isMe: false,
            deliveredToAllAt: nil,
            readByAllAt: nil,
            deliveredCount: 0,
            readCount: 0,
            cachedTimeString: "12:34"
        )
    }

    private func makeReaction(emoji: String, participantId: String) -> MeeshyReaction {
        MeeshyReaction(
            id: UUID().uuidString,
            messageId: "m1",
            participantId: participantId,
            emoji: emoji,
            createdAt: Date(timeIntervalSince1970: 0),
            updatedAt: Date(timeIntervalSince1970: 0)
        )
    }
}
