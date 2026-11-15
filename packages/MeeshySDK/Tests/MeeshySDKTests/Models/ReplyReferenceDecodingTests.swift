import Testing
import Foundation
@testable import MeeshySDK

/// `ReplyReference` transporte désormais les FAITS du média cité — ThumbHash,
/// dimensions, durée, taille, pages, MIME — pour que la citation puisse rendre
/// « Photo · 1024×768 » ou un flou instantané sans attendre le réseau
/// (#4945, D-QUOTE-01).
///
/// Les sept champs sont OPTIONNELS, et doivent le rester : `MeeshyMessage
/// .init(from:)` décode `replyTo` par `decodeIfPresent`, qui PROPAGE l'échec
/// d'un sous-décodage. Un champ requis ferait disparaître du cache L2 le
/// message ENTIER dont le blob `replyToJson` a été gravé avant lui. Le témoin
/// décode donc un JSON FIGÉ d'avant le lot — jamais un blob ré-encodé par le
/// code du jour, qui porterait les nouvelles clés par construction.
@Suite("ReplyReference — les faits du média cité voyagent, et un blob ancien se relit")
struct ReplyReferenceDecodingTests {

    /// Blob `replyToJson` tel que gravé AVANT le lot : aucune des sept clés.
    private static let legacyBlob = """
    {"messageId":"m9","authorName":"Bob","authorColor":"#31B6BA",
     "previewText":"Salut","isMe":false,"attachmentType":"image",
     "attachmentThumbnailUrl":"https://cdn.meeshy.me/t.jpg","isStoryReply":false}
    """

    private static func decodeReply(_ json: String) throws -> ReplyReference {
        try JSONDecoder().decode(ReplyReference.self, from: Data(json.utf8))
    }

    // MARK: - Rétro-compatibilité

    @Test("un blob gravé avant les sept champs décode, les faits à nil")
    func legacyBlobDecodesWithNilFacts() throws {
        let decoded = try Self.decodeReply(Self.legacyBlob)
        #expect(decoded.authorName == "Bob")
        #expect(decoded.attachmentType == "image")
        #expect(decoded.attachmentThumbHash == nil)
        #expect(decoded.attachmentWidth == nil)
        #expect(decoded.attachmentHeight == nil)
        #expect(decoded.attachmentDurationMs == nil)
        #expect(decoded.attachmentFileSize == nil)
        #expect(decoded.attachmentPageCount == nil)
        #expect(decoded.attachmentMimeType == nil)
    }

    @Test("un message dont la citation est un blob ancien survit ENTIER au décodage")
    func messageSurvivesALegacyReplyBlob() throws {
        let legacy = """
        {"id":"m10","conversationId":"c1","createdAt":"2026-08-24T10:00:00Z",
         "content":"ma reponse","replyTo":\(Self.legacyBlob)}
        """
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let message = try decoder.decode(MeeshyMessage.self, from: Data(legacy.utf8))
        #expect(message.id == "m10")
        #expect(message.replyTo?.authorName == "Bob")
        #expect(message.replyTo?.attachmentThumbHash == nil)
    }

    // MARK: - Décodage complet

    @Test("les sept faits décodent depuis un blob qui les porte")
    func fullBlobDecodesEveryFact() throws {
        let json = """
        {"messageId":"m9","authorName":"Bob","authorColor":"#31B6BA",
         "previewText":"","isMe":false,"attachmentType":"video","isStoryReply":false,
         "attachmentThumbHash":"1QcSHQRnh493V4dIh4eXh1h4kJUI",
         "attachmentWidth":1920,"attachmentHeight":1080,"attachmentDurationMs":42000,
         "attachmentFileSize":1258291,"attachmentPageCount":null,"attachmentMimeType":"video/mp4"}
        """
        let decoded = try Self.decodeReply(json)
        #expect(decoded.attachmentThumbHash == "1QcSHQRnh493V4dIh4eXh1h4kJUI")
        #expect(decoded.attachmentWidth == 1920)
        #expect(decoded.attachmentHeight == 1080)
        #expect(decoded.attachmentDurationMs == 42000)
        #expect(decoded.attachmentFileSize == 1258291)
        #expect(decoded.attachmentPageCount == nil)
        #expect(decoded.attachmentMimeType == "video/mp4")
    }

    @Test("les sept faits font l'aller-retour Codable")
    func factsRoundTrip() throws {
        let facts = ReplyReference.QuotedAttachmentFacts(
            thumbHash: "abc", width: 640, height: 480, durationMs: nil,
            fileSize: 1024, pageCount: 3, mimeType: "application/pdf"
        )
        let original = ReplyReference(
            messageId: "m2", authorName: "Bob", previewText: "doc",
            attachmentType: "pdf", attachmentFacts: facts
        )
        let data = try JSONEncoder().encode(original)
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: data)
        #expect(decoded.attachmentThumbHash == "abc")
        #expect(decoded.attachmentWidth == 640)
        #expect(decoded.attachmentHeight == 480)
        #expect(decoded.attachmentDurationMs == nil)
        #expect(decoded.attachmentFileSize == 1024)
        #expect(decoded.attachmentPageCount == 3)
        #expect(decoded.attachmentMimeType == "application/pdf")
    }

    // MARK: - Les faits se recopient en UNE ligne depuis chaque source

    @Test("QuotedAttachmentFacts recopie les sept champs d'un MeeshyMessageAttachment")
    func factsFromDomainAttachment() {
        let attachment = MeeshyMessageAttachment(
            mimeType: "image/jpeg", fileSize: 2048, width: 1024, height: 768,
            thumbHash: "hash", duration: nil, pageCount: nil
        )
        let facts = ReplyReference.QuotedAttachmentFacts(attachment)
        #expect(facts.thumbHash == "hash")
        #expect(facts.width == 1024)
        #expect(facts.height == 768)
        #expect(facts.durationMs == nil)
        #expect(facts.fileSize == 2048)
        #expect(facts.pageCount == nil)
        #expect(facts.mimeType == "image/jpeg")
    }

    @Test("QuotedAttachmentFacts recopie les sept champs d'un APIMessageAttachment")
    func factsFromWireAttachment() throws {
        let json = """
        {"id":"a1","mimeType":"audio/mp4","fileSize":900,"duration":12000,"thumbHash":null,"pageCount":null}
        """
        let attachment = try JSONDecoder().decode(APIMessageAttachment.self, from: Data(json.utf8))
        let facts = ReplyReference.QuotedAttachmentFacts(attachment)
        #expect(facts.thumbHash == nil)
        #expect(facts.width == nil)
        #expect(facts.height == nil)
        #expect(facts.durationMs == 12000)
        #expect(facts.fileSize == 900)
        #expect(facts.pageCount == nil)
        #expect(facts.mimeType == "audio/mp4")
    }

    @Test("un fileSize à 0 sur le modèle domaine vaut « inconnu », pas « vide »")
    func zeroFileSizeIsUnknown() {
        let attachment = MeeshyMessageAttachment(mimeType: "image/jpeg", fileSize: 0)
        #expect(ReplyReference.QuotedAttachmentFacts(attachment).fileSize == nil)
    }

    @Test("sans faits, l'init laisse les sept champs à nil — le rendu sait qu'il ne sait pas")
    func initWithoutFactsLeavesNil() {
        let reference = ReplyReference(messageId: "m1", authorName: "A", previewText: "x")
        #expect(reference.attachmentThumbHash == nil)
        #expect(reference.attachmentWidth == nil)
        #expect(reference.attachmentFileSize == nil)
        #expect(reference.attachmentMimeType == nil)
    }
}
