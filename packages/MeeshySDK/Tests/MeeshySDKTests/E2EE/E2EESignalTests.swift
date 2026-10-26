import Foundation
import Testing
@testable import MeeshyE2EE

/// Le format chiffré d'un SIGNAL (#13142) et le remplissage par paliers commun
/// aux messages et aux signaux. Référence : Signal, `SignalService.proto`
/// (`Content.dataMessage.reaction`, `.delete`, `editMessage`, `typingMessage`,
/// `receiptMessage`, `syncMessage.viewOnceOpen`) et le remplissage du clair
/// (`PushTransportDetails`) avant libsignal.
@Suite("Un signal chiffré est une structure versionnée, liée à sa conversation et à son auteur")
struct E2EESignalTests {
    private let sentAt = Date(timeIntervalSince1970: 1_790_000_000)

    private func signal(_ action: E2EESignalAction) -> E2EESignal {
        E2EESignal(conversationId: "c1", sentAt: sentAt, action: action)
    }

    @Test func everyActionRoundTrips() throws {
        let actions: [E2EESignalAction] = [
            .reaction(target: "m1", emoji: "👍", removed: false),
            .typing(active: true),
            .receipt(.read, targets: ["m1", "m2"]),
            .readProgress(target: "m1", attachmentId: "a1", position: 12.5, completed: false),
            .edit(target: "m1", text: "corrigé", language: "fr"),
            .deleteForEveryone(target: "m1"),
            .viewOnceOpened(target: "m1"),
            .pin(target: "m1", pinned: true),
        ]
        for action in actions {
            let authored = signal(action).authored(by: "alice", deviceId: 2)
            #expect(try E2EESignal.decoded(from: authored.encoded()) == authored)
        }
    }

    @Test func aSignalIsNeverReadAsAMessage_byAnOlderClient() throws {
        let data = try signal(.reaction(target: "m1", emoji: "🙈", removed: false)).authored(by: "alice", deviceId: 1).encoded()
        #expect(throws: (any Error).self) { try E2EEContent.decoded(from: data) }
        #expect(E2EEPayloadKind.of(data) == .signal)
    }

    @Test func aMessageIsReadAsAMessage() throws {
        let content = E2EEContent(text: "x", language: nil, replyTo: nil, conversationId: "c1", clientMessageId: nil, sentAt: sentAt)
        #expect(E2EEPayloadKind.of(try content.encoded()) == .message)
    }

