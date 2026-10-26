import Foundation
import Testing
@testable import MeeshyE2EE

/// Qui a le droit de faire quoi par un signal (#13142, #13060) : l'auteur
/// AUTHENTIFIÉ d'un message — celui que libsignal a vu à sa réception — est le
/// seul à le modifier ou le supprimer pour tous ; la vue unique ne se consomme
/// que par mes appareils ; un signal ne touche qu'un message de SA conversation.
@Suite("La loi d'un signal reçu")
struct E2EESignalAuthorityTests {
    private let me = "moi"
    private let bob = "bob"
    private let mallory = "mallory"

    private func received(_ action: E2EESignalAction, from sender: String, in conversationId: String = "c1") -> E2EEReceivedSignal {
        E2EEReceivedSignal(
            signalId: "s1", conversationId: conversationId, senderUserId: sender, senderDeviceId: 1,
            signal: E2EESignal(conversationId: conversationId, sentAt: Date(), action: action).authored(by: sender, deviceId: 1)
        )
    }

    private func message(by author: String, in conversationId: String = "c1") -> E2EEPlaintextEntry {
        .readable(
            E2EEContent(text: "salut", language: nil, replyTo: nil, conversationId: conversationId, clientMessageId: nil, sentAt: Date()),
            senderUserId: author
        )
    }

    private func verdict(_ action: E2EESignalAction, from sender: String, target: E2EEPlaintextEntry?) -> E2EESignalVerdict {
        E2EESignalAuthority.verdict(for: received(action, from: sender), localUserId: me, target: target)
    }

    @Test func onlyTheAuthenticatedAuthorDeletesForEveryone() {
        #expect(verdict(.deleteForEveryone(target: "m1"), from: bob, target: message(by: bob)) == .apply)
        #expect(verdict(.deleteForEveryone(target: "m1"), from: mallory, target: message(by: bob)) == .reject(.notAuthor))
        #expect(verdict(.deleteForEveryone(target: "m1"), from: bob, target: message(by: me)) == .reject(.notAuthor))
        #expect(verdict(.deleteForEveryone(target: "m1"), from: me, target: message(by: me)) == .apply, "mon autre appareil supprime MON message")
    }

    @Test func aMessageWhoseAuthorIsUnknown_isDeletedByNobody() {
        #expect(verdict(.deleteForEveryone(target: "m1"), from: bob, target: .undecryptable) == .reject(.notAuthor))
        #expect(verdict(.edit(target: "m1", text: "x", language: nil), from: bob, target: .undecryptable) == .reject(.notAuthor))
    }

    @Test func aSignalAheadOfItsMessage_waitsForIt() {
        #expect(verdict(.deleteForEveryone(target: "m1"), from: bob, target: nil) == .awaitTarget)
        #expect(verdict(.reaction(target: "m1", emoji: "👍", removed: false), from: bob, target: nil) == .awaitTarget)
    }

    @Test func onlyTheAuthorEdits_andAnEmptyOrOversizedEditIsRefused() {
        #expect(verdict(.edit(target: "m1", text: "corrigé", language: "fr"), from: bob, target: message(by: bob)) == .apply)
        #expect(verdict(.edit(target: "m1", text: "corrigé", language: "fr"), from: mallory, target: message(by: bob)) == .reject(.notAuthor))
        #expect(verdict(.edit(target: "m1", text: "", language: nil), from: bob, target: message(by: bob)) == .reject(.malformed))
        let huge = String(repeating: "x", count: E2EESignalAuthority.maxEditedTextLength + 1)
        #expect(verdict(.edit(target: "m1", text: huge, language: nil), from: bob, target: message(by: bob)) == .reject(.malformed))
    }

    @Test func viewOnceIsConsumedOnlyByMyOwnDevice() {
        #expect(verdict(.viewOnceOpened(target: "m1"), from: me, target: message(by: bob)) == .apply)
        #expect(verdict(.viewOnceOpened(target: "m1"), from: bob, target: message(by: bob)) == .reject(.notOwnDevice))
    }

    @Test func aSignalNeverReachesAMessageOfAnotherConversation() {
        #expect(verdict(.reaction(target: "m1", emoji: "👍", removed: false), from: bob, target: message(by: bob, in: "c2")) == .reject(.targetElsewhere))
        #expect(verdict(.deleteForEveryone(target: "m1"), from: bob, target: message(by: bob, in: "c2")) == .reject(.targetElsewhere))
        #expect(verdict(.pin(target: "m1", pinned: true), from: bob, target: message(by: me, in: "c2")) == .reject(.targetElsewhere))
    }

    @Test func anyMemberReactsOrPins_withABoundedEmoji() {
        #expect(verdict(.reaction(target: "m1", emoji: "❤️", removed: false), from: bob, target: message(by: me)) == .apply)
        #expect(verdict(.pin(target: "m1", pinned: true), from: bob, target: message(by: me)) == .apply)
        #expect(verdict(.reaction(target: "m1", emoji: "", removed: false), from: bob, target: message(by: me)) == .reject(.malformed))
        #expect(verdict(.reaction(target: "m1", emoji: "a\nb", removed: false), from: bob, target: message(by: me)) == .reject(.malformed))
    }

    @Test func myOwnTypingIsAnEcho_aPeersIsShown() {
        #expect(verdict(.typing(active: true), from: me, target: nil) == .reject(.ownEcho))
        #expect(verdict(.typing(active: true), from: bob, target: nil) == .apply)
    }

    @Test func receiptsAreBounded_andAProgressIsAFinitePosition() {
        #expect(verdict(.receipt(.read, targets: ["m1"]), from: bob, target: nil) == .apply)
        #expect(verdict(.receipt(.read, targets: []), from: bob, target: nil) == .reject(.malformed))
        let tooMany = (0...E2EESignalAuthority.maxReceiptTargets).map { "m\($0)" }
        #expect(verdict(.receipt(.delivered, targets: tooMany), from: bob, target: nil) == .reject(.malformed))
        #expect(verdict(.readProgress(target: "m1", attachmentId: nil, position: .nan, completed: false), from: bob, target: message(by: me)) == .reject(.malformed))
        #expect(verdict(.readProgress(target: "m1", attachmentId: nil, position: 3, completed: true), from: bob, target: message(by: me)) == .apply)
    }

    @Test func anActionOfALaterVersionIsNeverApplied() {
        #expect(verdict(.unknown(kind: "poll-vote"), from: bob, target: message(by: me)) == .reject(.unsupported))
    }
}
