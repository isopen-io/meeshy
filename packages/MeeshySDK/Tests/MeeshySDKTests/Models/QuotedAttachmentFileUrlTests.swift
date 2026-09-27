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

    // MARK: - La pièce reconstruite — ce que le plein écran ouvre hors fenêtre

    @Test("une vidéo citée se reconstruit avec son ancre, son fichier et ses faits")
    func reconstructsTheCitedVideo() throws {
        let json = """
        {"id":"q1","content":"","originalLanguage":"fr","senderId":"p-bob",
         "sender":{"id":"p-bob","displayName":"Bob","userId":"u-bob"},
         "attachmentReplyTo":{"attachmentId":"v2","kind":"video"},
         "attachments":[\(Self.video),{"id":"v2","mimeType":"video/quicktime","duration":900,"width":1080,"height":1920,"fileUrl":"https://cdn.meeshy.me/v2.mov"}]}
        """
        let piece = try #require(try Self.reference(json).quotedAttachment)
        #expect(piece.id == "v2")
        #expect(piece.messageId == "q1")
        #expect(piece.type == .video)
        #expect(piece.mimeType == "video/quicktime")
        #expect(piece.fileUrl == "https://cdn.meeshy.me/v2.mov")
        #expect(piece.duration == 900)
        #expect(piece.width == 1080)
        #expect(piece.height == 1920)
    }

    @Test("un vocal cité par son seul genre se reconstruit en audio")
    func reconstructsAnAudioFromItsKind() throws {
        let ref = ReplyReference(messageId: "m1", authorName: "Bob", previewText: "", attachmentType: "audio",
                                 attachmentFileUrl: "https://cdn.meeshy.me/a.m4a")
        let piece = try #require(ref.quotedAttachment)
        #expect(piece.type == .audio)
        #expect(piece.id == "quoted-m1", "sans ancre, un identifiant STABLE dérivé du message cité")
    }

    @Test("rien à reconstruire : protégé, sans fichier, document ou story")
    func reconstructsNothingDishonest() {
        let url = "https://cdn.meeshy.me/x"
        let cases: [ReplyReference] = [
            ReplyReference(messageId: "m1", authorName: "Bob", previewText: "", attachmentType: "video",
                           attachmentFileUrl: url, attachmentIsProtected: true),
            ReplyReference(messageId: "m2", authorName: "Bob", previewText: "", attachmentType: "video"),
            ReplyReference(messageId: "m3", authorName: "Bob", previewText: "", attachmentType: "pdf",
                           attachmentFileUrl: url),
            ReplyReference(messageId: "m4", authorName: "Story", previewText: "", attachmentType: "video",
                           attachmentFileUrl: url, isStoryReply: true)
        ]
        for ref in cases {
            #expect(ref.quotedAttachment == nil, "\(ref.messageId) ne doit rien reconstruire")
        }
    }

    @Test("le genre se lit sur le MIME des faits comme sur le rawValue court")
    func kindReadsBothForms() {
        #expect(ReplyReference(authorName: "B", previewText: "", attachmentType: "video/mp4").quotedMediaKind == .video)
        #expect(ReplyReference(authorName: "B", previewText: "", attachmentType: "audio").quotedMediaKind == .audio)
        #expect(ReplyReference(authorName: "B", previewText: "").quotedMediaKind == nil)
    }

    @Test("changer le texte garde l'adresse ; sceller la citation la retire")
    func followKeepsThenSealsTheAddress() {
        let ref = ReplyReference(messageId: "m1", authorName: "Bob", previewText: "a", attachmentType: "audio",
                                 attachmentFileUrl: "https://cdn.meeshy.me/a.m4a")
        #expect(ref.withPreviewText("b").attachmentFileUrl == "https://cdn.meeshy.me/a.m4a")
        #expect(ref.tombstoned(at: Date()).attachmentFileUrl == nil)
    }
}
