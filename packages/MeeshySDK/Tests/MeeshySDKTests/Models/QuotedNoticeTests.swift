import Testing
import Foundation
@testable import MeeshySDK

/// #17441 — un avis AFFICHÉ (appel, arrivée, arrivées regroupées, départ
/// annoncé) se cite, et sa citation se dit dans la langue du LECTEUR, jamais
/// dans le repli français que la passerelle stocke en `content`. Miroir de
/// `quotedNoticeText` (`packages/shared/utils/quotable-notice.ts`).
@Suite("QuotedNotice — la citation d'un avis, dans la langue du lecteur")
struct QuotedNoticeTests {

    private static let english: [String: String] = [
        "call.active": "Ongoing call",
        "call.audio": "Voice call",
        "call.video": "Video call",
        "call.missed": "Missed call",
        "call.declined": "Declined call",
        "call.cancelled": "Cancelled call",
        "call.unanswered": "Unanswered call",
        "call.failed": "Call interrupted",
        "system.member.added": "{actor} added {target}",
        "system.member.left": "{actor} left the conversation",
        "system.member.joined": "{actor} joined the conversation",
        "system.members.arrived.one": "{first} just arrived — say hi",
    ]

    private static let strings = ConversationPreviewStrings(language: "en") { english[$0.rawValue] ?? "⟦\($0.rawValue)⟧" }

    private static func notice(_ json: String) throws -> QuotedNotice {
        try JSONDecoder().decode(QuotedNotice.self, from: Data(json.utf8))
    }

    private static func call(_ extra: String = "") -> String {
        """
        {"kind":"call","callId":"c-1","initiatorId":"u-ama","callType":"audio","outcome":"missed",
         "durationSeconds":0,"bytesTotal":null,"bytesEstimated":false,"networkQuality":null\(extra)}
        """
    }

    @Test("un appel manqué reçu se dit « manqué » ; émis par le lecteur, « sans réponse » ou « annulé »")
    func missedCall() throws {
        #expect(try Self.notice(Self.call()).text(viewerId: "u-kofi", strings: Self.strings) == "Missed call")
        #expect(try Self.notice(Self.call()).text(viewerId: "u-ama", strings: Self.strings) == "Unanswered call")
        #expect(try Self.notice(Self.call(",\"endedByInitiator\":true")).text(viewerId: "u-ama", strings: Self.strings) == "Cancelled call")
    }

    @Test("un appel abouti se dit par son média et sa durée ; un appel en cours, « en cours »")
    func completedAndLiveCall() throws {
        let video = Self.call().replacingOccurrences(of: "\"audio\"", with: "\"video\"")
            .replacingOccurrences(of: "\"missed\"", with: "\"completed\"")
            .replacingOccurrences(of: "\"durationSeconds\":0", with: "\"durationSeconds\":272")
        #expect(try Self.notice(video).text(viewerId: "u-kofi", strings: Self.strings) == "Video call · 04:32")
        let live = Self.call().replacingOccurrences(of: "\"kind\":\"call\"", with: "\"kind\":\"call-live\"")
        #expect(try Self.notice(live).text(viewerId: "u-kofi", strings: Self.strings) == "Ongoing call")
    }

    @Test("une arrivée, des arrivées regroupées et un départ se disent dans la langue du lecteur")
    func joinArrivalsAndLeft() throws {
        let joined = #"{"kind":"member-joined","participantId":"p-1","displayName":"Bruno","isAnonymous":false,"viaShareLink":false}"#
        #expect(try Self.notice(joined).text(viewerId: "u", strings: Self.strings) == "Bruno joined the conversation")
        let added = #"{"kind":"member-joined","participantId":"p-1","displayName":"Bruno","isAnonymous":false,"viaShareLink":false,"addedBy":{"participantId":"p-2","displayName":"Demo"}}"#
        #expect(try Self.notice(added).text(viewerId: "u", strings: Self.strings) == "Demo added Bruno")
        let arrived = #"{"kind":"members-arrived","arrivals":[{"participantId":"p-1","displayName":"Aïcha"}],"count":1,"windowStartedAt":"2026-11-10T08:00:00.000Z"}"#
        #expect(try Self.notice(arrived).text(viewerId: "u", strings: Self.strings) == "Aïcha just arrived — say hi")
        let left = #"{"kind":"member-left","actor":{"participantId":"p-1","displayName":"Bob"}}"#
        #expect(try Self.notice(left).text(viewerId: "u", strings: Self.strings) == "Bob left the conversation")
    }

    @Test("un avis non citable ou illisible ne se décode pas : la citation retombe sur son texte")
    func notQuotable() {
        let removed = #"{"kind":"member-removed","actor":{"participantId":"a","displayName":"A"},"target":{"participantId":"b","displayName":"B"}}"#
        #expect((try? Self.notice(removed)) == nil)
        #expect((try? Self.notice(#"{"kind":"member-left"}"#)) == nil)
        #expect((try? Self.notice(#"{"kind":"content-capture"}"#)) == nil)
    }

    @Test("la citation servie porte l'avis sous `notice` : le texte cité suit la langue lentée")
    func servedQuoteIsLocalized() throws {
        let json = """
        {"id":"q1","content":"Appel manqué","senderId":"p-ama",
         "sender":{"id":"p-ama","displayName":"Ama","userId":"u-ama"},"notice":\(Self.call())}
        """
        let reply = try JSONDecoder().decode(APIMessageReplyTo.self, from: Data(json.utf8))
        let localized = reply.toReplyReference(currentUserId: "u-kofi", preferredLanguages: ["en"], noticeStrings: Self.strings)
        #expect(localized.previewText == "Missed call")
        let legacy = reply.toReplyReference(currentUserId: "u-kofi", preferredLanguages: ["en"], noticeStrings: nil)
        #expect(legacy.previewText == "Appel manqué")
    }
}
