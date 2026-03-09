import XCTest
@testable import MeeshySDK

final class MessageModelsTests: XCTestCase {

    // MARK: - MeeshyMessage

    func testMessageInitDefaults() {
        let msg = MeeshyMessage(conversationId: "conv1", content: "Hello")
        XCTAssertEqual(msg.conversationId, "conv1")
        XCTAssertEqual(msg.content, "Hello")
        XCTAssertEqual(msg.messageType, .text)
        XCTAssertEqual(msg.messageSource, .user)
        XCTAssertEqual(msg.deliveryStatus, .sent)
        XCTAssertEqual(msg.originalLanguage, "fr")
        XCTAssertFalse(msg.isEdited)
        XCTAssertFalse(msg.isDeleted)
        XCTAssertFalse(msg.isViewOnce)
        XCTAssertFalse(msg.isBlurred)
        XCTAssertFalse(msg.isEncrypted)
        XCTAssertFalse(msg.isMe)
        XCTAssertTrue(msg.attachments.isEmpty)
        XCTAssertTrue(msg.reactions.isEmpty)
        XCTAssertNil(msg.replyTo)
        XCTAssertNil(msg.forwardedFrom)
    }

    func testMessageTextComputedProperty() {
        let msg = MeeshyMessage(conversationId: "c", content: "Bonjour")
        XCTAssertEqual(msg.text, "Bonjour")
        XCTAssertEqual(msg.text, msg.content)
    }

    func testMessageTimestampComputedProperty() {
        let now = Date()
        let msg = MeeshyMessage(conversationId: "c", content: "Hi", createdAt: now)
        XCTAssertEqual(msg.timestamp, now)
        XCTAssertEqual(msg.timestamp, msg.createdAt)
    }

    func testMessageTypeAllCases() {
        let cases = MeeshyMessage.MessageType.allCases
        XCTAssertEqual(cases.count, 6)
        XCTAssertTrue(cases.contains(.text))
        XCTAssertTrue(cases.contains(.image))
        XCTAssertTrue(cases.contains(.file))
        XCTAssertTrue(cases.contains(.audio))
        XCTAssertTrue(cases.contains(.video))
        XCTAssertTrue(cases.contains(.location))
    }

    func testMessageSourceAllCases() {
        let cases = MeeshyMessage.MessageSource.allCases
        XCTAssertEqual(cases.count, 6)
        XCTAssertTrue(cases.contains(.user))
        XCTAssertTrue(cases.contains(.system))
        XCTAssertTrue(cases.contains(.ads))
        XCTAssertTrue(cases.contains(.app))
        XCTAssertTrue(cases.contains(.agent))
        XCTAssertTrue(cases.contains(.authority))
    }

    func testDeliveryStatusRawValues() {
        XCTAssertEqual(MeeshyMessage.DeliveryStatus.sending.rawValue, "sending")
        XCTAssertEqual(MeeshyMessage.DeliveryStatus.sent.rawValue, "sent")
        XCTAssertEqual(MeeshyMessage.DeliveryStatus.delivered.rawValue, "delivered")
        XCTAssertEqual(MeeshyMessage.DeliveryStatus.read.rawValue, "read")
        XCTAssertEqual(MeeshyMessage.DeliveryStatus.failed.rawValue, "failed")
    }

    func testMessageIsEphemeralActive() {
        let futureDate = Date().addingTimeInterval(3600)
        let ephemeral = MeeshyMessage(conversationId: "c", content: "temp", expiresAt: futureDate)
        XCTAssertTrue(ephemeral.isEphemeralActive)

        let pastDate = Date().addingTimeInterval(-3600)
        let expired = MeeshyMessage(conversationId: "c", content: "temp", expiresAt: pastDate)
        XCTAssertFalse(expired.isEphemeralActive)

        let noExpiry = MeeshyMessage(conversationId: "c", content: "normal")
        XCTAssertFalse(noExpiry.isEphemeralActive)
    }

    // MARK: - MeeshyMessageAttachment

    func testAttachmentInitDefaults() {
        let att = MeeshyMessageAttachment()
        XCTAssertEqual(att.fileName, "")
        XCTAssertEqual(att.originalName, "")
        XCTAssertEqual(att.mimeType, "application/octet-stream")
        XCTAssertEqual(att.fileSize, 0)
        XCTAssertEqual(att.fileUrl, "")
        XCTAssertEqual(att.thumbnailColor, "4ECDC4")
        XCTAssertNil(att.width)
        XCTAssertNil(att.height)
        XCTAssertNil(att.duration)
        XCTAssertFalse(att.isForwarded)
        XCTAssertFalse(att.isViewOnce)
        XCTAssertFalse(att.isBlurred)
    }

