import Foundation
import Testing
@testable import MeeshyE2EE

@Suite("Le contenu chiffré est une structure versionnée, liée à sa conversation")
struct E2EEContentTests {
    private let content = E2EEContent(
        text: "Bonjour", language: "fr", replyTo: nil, conversationId: "c1", clientMessageId: "cid_1",
        sentAt: Date(timeIntervalSince1970: 1_790_000_000)
    )

    @Test func itIsCanonicalJSON_withSortedKeys_andNoAbsentField() throws {
        let json = String(decoding: try content.encoded(), as: UTF8.self)
        #expect(json == #"{"clientMessageId":"cid_1","conversationId":"c1","language":"fr","sentAt":1790000000000,"text":"Bonjour","v":1}"#)
    }

    @Test func itRoundTrips() throws {
        #expect(try E2EEContent.decoded(from: content.encoded()) == content)
    }

    @Test func aFutureVersion_isNotHalfRead() {
        let future = Data(#"{"v":2,"text":"x","sentAt":1}"#.utf8)
        #expect(throws: E2EEContentError.unsupportedVersion(2)) { try E2EEContent.decoded(from: future) }
    }

    @Test func fieldsOfALaterLotAreIgnored() throws {
        let later = Data(#"{"v":1,"text":"x","sentAt":1,"conversationId":"c1","mentions":["u"]}"#.utf8)
        #expect(try E2EEContent.decoded(from: later).text == "x")
    }

    @Test func itBelongsOnlyToTheConversationItNames() {
        #expect(content.belongs(to: "c1"))
        #expect(!content.belongs(to: "c2"))
        let unnamed = E2EEContent(text: "x", language: nil, replyTo: nil, conversationId: nil, clientMessageId: nil, sentAt: Date())
        #expect(!unnamed.belongs(to: "c1"))
    }
}
