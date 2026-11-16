import XCTest
@testable import Meeshy
import MeeshySDK

/// #18721 — une conversation ouverte en tirant la bannière se REGARDE : elle
/// reste non lue jusqu'au premier acte qui compte (répondre, réagir, joindre).
@MainActor
final class PeekReadLawTests: XCTestCase {

    // MARK: - Quels actes lisent

    func test_marksRead_answeringActs_endThePeek() {
        XCTAssertTrue(PeekReadLaw.marksRead(on: .sendMessage))
        XCTAssertTrue(PeekReadLaw.marksRead(on: .sendAttachment))
        XCTAssertTrue(PeekReadLaw.marksRead(on: .toggleReaction))
    }

    func test_marksRead_lookingActs_keepThePeek() {
        XCTAssertFalse(PeekReadLaw.marksRead(on: .scroll))
        XCTAssertFalse(PeekReadLaw.marksRead(on: .playAudio))
        XCTAssertFalse(PeekReadLaw.marksRead(on: .openMedia))
    }

    func test_marksRead_everyActIsDecided() {
        let answering = ConversationAct.allCases.filter(PeekReadLaw.marksRead(on:))
        XCTAssertEqual(Set(answering.map { "\($0)" }), ["sendMessage", "sendAttachment", "toggleReaction"])
    }

    // MARK: - Ce qu'une bannière tirée regarde

    func test_peekTarget_messageInAConversation_isThatConversation() {
        XCTAssertEqual(PeekReadLaw.peekTarget(type: .newMessage, conversationId: "c1"), "c1")
        XCTAssertEqual(PeekReadLaw.peekTarget(type: .mention, conversationId: "c2"), "c2")
    }

    func test_peekTarget_withoutConversation_isNil() {
        XCTAssertNil(PeekReadLaw.peekTarget(type: .newMessage, conversationId: nil))
        XCTAssertNil(PeekReadLaw.peekTarget(type: .newMessage, conversationId: ""))
    }

    func test_peekTarget_notAMessage_isNil() {
        XCTAssertNil(PeekReadLaw.peekTarget(type: .postLike, conversationId: "c3"))
        XCTAssertNil(PeekReadLaw.peekTarget(type: .friendRequest, conversationId: "c3"))
    }

    // MARK: - La demande, de la bannière à l'écran

    func test_take_withoutRequest_reads() {
        XCTAssertEqual(PeekOpeningRequests.take("peek-law-none"), .read)
    }

    func test_take_afterRequest_peeksOnce() {
        let now = Date()
        PeekOpeningRequests.request("peek-law-once", at: now)
        XCTAssertEqual(PeekOpeningRequests.take("peek-law-once", at: now), .peek)
        XCTAssertEqual(PeekOpeningRequests.take("peek-law-once", at: now), .read, "une demande sert une fois")
    }

    func test_take_staleRequest_reads() {
        let now = Date()
        PeekOpeningRequests.request("peek-law-stale", at: now)
        let later = now.addingTimeInterval(PeekOpeningRequests.lifetime + 1)
        XCTAssertEqual(PeekOpeningRequests.take("peek-law-stale", at: later), .read)
    }

    func test_take_requestForAnotherConversation_reads() {
        PeekOpeningRequests.request("peek-law-other")
        XCTAssertEqual(PeekOpeningRequests.take("peek-law-mine"), .read)
        _ = PeekOpeningRequests.take("peek-law-other")
    }

    // MARK: - Le regard d'un écran

    func test_gate_byDefault_reads() {
        XCTAssertTrue(ConversationReadGate().marksReading)
    }

    func test_gate_openedOnRequest_peeks() {
        let gate = ConversationReadGate()
        PeekOpeningRequests.request("peek-law-gate")
        XCTAssertFalse(gate.opensReading("peek-law-gate"))
        XCTAssertFalse(gate.marksReading)
    }

    func test_gate_lookingAct_keepsThePeek() {
        let gate = ConversationReadGate()
        PeekOpeningRequests.request("peek-law-look")
        _ = gate.opensReading("peek-law-look")
        XCTAssertFalse(gate.noteActed(.scroll))
        XCTAssertFalse(gate.noteActed(.playAudio))
        XCTAssertFalse(gate.marksReading)
    }

    func test_gate_firstAnsweringAct_endsThePeekOnce() {
        let gate = ConversationReadGate()
        PeekOpeningRequests.request("peek-law-act")
        _ = gate.opensReading("peek-law-act")
        XCTAssertTrue(gate.noteActed(.toggleReaction))
        XCTAssertTrue(gate.marksReading)
        XCTAssertFalse(gate.noteActed(.sendMessage), "la lecture est déjà normale : rien à basculer")
    }

    func test_gate_inReading_noActSwitchesAnything() {
        let gate = ConversationReadGate()
        XCTAssertTrue(gate.opensReading("peek-law-read"))
        XCTAssertFalse(gate.noteActed(.sendMessage))
    }
}
