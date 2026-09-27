import Testing
import Foundation
@testable import MeeshySDK

/// #8230 — une citation d'AUDIO ou de VIDÉO porte l'adresse du FICHIER cité.
///
/// La passerelle sert déjà `fileUrl` de la pièce citée (masqué si protégée) ;
/// la citation le jetait. Sans lui, une vidéo dont la vignette serveur a raté
/// (vidéo < 1 s, erreur ffmpeg) ne montrait AUCUN poster, et une pièce hors de
/// la fenêtre chargée ne pouvait pas s'ouvrir en plein écran depuis la citation.
///
/// Le champ est OPTIONNEL, et doit le rester : un blob `replyToJson` gravé avant
/// lui doit se relire sans emporter le message entier.
@Suite("ReplyReference — l'adresse du fichier cité voyage, jamais pour un média protégé (#8230)")
struct QuotedAttachmentFileUrlTests {

    private static func reference(_ json: String) throws -> ReplyReference {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reply = try decoder.decode(APIMessageReplyTo.self, from: Data(json.utf8))
        return reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
    }

    private static func quoted(attachment: String, message extra: String = "") -> String {
        """
        {"id":"q1","content":"","originalLanguage":"fr","senderId":"p-bob",\(extra)
         "sender":{"id":"p-bob","displayName":"Bob","userId":"u-bob"},
         "attachments":[\(attachment)]}
        """
    }

    private static let video = """
    {"id":"v1","mimeType":"video/mp4","duration":4200,"width":720,"height":1280,
     "fileUrl":"https://cdn.meeshy.me/v1.mp4"}
    """

    @Test("un blob gravé avant le champ décode, l'adresse à nil")
    func legacyBlobDecodes() throws {
        let legacy = #"{"messageId":"m9","authorName":"Bob","authorColor":"#31B6BA","previewText":"","isMe":false,"attachmentType":"video","isStoryReply":false}"#
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: Data(legacy.utf8))
        #expect(decoded.attachmentType == "video")
        #expect(decoded.attachmentFileUrl == nil)
    }

    @Test("l'adresse survit à l'aller-retour du cache")
    func roundTrips() throws {
        let ref = ReplyReference(messageId: "m1", authorName: "Bob", previewText: "", attachmentType: "video",
                                 attachmentFileUrl: "https://cdn.meeshy.me/v1.mp4")
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: JSONEncoder().encode(ref))
        #expect(decoded.attachmentFileUrl == "https://cdn.meeshy.me/v1.mp4")
    }

    @Test("une vidéo citée SANS vignette serveur porte l'adresse de son fichier")
    func videoWithoutThumbnailCarriesFileUrl() throws {
        let ref = try Self.reference(Self.quoted(attachment: Self.video))
        #expect(ref.attachmentThumbnailUrl == nil)
        #expect(ref.attachmentFileUrl == "https://cdn.meeshy.me/v1.mp4")
    }

    @Test("une pièce à VUE UNIQUE ne fait jamais voyager son adresse")
    func viewOnceAttachmentTravelsNoFileUrl() throws {
        let piece = #"{"id":"v1","mimeType":"video/mp4","isViewOnce":true,"fileUrl":"https://cdn.meeshy.me/v1.mp4"}"#
        let ref = try Self.reference(Self.quoted(attachment: piece))
        #expect(ref.attachmentIsProtected == true)
        #expect(ref.attachmentFileUrl == nil)
    }

    @Test("un message cité protégé ne fait jamais voyager l'adresse de sa pièce")
    func protectedMessageTravelsNoFileUrl() throws {
        let ref = try Self.reference(Self.quoted(attachment: Self.video, message: #""isViewOnce":true,"#))
        #expect(ref.attachmentIsProtected == true)
        #expect(ref.attachmentFileUrl == nil)
    }

    @Test("changer le texte garde l'adresse ; sceller la citation la retire")
    func followKeepsThenSealsTheAddress() {
        let ref = ReplyReference(messageId: "m1", authorName: "Bob", previewText: "a", attachmentType: "audio",
                                 attachmentFileUrl: "https://cdn.meeshy.me/a.m4a")
        #expect(ref.withPreviewText("b").attachmentFileUrl == "https://cdn.meeshy.me/a.m4a")
        #expect(ref.tombstoned(at: Date()).attachmentFileUrl == nil)
    }
}
