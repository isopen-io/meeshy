import Testing
import Foundation
@testable import MeeshySDK

/// #6164 — UNE CITATION DÉSIGNE UNE PIÈCE NOMMÉE, PAS « LA PREMIÈRE ».
///
/// La passerelle sert, sous `replyTo`, l'instantané FIGÉ que le message CITANT
/// porte dans `metadata.attachmentReplyTo` : l'ancre du saut et la NATURE, rien
/// d'autre (#6123, voie C). Tout ce qui DÉCRIT la pièce — vignette, nom,
/// taille, DURÉE — reste sur `attachments`, donc reste retenu pièce par pièce
/// quand la pièce est protégée ou a disparu.
///
/// **Le RANG est load-bearing.** Écrits sur la PREMIÈRE pièce, ces témoins ne
/// pourraient PAS tomber : à ce rang, le court-circuit historique
/// (`quotedRepresentative`) et la règle juste (« celle qu'on a nommée ») rendent
/// le même verdict. Ils s'écrivent donc sur la TROISIÈME d'un message qui en
/// porte cinq — leçon 261.
@Suite("ReplyReference — la pièce NOMMÉE d'une citation (#6164)")
struct QuotedAttachmentIdentityTests {

    // MARK: - Fabriques

    private static func photo(_ rang: Int, protection: String = "") -> String {
        """
        {"id":"a\(rang)","mimeType":"image/jpeg","fileSize":\(1000 * rang),
         "width":1024,"height":768,\(protection)
         "thumbnailUrl":"https://cdn.meeshy.me/a\(rang)-t.jpg"}
        """
    }

    private static let cinqPieces = (1...5).map { photo($0) }.joined(separator: ",")

    private static func quoted(attachments: String, cite: String? = nil) -> String {
        let instantane = cite.map { "\"attachmentReplyTo\":\($0)," } ?? ""
        return """
        {"id":"q1","content":"regarde ces cinq photos","originalLanguage":"fr","senderId":"p-bob",
         "sender":{"id":"p-bob","displayName":"Bob","userId":"u-bob"},
         \(instantane)"attachments":[\(attachments)]}
        """
    }

    private static func reference(_ json: String) throws -> ReplyReference {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reply = try decoder.decode(APIMessageReplyTo.self, from: Data(json.utf8))
        return reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
    }

    // MARK: - Le rang 3 sur 5