    @Test func anActionOfALaterVersionIsKnownAsUnknown_neverHalfApplied() throws {
        let later = Data(#"{"s":1,"kind":"poll-vote","conversationId":"c1","sentAt":1,"authorUserId":"a","authorDeviceId":1}"#.utf8)
        #expect(try E2EESignal.decoded(from: later).action == .unknown(kind: "poll-vote"))
    }

    @Test func aFutureFormatIsRefused() {
        let future = Data(#"{"s":2,"kind":"typing","active":true,"conversationId":"c1","sentAt":1}"#.utf8)
        #expect(throws: E2EESignalError.unsupportedVersion(2)) { try E2EESignal.decoded(from: future) }
    }

    @Test func itIsAuthoredOnlyByTheDeviceItNames_andASignalWithoutAuthorIsNobodys() {
        let authored = signal(.typing(active: true)).authored(by: "alice", deviceId: 2)
        #expect(authored.isAuthored(by: "alice", deviceId: 2))
        #expect(!authored.isAuthored(by: "alice", deviceId: 3))
        #expect(!authored.isAuthored(by: "mallory", deviceId: 2))
        #expect(!signal(.typing(active: true)).isAuthored(by: "alice", deviceId: 2))
    }

    @Test func itBelongsOnlyToTheConversationItNames() {
        #expect(signal(.typing(active: false)).belongs(to: "c1"))
        #expect(!signal(.typing(active: false)).belongs(to: "c2"))
    }
}

@Suite("Le clair se remplit par paliers : une réaction ne se distingue pas d'un message court")
struct E2EEPaddingTests {
    @Test func eachPlaintextGrowsToTheFirstTierThatHoldsIt() {
        #expect(E2EEPadding.padded(Data(count: 1)).count == 256)
        #expect(E2EEPadding.padded(Data(count: 256)).count == 256)
        #expect(E2EEPadding.padded(Data(count: 257)).count == 1024)
        #expect(E2EEPadding.padded(Data(count: 3000)).count == 4096)
        #expect(E2EEPadding.padded(Data(count: 5000)).count == 16384)
    }

    /// Au-delà du dernier palier, le clair se remplit au multiple suivant de 16 Kio :
    /// sa taille exacte ne se lit jamais sur le fil.
    @Test func aLongPlaintextStillGrowsToACoarseStep() {
        #expect(E2EEPadding.padded(Data(count: 16385), recipients: 2).count == 32768)
        #expect(E2EEPadding.padded(Data(count: 20000), recipients: 2).count == 32768)
        #expect(E2EEPadding.padded(Data(count: 33000), recipients: 2).count == 49152)
    }

    /// Le palier est borné par le budget des enveloppes : un clair qui tenait sans
    /// remplissage tient encore, et tous ceux qui frôlent le plafond ont la même taille.
    @Test func aPlaintextIsNeverPushedPastTheEnvelopeBudget() {
        let twoDevices = E2EEPadding.ceiling(recipients: 2)
        #expect(twoDevices == 64 * 1024 - E2EEPadding.cipherOverhead)
        #expect(E2EEPadding.padded(Data(count: 50000), recipients: 2).count == twoDevices)
        #expect(E2EEPadding.padded(Data(count: 60000), recipients: 2).count == twoDevices)
        let thirtyTwoDevices = E2EEPadding.ceiling(recipients: 32)
        #expect(thirtyTwoDevices == 16 * 1024 - E2EEPadding.cipherOverhead)
        #expect(E2EEPadding.padded(Data(count: 5000), recipients: 32).count == thirtyTwoDevices)
        #expect(E2EEPadding.padded(Data(count: 70000), recipients: 2).count == 70000, "au-delà du plafond, il ne part pas : rien ne s'ajoute")
    }

    @Test func aPaddedMessageStillDecodes_includingByAnOlderClient() throws {
        let content = E2EEContent(text: "court", language: "fr", replyTo: nil, conversationId: "c1", clientMessageId: "cid", sentAt: Date())
        let padded = E2EEPadding.padded(try content.encoded())
        #expect(padded.count == 256)
        #expect(try E2EEContent.decoded(from: padded) == content)
    }

    @Test func aPaddedSignalStillDecodes() throws {
        let signal = E2EESignal(conversationId: "c1", sentAt: Date(), action: .reaction(target: "m1", emoji: "❤️", removed: true))
            .authored(by: "alice", deviceId: 1)
        let padded = E2EEPadding.padded(try signal.encoded())
        #expect(try E2EESignal.decoded(from: padded) == signal)
        #expect(E2EEPayloadKind.of(padded) == .signal)
    }

    @Test func aReactionAndAShortMessageHaveTheSamePlaintextLength() throws {
        let reaction = E2EESignal(conversationId: String(repeating: "c", count: 24), sentAt: Date(), action: .reaction(target: String(repeating: "m", count: 24), emoji: "👍", removed: false))
            .authored(by: String(repeating: "a", count: 24), deviceId: 1)
        let message = E2EEContent(text: "ok", language: "fr", replyTo: nil, conversationId: String(repeating: "c", count: 24), clientMessageId: "cid_1", sentAt: Date())
            .authored(by: String(repeating: "a", count: 24), deviceId: 1)
        #expect(E2EEPadding.padded(try reaction.encoded()).count == E2EEPadding.padded(try message.encoded()).count)
    }
}
