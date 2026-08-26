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
        XCTAssertEqual(att.mimeType, "audio/mp4")
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

    // MARK: - ReplyReference : la PROTECTION du media cite

    /// La vignette d'une piece jointe voyage SANS CONDITION depuis la
    /// passerelle ; la protection est ce qui decide de la rendre. Sans elle sur
    /// la citation, la reponse a une video a VUE UNIQUE affichait sa vignette
    /// non floutee a tout le fil, sous un bouton play que le verrou de l'hote
    /// refusait d'honorer.
    func test_replyReference_carriesTheProtectionOfTheQuotedAttachment() {
        let unprotected = ReplyReference(
            messageId: "m1", authorName: "Alice", previewText: "",
            attachmentType: "video/mp4", attachmentThumbnailUrl: "https://x/t.jpg",
            attachmentIsProtected: false
        )
        let protected = ReplyReference(
            messageId: "m1", authorName: "Alice", previewText: "",
            attachmentType: "video/mp4", attachmentThumbnailUrl: "https://x/t.jpg",
            attachmentIsProtected: true
        )
        XCTAssertFalse(unprotected.quotedMediaIsProtected)
        XCTAssertTrue(protected.quotedMediaIsProtected)
        XCTAssertTrue(unprotected.offersMediaGate)
        XCTAssertFalse(protected.offersMediaGate,
            "un media protege n'offre AUCUNE zone 2 : ni vignette, ni icone de lecture, ni geste")
    }

    /// `nil` = le fil n'a RIEN dit, ce qui n'est pas « il dit que ce n'est pas
    /// protege ». Traite comme NON protege pour le rendu — sinon la vignette
    /// d'une citation ordinaire disparaitrait des qu'un blob de cache ancien se
    /// tait — mais la valeur reste distinguable, donc corrigible.
    func test_replyReference_silenceIsNotAnAssertionOfSafety() throws {
        let legacy = """
        {"messageId":"m9","authorName":"Bob","authorColor":"#31B6BA",
         "previewText":"Salut","isMe":false,"isStoryReply":false,
         "attachmentType":"video/mp4","attachmentThumbnailUrl":"https://x/t.jpg"}
        """
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: Data(legacy.utf8))
        XCTAssertNil(decoded.attachmentIsProtected,
            "Un blob anterieur au champ doit decoder en nil, jamais echouer ni fabriquer un false.")
        XCTAssertFalse(decoded.quotedMediaIsProtected)
    }

    func test_replyReference_roundtripsTheProtection() throws {
        let original = ReplyReference(
            messageId: "m2", authorName: "Bob", previewText: "",
            attachmentType: "image/png", attachmentThumbnailUrl: "https://x/t.png",
            attachmentIsProtected: true
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: data)
        XCTAssertEqual(decoded.attachmentIsProtected, true)
        XCTAssertTrue(decoded.quotedMediaIsProtected)
    }

    // MARK: - Les deux zones, cote DONNEE

    /// Ce que la citation OFFRE, independamment de toute peau — la source que
    /// la couche d'accessibilite des deux hotes de rangee interroge pour savoir
    /// quelle action nommee proposer.
    func test_replyReference_offersTheTwoZones_onlyWhenTheyExist() {
        let story = ReplyReference(messageId: "s1", authorName: "Story", previewText: "", isStoryReply: true)
        XCTAssertFalse(story.offersAuthorGate,
            "une story citee ne designe aucune personne — l'hote fabriquerait une fiche au nom de « Story »")
        XCTAssertFalse(story.offersMediaGate,
            "la zone 3 d'une story ouvre DEJA le viewer plein ecran : la dedoubler serait un second point actionnable")

        let textOnly = ReplyReference(messageId: "m1", authorName: "Alice", previewText: "coucou")
        XCTAssertTrue(textOnly.offersAuthorGate)
        XCTAssertFalse(textOnly.offersMediaGate, "aucune piece jointe, aucun media a ouvrir")

        let thumbOnly = ReplyReference(
            messageId: "m2", authorName: "Alice", previewText: "",
            attachmentThumbnailUrl: "https://x/t.jpg"
        )
        XCTAssertTrue(thumbOnly.offersMediaGate, "une vignette sans type reste ouvrable en plein ecran")

        let emptyThumb = ReplyReference(
            messageId: "m3", authorName: "Alice", previewText: "",
            attachmentThumbnailUrl: ""
        )
        XCTAssertFalse(emptyThumb.offersMediaGate, "une URL VIDE n'est pas une vignette")
    }

    // MARK: - APIMessageAttachment : la protection DECLAREE par le fil

    /// Site UNIQUE de la derivation, partage par le chemin reseau
    /// (`uiReplyTo`) et le chemin cache (`MessagePersistenceActor`). Un `false`
    /// fabrique a partir d'un silence serait une AFFIRMATION, que le blob
    /// graverait ensuite pour toujours.
    func test_apiMessageAttachment_declaredProtection_distinguishesSilenceFromSafety() throws {
        func attachment(_ json: String) throws -> APIMessageAttachment {
            try JSONDecoder().decode(APIMessageAttachment.self, from: Data(json.utf8))
        }
        XCTAssertNil(try attachment(#"{"id":"a1"}"#).declaredProtection,
            "le fil ne dit RIEN de la protection : ni protege, ni sur")
        XCTAssertEqual(try attachment(#"{"id":"a1","isViewOnce":false,"isBlurred":false}"#).declaredProtection, false)
        XCTAssertEqual(try attachment(#"{"id":"a1","isViewOnce":true,"isBlurred":false}"#).declaredProtection, true)
        XCTAssertEqual(try attachment(#"{"id":"a1","isBlurred":true}"#).declaredProtection, true)
    }

    // MARK: - ReplyReference : l'avatar de l'auteur cite

    /// Le champ avatar est OPTIONNEL, et il doit le rester : un blob
    /// `replyToJson` grave AVANT lui doit decoder tel quel.
    func test_replyReference_decodesABlobWrittenBeforeTheAvatarField_asNil() throws {
        let legacy = """
        {"messageId":"m9","authorName":"Bob","authorColor":"#31B6BA",
         "previewText":"Salut","isMe":false,"isStoryReply":false}
        """
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: Data(legacy.utf8))
        XCTAssertNil(decoded.authorAvatarUrl,
            "Un blob anterieur au champ doit decoder en nil, jamais echouer.")
        XCTAssertEqual(decoded.authorName, "Bob")
    }

    /// Et surtout : sans emporter le message ENTIER. `MeeshyMessage.init(from:)`
    /// decode `replyTo` par `decodeIfPresent`, qui PROPAGE l'echec d'un
    /// sous-decodage — un champ requis ferait disparaitre du cache L2 tout
    /// message dont la citation a ete gravee avant le champ, pas seulement sa
    /// citation.
    func test_meeshyMessage_survivesAReplyBlobWrittenBeforeTheAvatarField() throws {
        let legacy = """
        {"id":"m10","conversationId":"c1","createdAt":"2026-08-24T10:00:00Z",
         "content":"ma reponse",
         "replyTo":{"messageId":"m9","authorName":"Bob","authorColor":"#31B6BA",
                    "previewText":"Salut","isMe":false,"isStoryReply":false}}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let message = try decoder.decode(MeeshyMessage.self, from: Data(legacy.utf8))
        XCTAssertEqual(message.id, "m10")
        XCTAssertEqual(message.replyTo?.authorName, "Bob")
        XCTAssertNil(message.replyTo?.authorAvatarUrl)
    }

    func test_replyReference_roundtripsTheAuthorAvatar() throws {
        let original = ReplyReference(
            messageId: "m2", authorName: "Bob", previewText: "Sure!",
            isMe: true, authorAvatarUrl: "https://cdn.example/bob.jpg"
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: data)
        XCTAssertEqual(decoded.authorAvatarUrl, "https://cdn.example/bob.jpg")
    }

    /// Chemin RESEAU : la citation porte l'avatar de l'auteur cite, deja present
    /// sur le fil (`replyTo.sender`). Sans lui, l'avatar de la citation devrait
    /// etre re-resolu au rendu — invisible d'un `==` manuel, donc jamais
    /// redessine.
    func test_uiReplyTo_carriesTheQuotedAuthorAvatar_fromTheSenderEnvelope() throws {
        let json = """
        {
          "id":"srv1","conversationId":"c1","senderId":"u2",
          "content":"ma reponse","createdAt":"2026-08-24T10:00:00Z",
          "replyTo":{"id":"m9","content":"Salut","senderId":"u1",
                     "sender":{"id":"u1","displayName":"Bob",
                               "avatar":"https://cdn.example/bob.jpg"}}
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let api = try decoder.decode(APIMessage.self, from: Data(json.utf8))

        let message = api.toMessage(currentUserId: "u2")

        XCTAssertEqual(message.replyTo?.authorAvatarUrl, "https://cdn.example/bob.jpg")
    }

    /// Meme cascade que `APIMessageSender.resolvedAvatar` : l'avatar imbrique
    /// sous `sender.user` sert de repli. C'est la forme que le gateway renvoie
    /// pour un participant inscrit.
    func test_uiReplyTo_fallsBackToTheNestedUserAvatar() throws {
        let json = """
        {
          "id":"srv2","conversationId":"c1","senderId":"u2",
          "content":"ma reponse","createdAt":"2026-08-24T10:00:00Z",
          "replyTo":{"id":"m9","content":"Salut","senderId":"u1",
                     "sender":{"id":"u1","displayName":"Bob",
                               "user":{"avatar":"https://cdn.example/nested.jpg"}}}
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let api = try decoder.decode(APIMessage.self, from: Data(json.utf8))

        let message = api.toMessage(currentUserId: "u2")

        XCTAssertEqual(message.replyTo?.authorAvatarUrl, "https://cdn.example/nested.jpg")
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
            attachmentType: "video/mp4", attachmentThumbnailUrl: "https://example.com/vid.jpg",
            conversationType: "group"
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
        XCTAssertEqual(decoded.conversationType, "group")
    }

    func testForwardReferenceDecodesLegacyJSONWithoutConversationType() throws {
        let legacy = Data("""
        {"originalMessageId":"fm1","senderName":"Diana","previewText":"Check this","conversationId":"conv5","conversationName":"Design Team"}
        """.utf8)
        let decoded = try JSONDecoder().decode(ForwardReference.self, from: legacy)
        XCTAssertNil(decoded.conversationType,
                     "les caches GRDB antérieurs au champ doivent décoder sans migration")
        XCTAssertEqual(decoded.conversationName, "Design Team")
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

    // MARK: - APIMessage.postReplyTo (snapshot figé du post cité)

    func test_apiMessage_decodesPostReplyTo_story_withShareCount() throws {
        let json = """
        {
          "id": "msg_1",
          "conversationId": "conv_1",
          "senderId": "sender_1",
          "createdAt": "2026-05-19T10:00:00Z",
          "updatedAt": "2026-05-19T10:00:00Z",
          "storyReplyToId": "story_42",
          "postReplyTo": {
            "id": "story_42",
            "type": "STORY",
            "reactionCount": 12,
            "commentCount": 3,
            "shareCount": 4,
            "createdAt": "2026-05-18T08:00:00.000Z",
            "thumbnailUrl": "https://cdn.example/s42.jpg",
            "previewText": "Ma story du matin"
          }
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let message = try decoder.decode(APIMessage.self, from: Data(json.utf8))
        let post = try XCTUnwrap(message.postReplyTo)
        XCTAssertEqual(post.id, "story_42")
        XCTAssertEqual(post.type, "STORY")
        XCTAssertEqual(post.reactionCount, 12)
        XCTAssertEqual(post.commentCount, 3)
        XCTAssertEqual(post.shareCount, 4)
        XCTAssertEqual(post.thumbnailUrl, "https://cdn.example/s42.jpg")
        XCTAssertEqual(post.previewText, "Ma story du matin")
        XCTAssertNil(post.moodEmoji)
    }

    func test_apiMessage_decodesPostReplyTo_status_mood() throws {
        let json = """
        {
          "id": "msg_2", "conversationId": "c", "senderId": "s",
          "createdAt": "2026-05-19T10:00:00Z", "updatedAt": "2026-05-19T10:00:00Z",
          "storyReplyToId": "status_7",
          "postReplyTo": {
            "id": "status_7", "type": "STATUS",
            "reactionCount": 0, "commentCount": 0, "shareCount": 0,
            "createdAt": "2026-05-18T08:00:00.000Z",
            "previewText": "en forme", "moodEmoji": "😴"
          }
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let message = try decoder.decode(APIMessage.self, from: Data(json.utf8))
        let post = try XCTUnwrap(message.postReplyTo)
        XCTAssertEqual(post.type, "STATUS")
        XCTAssertEqual(post.moodEmoji, "😴")
        XCTAssertEqual(post.previewText, "en forme")
    }

    func test_apiMessage_decodesLegacyStoryReplyTo_key() throws {
        // Payload legacy (clé `storyReplyTo`, sans type/shareCount) → fallback.
        let json = """
        {
          "id": "msg_3", "conversationId": "c", "senderId": "s",
          "createdAt": "2026-05-19T10:00:00Z", "updatedAt": "2026-05-19T10:00:00Z",
          "storyReplyToId": "story_9",
          "storyReplyTo": {
            "id": "story_9", "reactionCount": 1, "commentCount": 0,
            "createdAt": "2026-05-18T08:00:00.000Z", "previewText": "legacy"
          }
        }
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let message = try decoder.decode(APIMessage.self, from: Data(json.utf8))
        let post = try XCTUnwrap(message.postReplyTo)
        XCTAssertEqual(post.id, "story_9")
        XCTAssertEqual(post.previewText, "legacy")
        XCTAssertEqual(post.shareCount, 0) // défaut quand absent
    }

    // MARK: - Fan-out de partage : copier, jamais transférer

    private func encodedKeys(_ request: SendMessageRequest) throws -> Set<String> {
        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
        return Set(json.keys)
    }

    /// La diffusion multi-destinataires d'un partage crée des messages qui
    /// COPIENT les pièces jointes du premier — jamais des transferts. Un
    /// transfert ferait afficher « Transféré depuis <conversation source> »
    /// aux destinataires suivants : partager vers « Famille » puis
    /// « Collègues » révélerait « Famille » aux collègues.
    func test_sendMessageRequest_carriesCopyAttachmentsFromMessageId() throws {
        let request = SendMessageRequest(
            content: "bonjour", clientMessageId: "cid_abc_t1",
            copyAttachmentsFromMessageId: "srv1")

        let data = try JSONEncoder().encode(request)
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])

        XCTAssertEqual(json["copyAttachmentsFromMessageId"] as? String, "srv1")
    }

    func test_sendMessageRequest_withCopyMode_carriesNoForwardMetadata() throws {
        let keys = try encodedKeys(SendMessageRequest(
            content: "bonjour", clientMessageId: "cid_abc_t1",
            copyAttachmentsFromMessageId: "srv1"))

        XCTAssertFalse(keys.contains("forwardedFromId"),
                       "un destinataire ne doit JAMAIS voir « Transféré depuis … »")
        XCTAssertFalse(keys.contains("forwardedFromConversationId"))
    }

    /// Réutiliser les mêmes `attachmentIds` les DÉPLACERAIT
    /// (`associateAttachmentsToMessage` est un `updateMany`) : le premier
    /// destinataire perdrait ses pièces jointes.
    func test_sendMessageRequest_withCopyMode_carriesNoAttachmentIds() throws {
        let keys = try encodedKeys(SendMessageRequest(
            content: nil, clientMessageId: "cid_abc_t1",
            copyAttachmentsFromMessageId: "srv1"))

        XCTAssertFalse(keys.contains("attachmentIds"))
        XCTAssertTrue(keys.contains("copyAttachmentsFromMessageId"))
    }

    func test_sendMessageRequest_withoutCopyMode_omitsTheKeyEntirely() throws {
        let keys = try encodedKeys(SendMessageRequest(content: "bonjour"))

        XCTAssertFalse(keys.contains("copyAttachmentsFromMessageId"),
                       "un optionnel nil ne doit pas partir en `null`")
    }
}
