import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// #8892 — côté émission : `viewing:start` quand l'écran de la conversation
/// est actif ET l'app au premier plan, `viewing:stop` à la fermeture ou au
/// passage en arrière-plan, ré-émission à chaque (re)connexion.
@MainActor
final class ConversationViewingReporterTests: XCTestCase {

    private final class SpyViewingEmitter: ConversationViewingEmitting {
        enum Call: Equatable {
            case start(String)
            case stop(String)
        }
        private(set) var calls: [Call] = []
        var onCall: ((Call) -> Void)?

        func emitViewingStart(conversationId: String) { record(.start(conversationId)) }
        func emitViewingStop(conversationId: String) { record(.stop(conversationId)) }

        private func record(_ call: Call) {
            calls.append(call)
            onCall?(call)
        }
    }

    private func makeSUT(
        isForeground: Bool = true,
        reconnections: PassthroughSubject<Void, Never> = PassthroughSubject<Void, Never>()
    ) -> (sut: ConversationViewingReporter, emitter: SpyViewingEmitter, connection: PassthroughSubject<Bool, Never>) {
        let emitter = SpyViewingEmitter()
        let connection = PassthroughSubject<Bool, Never>()
        let sut = ConversationViewingReporter(
            emitter: emitter,
            connection: connection.eraseToAnyPublisher(),
            reconnections: reconnections.eraseToAnyPublisher(),
            isForeground: isForeground
        )
        return (sut, emitter, connection)
    }

    func test_conversationOpened_inForeground_emitsStart() {
        let (sut, emitter, _) = makeSUT()

        sut.conversationOpened("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a")])
    }

    func test_conversationOpened_inBackground_emitsNothing() {
        let (sut, emitter, _) = makeSUT(isForeground: false)

        sut.conversationOpened("conv-a")

        XCTAssertEqual(emitter.calls, [])
    }

    func test_conversationOpened_anotherConversation_stopsThePreviousFirst() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")

        sut.conversationOpened("conv-b")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a"), .start("conv-b")])
    }

    func test_conversationClosed_current_emitsStop() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")

        sut.conversationClosed("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a")])
        XCTAssertNil(sut.viewingConversationId)
    }

    func test_conversationClosed_afterNextOpened_retractsNothing() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.conversationOpened("conv-b")

        sut.conversationClosed("conv-a")

        XCTAssertEqual(emitter.calls.last, .start("conv-b"))
        XCTAssertEqual(sut.viewingConversationId, "conv-b")
    }

    func test_conversationClosed_staleInstanceOfSameConversation_keepsViewing() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.conversationOpened("conv-a")

        sut.conversationClosed("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .start("conv-a")])
        XCTAssertEqual(sut.viewingConversationId, "conv-a")
    }

    func test_setForeground_false_stopsThenTrue_restarts() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")

        sut.setForeground(false)
        sut.setForeground(true)

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a"), .start("conv-a")])
    }

    func test_setForeground_withoutConversation_emitsNothing() {
        let (sut, emitter, _) = makeSUT()

        sut.setForeground(false)
        sut.setForeground(true)

        XCTAssertEqual(emitter.calls, [])
    }

    func test_reconnect_reannouncesTheActiveConversation() async {
        let (sut, emitter, connection) = makeSUT()
        sut.conversationOpened("conv-a")
        let reannounced = expectation(description: "viewing:start re-emitted on reconnect")
        emitter.onCall = { call in
            if call == .start("conv-a") { reannounced.fulfill() }
        }

        connection.send(false)
        connection.send(true)

        await fulfillment(of: [reannounced], timeout: 1)
        XCTAssertEqual(emitter.calls, [.start("conv-a"), .start("conv-a")])
    }

    func test_reconnect_inBackground_emitsNothing() async {
        let (sut, emitter, connection) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.setForeground(false)
        let nothing = expectation(description: "no emission while backgrounded")
        nothing.isInverted = true
        emitter.onCall = { _ in nothing.fulfill() }

        connection.send(true)

        await fulfillment(of: [nothing], timeout: 0.3)
        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a")])
    }

    func test_reconnect_withoutDisconnectTransition_reannouncesTheActiveConversation() async {
        let reconnections = PassthroughSubject<Void, Never>()
        let (sut, emitter, _) = makeSUT(reconnections: reconnections)
        sut.conversationOpened("conv-a")
        let reannounced = expectation(description: "viewing:start re-emitted on silent reconnect")
        emitter.onCall = { call in
            if call == .start("conv-a") { reannounced.fulfill() }
        }

        reconnections.send(())

        await fulfillment(of: [reannounced], timeout: 1)
        XCTAssertEqual(emitter.calls, [.start("conv-a"), .start("conv-a")])
    }
}