    @Test("la citation porte l'identifiant de la TROISIÈME pièce, jamais celui de la première")
    func namesTheThirdAttachment() throws {
        let ref = try Self.reference(
            Self.quoted(attachments: Self.cinqPieces, cite: #"{"attachmentId":"a3","kind":"image"}"#)
        )
        #expect(ref.attachmentId == "a3")
        #expect(ref.attachmentId != "a1")
    }

    @Test("et elle rend la vignette de la TROISIÈME, jamais celle de la première")
    func rendersTheThirdThumbnail() throws {
        let ref = try Self.reference(
            Self.quoted(attachments: Self.cinqPieces, cite: #"{"attachmentId":"a3","kind":"image"}"#)
        )
        #expect(ref.attachmentThumbnailUrl == "https://cdn.meeshy.me/a3-t.jpg")
        #expect(ref.attachmentFileSize == 3000)
    }

    @Test("sans instantané, la citation retombe sur le représentatif — rien ne change")
    func withoutSnapshotFallsBackToRepresentative() throws {
        let ref = try Self.reference(Self.quoted(attachments: Self.cinqPieces))
        #expect(ref.attachmentId == nil)
        #expect(ref.attachmentThumbnailUrl == "https://cdn.meeshy.me/a1-t.jpg")
    }

    // MARK: - La pièce nommée peut être RETENUE ou ABSENTE

    @Test("une pièce nommée à VUE UNIQUE ne fait voyager ni vignette ni taille")
    func namedProtectedAttachmentTravelsNothing() throws {
        // La passerelle masque la pièce ; il ne reste que son discriminant.
        let masquee = #"{"id":"a3","mimeType":"image/jpeg","isViewOnce":true}"#
        let pieces = [Self.photo(1), Self.photo(2), masquee, Self.photo(4)].joined(separator: ",")
        let ref = try Self.reference(
            Self.quoted(attachments: pieces, cite: #"{"attachmentId":"a3","kind":"image"}"#)
        )
        #expect(ref.attachmentId == "a3")
        #expect(ref.attachmentIsProtected == true)
        #expect(ref.attachmentThumbnailUrl == nil)
        #expect(ref.attachmentFileSize == nil)
    }

    @Test("une pièce nommée SUPPRIMÉE ne fait pas retomber la citation sur une AUTRE photo")
    func deletedNamedAttachmentNeverBorrowsAnother() throws {
        let ref = try Self.reference(
            Self.quoted(attachments: Self.cinqPieces, cite: #"{"attachmentId":"a9","kind":"image"}"#)
        )
        #expect(ref.attachmentId == "a9")
        // Le piège exact : emprunter la vignette de la première serait montrer
        // une photo que cette réponse ne cite pas.
        #expect(ref.attachmentThumbnailUrl == nil)
        // Elle ne se VIDE pas pour autant : la nature figée reste.
        #expect(ref.attachmentType == "image")
    }

    @Test("la nature figée d'un vocal supprimé survit aussi")
    func deletedNamedAudioKeepsItsKind() throws {
        let ref = try Self.reference(
            Self.quoted(attachments: Self.cinqPieces, cite: #"{"attachmentId":"a9","kind":"audio"}"#)
        )
        #expect(ref.attachmentType == "audio")
    }

    // MARK: - L'ÉLECTION, partagée par la citation et l'OUVERTURE

    @Test("citedAttachment élit la pièce nommée parmi celles du message cité")
    func citedAttachmentElectsTheNamedOne() {
        let pieces = (1...5).map { MeeshyMessageAttachment(id: "a\($0)", mimeType: "image/jpeg") }
        let ref = ReplyReference(messageId: "q1", authorName: "Bob", previewText: "x", attachmentId: "a3")
        #expect(ref.citedAttachment(among: pieces)?.id == "a3")
    }

    @Test("sans identifiant, elle rend le représentatif — la règle d'avant, inchangée")
    func citedAttachmentFallsBackToRepresentative() {
        let pieces = [
            MeeshyMessageAttachment(id: "a0", mimeType: "application/x-location"),
            MeeshyMessageAttachment(id: "a1", mimeType: "image/jpeg"),
        ]
        let ref = ReplyReference(messageId: "q1", authorName: "Bob", previewText: "x")
        #expect(ref.citedAttachment(among: pieces)?.id == "a1")
    }

    @Test("une pièce nommée introuvable n'OUVRE pas une autre pièce")
    func citedAttachmentNeverOpensAnother() {
        let pieces = (1...5).map { MeeshyMessageAttachment(id: "a\($0)", mimeType: "image/jpeg") }
        let ref = ReplyReference(messageId: "q1", authorName: "Bob", previewText: "x", attachmentId: "a9")
        #expect(ref.citedAttachment(among: pieces) == nil)
    }

    // MARK: - Non-régression : le champ est OPTIONNEL, et il doit le rester

    /// `MeeshyMessage.init(from:)` décode `replyTo` par `decodeIfPresent`, qui
    /// PROPAGE l'échec d'un sous-décodage. Un `attachmentId` REQUIS ferait
    /// disparaître du cache L2 le MESSAGE ENTIER dès qu'un blob `replyToJson` a
    /// été gravé avant le champ. Le témoin s'écrit donc sur le MESSAGE, jamais
    /// sur la citation — et sur un JSON FIGÉ d'avant le lot, jamais sur un blob
    /// ré-encodé par le code du jour, qui porterait la clé par construction.
    @Test("un message dont la citation est un blob gravé AVANT le champ survit ENTIER")
    func messageSurvivesABlobWithoutAttachmentId() throws {
        let legacy = """
        {"id":"m11","conversationId":"c1","createdAt":"2026-09-15T10:00:00Z",
         "content":"ma reponse",
         "replyTo":{"messageId":"m9","authorName":"Bob","authorColor":"#31B6BA",
          "previewText":"Salut","isMe":false,"attachmentType":"image",
          "attachmentThumbnailUrl":"https://cdn.meeshy.me/t.jpg","isStoryReply":false}}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let message = try decoder.decode(MeeshyMessage.self, from: Data(legacy.utf8))
        #expect(message.id == "m11")
        #expect(message.content == "ma reponse")
        #expect(message.replyTo?.authorName == "Bob")
        #expect(message.replyTo?.attachmentId == nil)
    }

    @Test("l'identifiant fait l'aller-retour Codable")
    func attachmentIdRoundTrips() throws {
        let original = ReplyReference(
            messageId: "m2", authorName: "Bob", previewText: "doc", attachmentId: "a7"
        )
        let decoded = try JSONDecoder().decode(
            ReplyReference.self, from: try JSONEncoder().encode(original)
        )
        #expect(decoded.attachmentId == "a7")
    }
}
