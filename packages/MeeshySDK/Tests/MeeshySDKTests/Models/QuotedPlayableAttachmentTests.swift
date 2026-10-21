import Testing
import Foundation
@testable import MeeshySDK

/// #9890 — l'aperçu plein écran d'une citation du composeur joue le FICHIER cité.
///
/// Les bannières de réponse n'ouvraient que `attachmentThumbnailUrl` : le plein
/// écran « vidéo » donnait une VIGNETTE (jpeg) à un lecteur. La pièce que le
/// lecteur commun joue est la pièce reconstruite de la citation, présentée au
/// moteur partagé comme un média qu'il sait lire — il ne lit que le cache vidéo,
/// et un son cité y est téléchargé comme tel.
@Suite("ReplyReference — la pièce jouable d'une citation (#9890)")
struct QuotedPlayableAttachmentTests {

    private static let url = "https://cdn.meeshy.me/q"

    private static func reference(
        _ kind: String, fileUrl: String? = QuotedPlayableAttachmentTests.url,
        protected: Bool? = nil, story: Bool = false, mime: String? = nil, anchor: String? = nil
    ) -> ReplyReference {
        ReplyReference(
            messageId: "m1", authorName: "Bob", previewText: "", attachmentType: kind, attachmentId: anchor,
            attachmentFileUrl: fileUrl, attachmentIsProtected: protected, isStoryReply: story,
            attachmentFacts: mime.map {
                ReplyReference.QuotedAttachmentFacts(
                    thumbHash: nil, width: 720, height: 1280, durationMs: 4200,
                    fileSize: 2048, pageCount: nil, mimeType: $0)
            })
    }

    @Test("une vidéo citée se joue depuis son fichier, avec ses faits")
    func videoIsPlayedFromItsFile() throws {
        let piece = try #require(Self.reference("video", mime: "video/quicktime").quotedPlayableAttachment)
        #expect(piece.fileUrl == Self.url)
        #expect(piece.type == .video)
        #expect(piece.mimeType == "video/quicktime", "un MIME vidéo exact est gardé")
        #expect(piece.width == 720)
        #expect(piece.duration == 4200)
    }

    @Test("un son cité est présenté au moteur partagé comme un média qu'il lit")
    func audioIsPresentedToTheSharedEngine() throws {
        let piece = try #require(Self.reference("audio", mime: "audio/mpeg").quotedPlayableAttachment)
        #expect(piece.fileUrl == Self.url)
        #expect(piece.type == .video,
                "le moteur partagé ne lit que le cache vidéo : un son y doit être rangé comme tel")
    }

    @Test("un son cité par son seul genre se joue aussi")
    func audioByKindOnly() throws {
        let piece = try #require(Self.reference("audio").quotedPlayableAttachment)
        #expect(piece.type == .video)
        #expect(piece.id == "quoted-m1")
    }

    @Test("rien à jouer : image, document, story, protégé, sans fichier")
    func nothingDishonestIsPlayable() {
        let cases: [ReplyReference] = [
            Self.reference("image"),
            Self.reference("pdf"),
            Self.reference("video", story: true),
            Self.reference("video", protected: true),
            Self.reference("audio", protected: true),
            Self.reference("video", fileUrl: nil),
            Self.reference("audio", fileUrl: ""),
        ]
        for reference in cases {
            #expect(reference.quotedPlayableAttachment == nil, "\(reference.attachmentType ?? "?")")
        }
    }

    @Test("la pièce reconstruite ordinaire reste ce qu'elle était")
    func theOrdinaryReconstructionIsUntouched() throws {
        let piece = try #require(Self.reference("audio", mime: "audio/mpeg").quotedAttachment)
        #expect(piece.type == .audio, "seule la projection jouable change le rangement")
    }

    // MARK: - Ce que la lecture d'une citation rapporte au serveur

    @Test("une vidéo citée ancrée rapporte son visionnage, sur sa vraie pièce")
    func anchoredVideoReportsItsWatch() {
        #expect(Self.reference("video", anchor: "att1").quotedPlaybackReportsConsumption)
    }

    @Test("un son cité ne rapporte rien : le moteur partagé l'annoncerait « vu » comme une vidéo")
    func audioNeverReportsAWatch() {
        #expect(!Self.reference("audio", anchor: "att1").quotedPlaybackReportsConsumption)
        #expect(!Self.reference("audio", mime: "audio/mpeg", anchor: "att1").quotedPlaybackReportsConsumption)
    }

    @Test("sans ancre, la pièce porte un identifiant dérivé que le serveur ne connaît pas : rien ne part")
    func unanchoredPieceReportsNothing() {
        #expect(!Self.reference("video").quotedPlaybackReportsConsumption)
        #expect(!Self.reference("video", anchor: "").quotedPlaybackReportsConsumption)
    }

    @Test("rien à jouer, rien à rapporter")
    func nothingPlayableReportsNothing() {
        #expect(!Self.reference("video", protected: true, anchor: "att1").quotedPlaybackReportsConsumption)
        #expect(!Self.reference("video", fileUrl: nil, anchor: "att1").quotedPlaybackReportsConsumption)
        #expect(!Self.reference("image", anchor: "att1").quotedPlaybackReportsConsumption)
    }
}
