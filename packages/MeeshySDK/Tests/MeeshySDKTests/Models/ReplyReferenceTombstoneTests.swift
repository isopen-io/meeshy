import Testing
import Foundation
@testable import MeeshySDK

/// #7927 — un message SUPPRIMÉ ne se relit dans AUCUNE citation (cas de
/// confidentialité), et une citation d'un message modifié suit son texte.
@Suite("ReplyReference — citation d'un message supprimé ou modifié")
struct ReplyReferenceTombstoneTests {

    private static func quote() -> ReplyReference {
        ReplyReference(
            messageId: "parent", authorName: "Bob", previewText: "le code est 4271",
            isMe: false, authorAvatarUrl: "https://cdn/bob.jpg",
            attachmentType: "image", attachmentId: "a1",
            attachmentThumbnailUrl: "https://cdn/a1-t.jpg", attachmentIsProtected: false,
            attachmentFacts: .init(thumbHash: "hash", width: 10, height: 20, durationMs: nil,
                                   fileSize: 99, pageCount: nil, mimeType: "image/jpeg")
        )
    }

    @Test("la citation scellée ne garde ni texte ni média, et dit sa suppression")
    func tombstoned_dropsContentAndMedia() {
        let at = Date(timeIntervalSince1970: 1_000)
        let sealed = Self.quote().tombstoned(at: at)
        #expect(sealed.previewText.isEmpty)
        #expect(sealed.attachmentType == nil)
        #expect(sealed.attachmentId == nil)
        #expect(sealed.attachmentThumbnailUrl == nil)
        #expect(sealed.attachmentThumbHash == nil)
        #expect(sealed.attachmentMimeType == nil)
        #expect(sealed.isQuotedMessageDeleted)
        #expect(sealed.quotedMessageDeletedAt == at)
        #expect(sealed.messageId == "parent")
        #expect(sealed.authorName == "Bob")
        #expect(!sealed.offersMediaGate)
    }

    @Test("#8631 — scellée par EXPIRATION, la citation le dit ; par suppression, non")
    func tombstoned_expired_isDistinguishedFromDeletion() {
        let at = Date(timeIntervalSince1970: 1_000)
        let expired = Self.quote().tombstoned(at: at, expired: true)
        #expect(expired.isQuotedMessageDeleted)
        #expect(expired.isQuotedMessageExpired)
        #expect(expired.quotedExpiresAt == at)
        #expect(expired.previewText.isEmpty)
        #expect(!Self.quote().tombstoned(at: at).isQuotedMessageExpired)
    }

    @Test("#8631 — une échéance servie atteinte avant le scellement dit une expiration")
    func tombstoned_keepsAnElapsedServedDeadline() {
        let at = Date(timeIntervalSince1970: 1_000)
        var served = Self.quote()
        served.quotedExpiresAt = at
        #expect(served.tombstoned(at: at).isQuotedMessageExpired)
        var later = Self.quote()
        later.quotedExpiresAt = at.addingTimeInterval(60)
        #expect(!later.tombstoned(at: at).isQuotedMessageExpired)
    }

    @Test("#8631 — l'aperçu d'une citation scellée porte le libellé de SA cause")
    func presentingSeal_picksTheLabelOfTheCause() {
        let labels = (deleted: "Message supprimé", expired: "Message éphémère expiré")
        #expect(Self.quote().presentingSeal(deleted: labels.deleted, expired: labels.expired).previewText == "le code est 4271")
        #expect(Self.quote().tombstoned(at: Date()).presentingSeal(deleted: labels.deleted, expired: labels.expired).previewText == labels.deleted)
        #expect(Self.quote().tombstoned(at: Date(), expired: true).presentingSeal(deleted: labels.deleted, expired: labels.expired).previewText == labels.expired)
    }

    @Test("#8631 — REST : la citation qu'a scellée la passerelle (expiresAt = deletedAt) se lit expirée")
    func apiReplyTo_sealedByServer_readsExpired() throws {
        let json = """
        {"id":"q1","content":"","senderId":"p-bob",
         "sender":{"id":"p-bob","displayName":"Bob","userId":"u-bob"},
         "deletedAt":"2026-09-25T10:00:00Z","expiresAt":"2026-09-25T10:00:00Z"}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reply = try decoder.decode(APIMessageReplyTo.self, from: Data(json.utf8))
        let reference = reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
        #expect(reference.isQuotedMessageExpired)
    }

    @Test("une citation modifiée garde tout sauf son texte")
    func withPreviewText_keepsEverythingElse() {
        let edited = Self.quote().withPreviewText("nouveau texte")
        #expect(edited.previewText == "nouveau texte")
        var expected = Self.quote()
        #expect(edited != expected)
        expected = edited.withPreviewText("le code est 4271")
        #expect(expected == Self.quote())
    }

    @Test("un blob replyToJson gravé AVANT le champ se relit sans lui")
    func legacyBlob_decodesWithoutDeletedAt() throws {
        let blob = try JSONEncoder().encode(Self.quote())
        var object = try #require(try JSONSerialization.jsonObject(with: blob) as? [String: Any])
        object.removeValue(forKey: "quotedMessageDeletedAt")
        let data = try JSONSerialization.data(withJSONObject: object)
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: data)
        #expect(!decoded.isQuotedMessageDeleted)
    }

    @Test("la citation scellée survit à l'aller-retour du blob")
    func tombstone_roundTripsThroughBlob() throws {
        let sealed = Self.quote().tombstoned(at: Date(timeIntervalSince1970: 1_000))
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: JSONEncoder().encode(sealed))
        #expect(decoded == sealed)
    }

    @Test("REST : un message cité servi supprimé ne republie pas son texte")
    func apiReplyTo_deleted_composesTombstone() throws {
        let json = """
        {"id":"q1","content":"le code est 4271","originalLanguage":"fr","senderId":"p-bob",
         "sender":{"id":"p-bob","displayName":"Bob","userId":"u-bob"},
         "deletedAt":"2026-09-25T10:00:00Z",
         "attachments":[{"id":"a1","mimeType":"image/jpeg","thumbnailUrl":"https://cdn/a1-t.jpg"}]}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let replyTo = try decoder.decode(APIMessageReplyTo.self, from: Data(json.utf8))
        let reference = replyTo.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
        #expect(reference.previewText.isEmpty)
        #expect(reference.isQuotedMessageDeleted)
        #expect(reference.attachmentThumbnailUrl == nil)
        #expect(reference.authorName == "Bob")
    }

    @Test("REST : une date de suppression illisible ne fait pas tomber la citation")
    func apiReplyTo_unreadableDeletedAt_keepsQuote() throws {
        let json = """
        {"id":"q1","content":"bonjour","deletedAt":12}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let replyTo = try decoder.decode(APIMessageReplyTo.self, from: Data(json.utf8))
        #expect(replyTo.toReplyReference(currentUserId: nil, preferredLanguages: []).previewText == "bonjour")
    }
}
