import Testing
import Foundation
@testable import MeeshySDK

/// #8320 — la citation d'un AUDIO se joue sur place.
///
/// La zone lecture ne s'arme que pour un audio qu'on a le DROIT de jouer
/// (`offersQuotedAudioPlayback(now:)`), et la citation porte, depuis la charge
/// servie, les pistes traduites qui permettent de jouer hors de la fenêtre
/// chargée la MÊME piste que le vocal d'origine.
@Suite("ReplyReference — la zone lecture d'un audio cité (#8320)")
struct QuotedAudioPlaybackTests {

    private static let now = Date(timeIntervalSince1970: 1_790_000_000)

    private static func reference(_ json: String) throws -> ReplyReference {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let reply = try decoder.decode(APIMessageReplyTo.self, from: Data(json.utf8))
        return reply.toReplyReference(currentUserId: "u-me", preferredLanguages: ["fr"])
    }

    private static func quoted(attachment: String, message extra: String = "") -> String {
        """
        {"id":"q1","content":"","originalLanguage":"en","senderId":"p-bob",\(extra)
         "sender":{"id":"p-bob","displayName":"Bob","userId":"u-bob"},
         "attachments":[\(attachment)]}
        """
    }

    private static let voice = """
    {"id":"a1","mimeType":"audio/mp4","duration":12000,"fileUrl":"https://cdn.meeshy.me/a1-en.m4a",
     "translations":{"fr":{"type":"audio","transcription":"Bonjour","url":"https://cdn.meeshy.me/a1-fr.m4a"},
                     "es":{"type":"audio","transcription":"Hola"}}}
    """

    @Test("un vocal cité arme la zone lecture et porte ses pistes TRADUITES")
    func voiceCarriesItsTracks() throws {
        let ref = try Self.reference(Self.quoted(attachment: Self.voice))
        #expect(ref.offersQuotedAudioPlayback(now: Self.now))
        #expect(ref.quotedAudioTracks?.originalLanguage == "en")
        #expect(ref.quotedAudioTracks?.urlsByLanguage == ["fr": "https://cdn.meeshy.me/a1-fr.m4a"])
    }

    @Test("la piste élue : la traduite quand elle existe, sinon l'original — jamais une autre")
    func electedTrackFallsBackToOriginal() throws {
        let ref = try Self.reference(Self.quoted(attachment: Self.voice))
        #expect(ref.quotedAudioUrl(forLanguage: "fr") == "https://cdn.meeshy.me/a1-fr.m4a")
        #expect(ref.quotedAudioUrl(forLanguage: "es") == "https://cdn.meeshy.me/a1-en.m4a")
        #expect(ref.quotedAudioUrl(forLanguage: nil) == "https://cdn.meeshy.me/a1-en.m4a")
    }

    @Test("une pièce à VUE UNIQUE n'offre pas la lecture et ne transporte aucune piste")
    func viewOncePieceOffersNothing() throws {
        let piece = #"{"id":"a1","mimeType":"audio/mp4","isViewOnce":true,"fileUrl":"https://cdn.meeshy.me/a1.m4a","translations":{"fr":{"url":"https://cdn.meeshy.me/a1-fr.m4a"}}}"#
        let ref = try Self.reference(Self.quoted(attachment: piece))
        #expect(!ref.offersQuotedAudioPlayback(now: Self.now))
        #expect(ref.quotedAudioTracks == nil)
        #expect(ref.quotedAudioUrl(forLanguage: "fr") == nil)
    }

    @Test("un message cité flouté ou chiffré n'offre pas la lecture")
    func protectedMessageOffersNothing() throws {
        for flag in [#""isBlurred":true,"#, #""isEncrypted":true,"#, #""isViewOnce":true,"#] {
            let ref = try Self.reference(Self.quoted(attachment: Self.voice, message: flag))
            #expect(!ref.offersQuotedAudioPlayback(now: Self.now))
            #expect(ref.quotedAudioTracks == nil)
        }
    }

    @Test("un message cité SUPPRIMÉ n'offre pas la lecture")
    func deletedMessageOffersNothing() throws {
        let ref = try Self.reference(Self.quoted(attachment: Self.voice, message: #""deletedAt":"2026-09-20T10:00:00Z","#))
        #expect(!ref.offersQuotedAudioPlayback(now: Self.now))
        #expect(ref.quotedAudioTracks == nil)
    }

    @Test("un éphémère EXPIRÉ n'offre plus la lecture ; encore vivant, il l'offre")
    func expiredEphemeralOffersNothing() throws {
        let expired = try Self.reference(Self.quoted(attachment: Self.voice, message: #""expiresAt":"2026-09-20T10:00:00Z","#))
        #expect(!expired.offersQuotedAudioPlayback(now: Self.now))
        let alive = try Self.reference(Self.quoted(attachment: Self.voice, message: #""expiresAt":"2027-09-20T10:00:00Z","#))
        #expect(alive.offersQuotedAudioPlayback(now: Self.now))
    }

    @Test("une photo citée n'arme pas la zone lecture")
    func photoIsNotPlayable() throws {
        let photo = #"{"id":"p1","mimeType":"image/jpeg","fileUrl":"https://cdn.meeshy.me/p1.jpg"}"#
        let ref = try Self.reference(Self.quoted(attachment: photo))
        #expect(!ref.offersQuotedAudioPlayback(now: Self.now))
        #expect(ref.quotedAudioTracks == nil)
    }

    @Test("les pistes et l'échéance survivent à l'aller-retour du cache ; un blob ancien se relit")
    func roundTripsAndLegacyDecodes() throws {
        let ref = try Self.reference(Self.quoted(attachment: Self.voice, message: #""expiresAt":"2027-09-20T10:00:00Z","#))
        let decoded = try JSONDecoder().decode(ReplyReference.self, from: JSONEncoder().encode(ref))
        #expect(decoded.quotedAudioTracks == ref.quotedAudioTracks)
        #expect(decoded.quotedExpiresAt == ref.quotedExpiresAt)
        let legacy = ##"{"messageId":"m9","authorName":"Bob","authorColor":"#31B6BA","previewText":"","isMe":false,"attachmentType":"audio","isStoryReply":false}"##
        let old = try JSONDecoder().decode(ReplyReference.self, from: Data(legacy.utf8))
        #expect(old.quotedAudioTracks == nil)
        #expect(old.offersQuotedAudioPlayback(now: Self.now))
    }
}