    func testAttachmentTypeFromMimeType() {
        XCTAssertEqual(MeeshyMessageAttachment(mimeType: "image/jpeg").type, .image)
        XCTAssertEqual(MeeshyMessageAttachment(mimeType: "image/png").type, .image)
        XCTAssertEqual(MeeshyMessageAttachment(mimeType: "video/mp4").type, .video)
        XCTAssertEqual(MeeshyMessageAttachment(mimeType: "audio/mpeg").type, .audio)
        XCTAssertEqual(MeeshyMessageAttachment(mimeType: "application/pdf").type, .file)
        XCTAssertEqual(MeeshyMessageAttachment(mimeType: "application/x-location").type, .location)
        XCTAssertEqual(MeeshyMessageAttachment(mimeType: "application/octet-stream").type, .file)
    }

    func testAttachmentFileSizeFormatted() {
        let small = MeeshyMessageAttachment(fileSize: 512)
        XCTAssertEqual(small.fileSizeFormatted, "0.5 KB")

        let medium = MeeshyMessageAttachment(fileSize: 1024 * 500)
        XCTAssertEqual(medium.fileSizeFormatted, "500.0 KB")

        let large = MeeshyMessageAttachment(fileSize: 1024 * 1024 * 2)
        XCTAssertEqual(large.fileSizeFormatted, "2.0 MB")
    }

    func testAttachmentDurationFormatted() {
        let att = MeeshyMessageAttachment(duration: 125000)
        XCTAssertEqual(att.durationFormatted, "2:05")

        let noDuration = MeeshyMessageAttachment()
        XCTAssertNil(noDuration.durationFormatted)

        let short = MeeshyMessageAttachment(duration: 5000)
        XCTAssertEqual(short.durationFormatted, "0:05")
    }

    func testAttachmentStaticFactoryImage() {
        let att = MeeshyMessageAttachment.image()
        XCTAssertEqual(att.mimeType, "image/jpeg")
        XCTAssertEqual(att.type, .image)
        XCTAssertEqual(att.thumbnailColor, "4ECDC4")
    }

    func testAttachmentStaticFactoryVideo() {
        let att = MeeshyMessageAttachment.video(durationMs: 60000)
        XCTAssertEqual(att.mimeType, "video/mp4")
        XCTAssertEqual(att.type, .video)
        XCTAssertEqual(att.duration, 60000)
        XCTAssertEqual(att.thumbnailColor, "FF6B6B")
    }

    func testAttachmentStaticFactoryAudio() {
        let att = MeeshyMessageAttachment.audio(durationMs: 30000)
        XCTAssertEqual(att.mimeType, "audio/mpeg")
        XCTAssertEqual(att.type, .audio)
        XCTAssertEqual(att.duration, 30000)
        XCTAssertEqual(att.thumbnailColor, "9B59B6")
    }

    func testAttachmentStaticFactoryFile() {
        let att = MeeshyMessageAttachment.file(name: "doc.pdf", size: 2048)
        XCTAssertEqual(att.mimeType, "application/octet-stream")
        XCTAssertEqual(att.type, .file)
        XCTAssertEqual(att.originalName, "doc.pdf")
        XCTAssertEqual(att.fileSize, 2048)
        XCTAssertEqual(att.thumbnailColor, "F8B500")
    }

    func testAttachmentStaticFactoryLocation() {
        let att = MeeshyMessageAttachment.location(latitude: 48.8566, longitude: 2.3522)
        XCTAssertEqual(att.mimeType, "application/x-location")
        XCTAssertEqual(att.type, .location)
        XCTAssertEqual(att.latitude, 48.8566)
        XCTAssertEqual(att.longitude, 2.3522)
        XCTAssertEqual(att.thumbnailColor, "2ECC71")
    }

    // MARK: - ReplyReference

    func testReplyReferenceInit() {
        let ref = ReplyReference(messageId: "m1", authorName: "Alice", previewText: "Hey there")
        XCTAssertEqual(ref.messageId, "m1")
        XCTAssertEqual(ref.authorName, "Alice")
        XCTAssertEqual(ref.previewText, "Hey there")
        XCTAssertFalse(ref.isMe)
        XCTAssertFalse(ref.isStoryReply)
        XCTAssertNil(ref.attachmentType)
        XCTAssertNil(ref.attachmentThumbnailUrl)
    }

    func testReplyReferenceCodableRoundtrip() throws {
        let original = ReplyReference(
            messageId: "m2", authorName: "Bob", previewText: "Sure!",
            isMe: true, attachmentType: "image/png", attachmentThumbnailUrl: "https://example.com/thumb.png"
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: data)
        XCTAssertEqual(decoded.messageId, original.messageId)
        XCTAssertEqual(decoded.authorName, original.authorName)
        XCTAssertEqual(decoded.previewText, original.previewText)
        XCTAssertTrue(decoded.isMe)
        XCTAssertEqual(decoded.attachmentType, "image/png")
        XCTAssertEqual(decoded.attachmentThumbnailUrl, "https://example.com/thumb.png")
        XCTAssertFalse(decoded.isStoryReply)
    }

    // MARK: - ForwardReference

    func testForwardReferenceInit() {
        let ref = ForwardReference(senderName: "Charlie", previewText: "Forwarded message")
        XCTAssertEqual(ref.originalMessageId, "")
        XCTAssertEqual(ref.senderName, "Charlie")
        XCTAssertEqual(ref.previewText, "Forwarded message")
        XCTAssertNil(ref.senderAvatar)
        XCTAssertNil(ref.conversationId)
        XCTAssertNil(ref.conversationName)
    }

