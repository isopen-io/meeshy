import Foundation
import Testing
import MeeshySDK
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
        let future = Data(#"{"v":3,"text":"x","sentAt":1}"#.utf8)
        #expect(throws: E2EEContentError.unsupportedVersion(3)) { try E2EEContent.decoded(from: future) }
    }

    // MARK: - Pièces jointes (#10789)

    private static let photo = E2EEAttachmentPointer(
        id: "6add00000000000000000a01", key: Data(repeating: 7, count: 64), digest: Data(repeating: 9, count: 32),
        size: 123_456, contentType: "image/jpeg", fileName: "IMG_0001.jpg", kind: .image,
        width: 4032, height: 3024, durationMs: nil, thumbHash: "1QcSHQRnh493V4dIh4eXh1h4kJUI",
        transcript: nil, thumbnail: nil
    )

    private func withPhoto() -> E2EEContent {
        E2EEContent(
            text: "regarde", language: "fr", replyTo: nil, conversationId: "c1", clientMessageId: "cid_1",
            sentAt: Date(timeIntervalSince1970: 1_790_000_000), attachments: [Self.photo]
        )
    }

    /// Un lecteur v1 IGNORE un champ inconnu : il perdrait la pièce en silence.
    /// Un contenu qui en porte s'écrit donc v2, qu'un lecteur v1 refuse.
    @Test func aContentWithAttachments_isVersion2() throws {
        #expect(withPhoto().v == 2)
        #expect(content.v == 1, "un texte seul reste lisible par les lecteurs v1")
        let json = try JSONSerialization.jsonObject(with: withPhoto().encoded()) as? [String: Any]
        #expect(json?["v"] as? Int == 2)
    }

    @Test func aContentWithAttachments_roundTrips_andCarriesThePointerInside() throws {
        let decoded = try E2EEContent.decoded(from: withPhoto().encoded())
        #expect(decoded == withPhoto())
        #expect(decoded.attachments?.first == Self.photo)
        #expect(decoded.attachments?.first?.fileName == "IMG_0001.jpg")
    }

    @Test func anEmptyAttachmentList_staysVersion1_andIsNotWritten() throws {
        let empty = E2EEContent(text: "x", language: nil, replyTo: nil, conversationId: "c1", clientMessageId: nil, sentAt: Date(), attachments: [])
        #expect(empty.v == 1)
        #expect(!String(decoding: try empty.encoded(), as: UTF8.self).contains("attachments"))
    }

    @Test func authoringKeepsTheAttachments() {
        #expect(withPhoto().authored(by: "u1", deviceId: 2).attachments == [Self.photo])
    }

    /// Un genre que cette version ne connaît pas se lit comme un fichier, jamais comme une image.
    @Test func anUnknownKind_isReadAsAFile() throws {
        let json = Data(#"{"id":"a","scheme":"client-v1","key":"AA==","digest":"AA==","size":1,"contentType":"model/usdz","kind":"hologram"}"#.utf8)
        #expect(try JSONDecoder().decode(E2EEAttachmentPointer.self, from: json).kind == .file)
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
