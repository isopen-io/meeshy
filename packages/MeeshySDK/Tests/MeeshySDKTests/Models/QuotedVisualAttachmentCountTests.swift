import Testing
import Foundation
@testable import MeeshySDK

/// #9915 — LE « +N » D'UNE CITATION COMPTE TOUTES LES TUILES DU MESSAGE CITÉ.
///
/// La passerelle ne sert que QUATRE pièces du message cité (`take: 4`) et dit à
/// côté combien de photos et vidéos il porte (`visualAttachmentCount`). Une
/// citation de six photos affichait « +3 » après l'écho serveur, là où la
/// bannière du composeur disait « +5 ».
@Suite("ReplyReference — le compte servi des tuiles du message cité (#9915)")
struct QuotedVisualAttachmentCountTests {

    private static func photo(_ rang: Int) -> String {
        #"{"id":"a\#(rang)","mimeType":"image/jpeg","thumbnailUrl":"https://cdn.meeshy.me/a\#(rang)-t.jpg"}"#
    }

    private static func quoted(count: Int?, extra: String = "") -> String {
        let served = count.map { "\"visualAttachmentCount\":\($0)," } ?? ""
        let pieces = (1...4).map(photo).joined(separator: ",")
        return """
        {"id":"q1","content":"six photos","originalLanguage":"fr","senderId":"p-bob",\(extra)
         \(served)"attachments":[\(pieces)]}
        """
    }

    private static func reference(_ json: String) throws -> ReplyReference {
        let reply = try JSONDecoder().decode(APIMessageReplyTo.self, from: Data(json.utf8))
        return reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
    }

    @Test("six tuiles servies en quatre pièces + le compte : la citation en compte six, « +5 »")
    func servedCountWins() throws {
        let ref = try Self.reference(Self.quoted(count: 6))
        #expect(ref.quotedPieceCount == 6)
        #expect(ref.quotedExtraPieceCount == 5)
    }

    @Test("sans compte servi (ancienne passerelle), les pièces servies font foi")
    func withoutServedCountFallsBackToServedPieces() throws {
        #expect(try Self.reference(Self.quoted(count: nil)).quotedPieceCount == 4)
    }

    @Test("un compte servi plus petit que les pièces ne les retranche pas")
    func servedCountNeverShrinks() throws {
        #expect(try Self.reference(Self.quoted(count: 2)).quotedPieceCount == 4)
    }

    @Test("un message protégé ne dit pas combien de pièces il cache")
    func protectedMessageCountsNothing() throws {
        #expect(try Self.reference(Self.quoted(count: 6, extra: #""isViewOnce":true,"#)).quotedPieceCount == nil)
    }
}