    func testForwardReferenceCodableRoundtrip() throws {
        let original = ForwardReference(
            originalMessageId: "fm1", senderName: "Diana", senderAvatar: "avatar.jpg",
            previewText: "Check this", conversationId: "conv5", conversationName: "Design Team",
            attachmentType: "video/mp4", attachmentThumbnailUrl: "https://example.com/vid.jpg"
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ForwardReference.self, from: data)
        XCTAssertEqual(decoded.originalMessageId, "fm1")
        XCTAssertEqual(decoded.senderName, "Diana")
        XCTAssertEqual(decoded.senderAvatar, "avatar.jpg")
        XCTAssertEqual(decoded.previewText, "Check this")
        XCTAssertEqual(decoded.conversationId, "conv5")
        XCTAssertEqual(decoded.conversationName, "Design Team")
        XCTAssertEqual(decoded.attachmentType, "video/mp4")
    }

    // MARK: - MeeshyReaction

    func testReactionInitDefaults() {
        let reaction = MeeshyReaction(messageId: "m1", emoji: "heart")
        XCTAssertEqual(reaction.messageId, "m1")
        XCTAssertEqual(reaction.emoji, "heart")
        XCTAssertNil(reaction.participantId)
    }

    func testReactionInitWithParticipantId() {
        let reaction = MeeshyReaction(messageId: "m2", participantId: "u1", emoji: "thumbsup")
        XCTAssertEqual(reaction.participantId, "u1")
        XCTAssertEqual(reaction.emoji, "thumbsup")
    }

    // MARK: - MeeshyReactionSummary

    func testReactionSummaryInit() {
        let summary = MeeshyReactionSummary(emoji: "fire", count: 5)
        XCTAssertEqual(summary.emoji, "fire")
        XCTAssertEqual(summary.count, 5)
        XCTAssertFalse(summary.includesMe)
    }

    func testReactionSummaryIncludesMe() {
        let summary = MeeshyReactionSummary(emoji: "heart", count: 3, includesMe: true)
        XCTAssertTrue(summary.includesMe)
    }

    // MARK: - EphemeralDuration

    func testEphemeralDurationRawValues() {
        XCTAssertEqual(EphemeralDuration.thirtySeconds.rawValue, 30)
        XCTAssertEqual(EphemeralDuration.oneMinute.rawValue, 60)
        XCTAssertEqual(EphemeralDuration.fiveMinutes.rawValue, 300)
        XCTAssertEqual(EphemeralDuration.oneHour.rawValue, 3600)
        XCTAssertEqual(EphemeralDuration.twentyFourHours.rawValue, 86400)
    }

    func testEphemeralDurationAllCasesCount() {
        XCTAssertEqual(EphemeralDuration.allCases.count, 5)
    }

    func testEphemeralDurationLabels() {
        XCTAssertEqual(EphemeralDuration.thirtySeconds.label, "30s")
        XCTAssertEqual(EphemeralDuration.oneMinute.label, "1min")
        XCTAssertEqual(EphemeralDuration.fiveMinutes.label, "5min")
        XCTAssertEqual(EphemeralDuration.oneHour.label, "1h")
        XCTAssertEqual(EphemeralDuration.twentyFourHours.label, "24h")
    }

    func testEphemeralDurationDisplayLabels() {
        XCTAssertEqual(EphemeralDuration.thirtySeconds.displayLabel, "30 secondes")
        XCTAssertEqual(EphemeralDuration.oneMinute.displayLabel, "1 minute")
        XCTAssertEqual(EphemeralDuration.fiveMinutes.displayLabel, "5 minutes")
        XCTAssertEqual(EphemeralDuration.oneHour.displayLabel, "1 heure")
        XCTAssertEqual(EphemeralDuration.twentyFourHours.displayLabel, "24 heures")
    }

    // MARK: - SharedContact

    func testSharedContactInit() {
        let contact = SharedContact(fullName: "Jean Dupont", phoneNumbers: ["+33612345678"], emails: ["jean@example.com"])
        XCTAssertEqual(contact.fullName, "Jean Dupont")
        XCTAssertEqual(contact.phoneNumbers, ["+33612345678"])
        XCTAssertEqual(contact.emails, ["jean@example.com"])
    }

    func testSharedContactCodableRoundtrip() throws {
        let original = SharedContact(id: "sc1", fullName: "Marie Martin", phoneNumbers: ["+33698765432"], emails: [])
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(SharedContact.self, from: data)
        XCTAssertEqual(decoded.id, "sc1")
        XCTAssertEqual(decoded.fullName, "Marie Martin")
        XCTAssertEqual(decoded.phoneNumbers, ["+33698765432"])
        XCTAssertTrue(decoded.emails.isEmpty)
    }

    func testSharedContactDefaultEmptyArrays() {
        let contact = SharedContact(fullName: "Solo Name")
        XCTAssertTrue(contact.phoneNumbers.isEmpty)
        XCTAssertTrue(contact.emails.isEmpty)
    }
}
