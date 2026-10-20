import Foundation
import Testing
@testable import MeeshySDK

struct OutgoingMessageWireTests {

    private func makeMessage(
        content: String = "Salut",
        relation: MessageRelation = .none,
        attachmentIds: [String]? = nil,
        previews: [MeeshyMessageAttachment]? = nil,
        originalLanguage: String? = nil,
        location: SharedPlace? = nil
    ) -> OutgoingMessage {
        OutgoingMessage(
            conversationId: ConversationID("c1"),
            content: content,
            relation: relation,
            attachments: OutgoingAttachments(ids: attachmentIds, previews: previews),
            originalLanguage: originalLanguage,
            location: location
        )
    }

    private func makeContext(intent: MessageProtectionIntent = .none) -> SendAttemptContext {
        SendAttemptContext(
            clientMessageId: MessageID("cid_1"),
            startedAt: Date(timeIntervalSince1970: 0),
            intent: intent,
            language: "fr",
            reusesExistingRow: false
        )
    }

    private func json(_ request: SendMessageRequest) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        return String(decoding: try encoder.encode(request), as: UTF8.self)
    }

    @Test func wireRequest_plainText_matchesGoldenJSON() throws {
        let request = makeMessage().wireRequest(
            content: "Salut", isEncrypted: false, encryptionMode: nil,
            context: makeContext(), wireEffectFlags: nil
        )

        #expect(try json(request) == #"{"clientMessageId":"cid_1","content":"Salut","originalLanguage":"fr"}"#)
    }

    @Test func wireRequest_reply_matchesGoldenJSON() throws {
        let relation = MessageRelation.reply(to: MessageID("m1"), citing: QuotedAttachmentSend(attachmentId: "a3"))
        let request = makeMessage(relation: relation, attachmentIds: ["a1"]).wireRequest(
            content: "Salut", isEncrypted: true, encryptionMode: "E2EE",
            context: makeContext(), wireEffectFlags: 4
        )

        let expected = SendMessageRequest(
            content: "Salut", originalLanguage: "fr", replyToId: "m1", attachmentIds: ["a1"],
            effectFlags: 4, isEncrypted: true, encryptionMode: "E2EE", clientMessageId: "cid_1",
            attachmentReplyTo: QuotedAttachmentSend(attachmentId: "a3")
        )
        #expect(try json(request) == json(expected))
    }

    @Test func wireRequest_locationAndForward_matchLegacyConstruction() throws {
        let place = SharedPlace(latitude: 48.85, longitude: 2.35)
        let relation = MessageRelation.forward(of: MessageID("m9"), from: ConversationID("c9"))
        let request = makeMessage(content: "", relation: relation, location: place).wireRequest(
            content: nil, isEncrypted: false, encryptionMode: nil,
            context: makeContext(), wireEffectFlags: nil
        )

        let expected = SendMessageRequest(
            content: nil, originalLanguage: "fr", forwardedFromId: "m9", forwardedFromConversationId: "c9",
            clientMessageId: "cid_1", location: place
        )
        #expect(try json(request) == json(expected))
    }

    @Test func wireRequest_viewOnceBlurEphemeral_flags() {
        let viewOnce = makeMessage().wireRequest(
            content: "x", isEncrypted: false, encryptionMode: nil,
            context: makeContext(intent: MessageProtectionIntent(isViewOnce: true, maxViewOnceCount: 2)),
            wireEffectFlags: nil
        )
        let blurEphemeral = makeMessage().wireRequest(
            content: "x", isEncrypted: false, encryptionMode: nil,
            context: makeContext(intent: MessageProtectionIntent(ephemeralDurationSeconds: 60, isBlurred: true)),
            wireEffectFlags: nil
        )
        let plain = makeMessage().wireRequest(
            content: "x", isEncrypted: false, encryptionMode: nil,
            context: makeContext(), wireEffectFlags: nil
        )

        #expect(viewOnce.isViewOnce == true)
        #expect(viewOnce.maxViewOnceCount == 2)
        #expect(blurEphemeral.isViewOnce == nil)
        #expect(blurEphemeral.isBlurred == true)
        #expect(blurEphemeral.ephemeralDuration == 60)
        #expect(blurEphemeral.expiresAt == nil)
        #expect(plain.isBlurred == nil)
        #expect(plain.isEncrypted == nil)
    }

    @Test func offlineQueueItem_carriesStoryAndForwardAndRawLanguage() {
        let story = makeMessage(relation: .storyReply(to: StoryID("s1"), reference: nil))
            .offlineQueueItem(clientMessageId: MessageID("cid_o"), intent: .none)
        let forward = makeMessage(relation: .forward(of: MessageID("m9"), from: ConversationID("c9")))
            .offlineQueueItem(clientMessageId: MessageID("cid_o"), intent: .none)

        #expect(story.storyReplyToId == "s1")
        #expect(story.clientMessageId == "cid_o")
        #expect(story.originalLanguage == nil)
        #expect(forward.forwardedFromId == "m9")
        #expect(forward.forwardedFromConversationId == "c9")
        #expect(forward.conversationId == "c1")
    }

    @Test func retryQueueItem_carriesStoryAndForward_resolvedLanguage() {
        let story = makeMessage(relation: .storyReply(to: StoryID("s1"), reference: nil))
            .retryQueueItem(context: makeContext())
        let forward = makeMessage(relation: .forward(of: MessageID("m9"), from: ConversationID("c9")))
            .retryQueueItem(context: makeContext())

        #expect(story.storyReplyToId == "s1")
        #expect(forward.forwardedFromId == "m9")
        #expect(forward.forwardedFromConversationId == "c9")
        #expect(story.originalLanguage == "fr")
        #expect(story.clientMessageId == "cid_1")
    }

    @Test func socketFallbackEligible_refusesAForward() {
        let forward = makeMessage(relation: .forward(of: MessageID("m9"), from: ConversationID("c9")))
        let story = makeMessage(relation: .storyReply(to: StoryID("s1"), reference: nil))

        #expect(!forward.socketFallbackEligible(intent: .none, hasPendingEffects: false))
        #expect(!forward.socketFirstEligible(connected: true, isEncrypted: false, intent: .none, hasPendingEffects: false))
        #expect(story.socketFallbackEligible(intent: .none, hasPendingEffects: false))
    }

    @Test func socketFirstEligible_falseForEachSpecialProperty() {
        let plain = makeMessage()
        let withIds = makeMessage(attachmentIds: ["a1"])
        let anchored = makeMessage(relation: .reply(to: MessageID("m1"), citing: QuotedAttachmentSend(attachmentId: "a3")))
        func eligible(_ message: OutgoingMessage, connected: Bool = true, encrypted: Bool = false,
                      intent: MessageProtectionIntent = .none, effects: Bool = false) -> Bool {
            message.socketFirstEligible(connected: connected, isEncrypted: encrypted, intent: intent, hasPendingEffects: effects)
        }

        #expect(eligible(plain))
        #expect(!eligible(plain, connected: false))
        #expect(!eligible(plain, encrypted: true))
        #expect(!eligible(withIds))
        #expect(!eligible(plain, intent: MessageProtectionIntent(ephemeralDurationSeconds: 60)))
        #expect(!eligible(plain, intent: MessageProtectionIntent(ephemeralAfterRead: true)))
        #expect(!eligible(plain, intent: MessageProtectionIntent(isViewOnce: true)))
        #expect(!eligible(plain, intent: MessageProtectionIntent(isBlurred: true)))
        #expect(!eligible(plain, effects: true))
        #expect(!eligible(anchored))
    }

    @Test func socketFallbackEligible_ignoresEncryptionAndAttachments_butRefusesAnchor() {
        let withIds = makeMessage(attachmentIds: ["a1"])
        let anchored = makeMessage(relation: .reply(to: MessageID("m1"), citing: QuotedAttachmentSend(attachmentId: "a3")))

        #expect(withIds.socketFallbackEligible(intent: .none, hasPendingEffects: false))
        #expect(!anchored.socketFallbackEligible(intent: .none, hasPendingEffects: false))
        #expect(!withIds.socketFallbackEligible(intent: MessageProtectionIntent(isViewOnce: true), hasPendingEffects: false))
        #expect(!withIds.socketFallbackEligible(intent: .none, hasPendingEffects: true))
    }

    @Test func optimisticMessageType_followsFirstPreview() {
        let image = MeeshyMessageAttachment(id: "p1", mimeType: "image/png")
        let audio = MeeshyMessageAttachment(id: "p2", mimeType: "audio/m4a")

        #expect(makeMessage().optimisticMessageType == .text)
        #expect(makeMessage(previews: [image, audio]).optimisticMessageType == .image)
        #expect(makeMessage(previews: [audio]).optimisticMessageType == .audio)
    }

    @Test func attachmentKinds_alignWithPreviews() {
        let image = MeeshyMessageAttachment(id: "p1", mimeType: "image/png")
        let video = MeeshyMessageAttachment(id: "p2", mimeType: "video/mp4")

        #expect(makeMessage().attachmentKinds == nil)
        #expect(makeMessage(previews: [image, video]).attachmentKinds == [image.kind.rawValue, video.kind.rawValue])
    }
}
