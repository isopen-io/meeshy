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

    // MARK: - Quitter la room : seulement au dernier écran (#9047)

    func test_conversationClosed_lastScreen_tellsToLeaveTheRoom() {
        let (sut, _, _) = makeSUT()
        sut.conversationOpened("conv-a")

        XCTAssertTrue(sut.conversationClosed("conv-a"))
    }

    func test_conversationClosed_staleInstanceOfSameConversation_keepsTheRoom() {
        let (sut, _, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.conversationOpened("conv-a")

        XCTAssertFalse(sut.conversationClosed("conv-a"),
                       "un ancien écran qui se démonte après la réouverture ne doit pas faire quitter la room")
    }

    func test_conversationClosed_afterAnotherConversationOpened_stillLeavesItsRoom() {
        let (sut, _, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.conversationOpened("conv-b")

        XCTAssertTrue(sut.conversationClosed("conv-a"))
    }

    func test_socketHandlerDeinit_leavesTheRoomOnlyWhenTheReporterSaysSo() throws {
        let source = AppSourceGuard.stripComments(try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/ViewModels/ConversationSocketHandler.swift"),
            encoding: .utf8))
        let deinitBody = try XCTUnwrap(source.range(of: "deinit {").map { source[$0.upperBound...] })
        let body = String(deinitBody.prefix(1200))
        XCTAssertFalse(body.contains("leaveRoom()"), "le départ immédiat effaçait la présence d'un écran rouvert")
        XCTAssertTrue(body.contains("if ConversationViewingReporter.shared.conversationClosed(id)"))
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

    // MARK: - L'écran couvert ou quitté (#9052)

    func test_screenDisappeared_coveredByTheGallery_stopsThenReappearing_restarts() {
        let (sut, emitter, _) = makeSUT()
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")

        sut.screenDisappeared("conv-a")
        sut.screenAppeared("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a"), .start("conv-a")])
    }

    func test_screenDisappeared_thenHandlerClosed_doesNotStopTwice() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-a")

        sut.screenDisappeared("conv-a")
        sut.conversationClosed("conv-a")

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a")])
    }

    func test_sameConversationPushedOverItself_oldScreenDisappearing_keepsViewing() {
        let (sut, emitter, _) = makeSUT()
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")

        sut.screenDisappeared("conv-a")

        XCTAssertFalse(emitter.calls.contains(.stop("conv-a")))
    }

    func test_backFromAnotherConversation_reannouncesTheOneUnderneath() {
        let (sut, emitter, _) = makeSUT()
        sut.screenAppeared("conv-a")
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-b")
        sut.screenDisappeared("conv-a")
        sut.conversationOpened("conv-b")

        sut.screenDisappeared("conv-b")
        sut.screenAppeared("conv-a")

        XCTAssertEqual(emitter.calls.suffix(2), [.stop("conv-b"), .start("conv-a")])
        XCTAssertEqual(sut.viewingConversationId, "conv-a")
    }

    func test_foregroundReturn_whileCovered_emitsNothing() {
        let (sut, emitter, _) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-a")
        sut.screenDisappeared("conv-a")

        sut.setForeground(false)
        sut.setForeground(true)

        XCTAssertEqual(emitter.calls, [.start("conv-a"), .stop("conv-a")])
    }

    func test_reconnect_whileCovered_emitsNothing() async {
        let (sut, emitter, connection) = makeSUT()
        sut.conversationOpened("conv-a")
        sut.screenAppeared("conv-a")
        sut.screenDisappeared("conv-a")
        let nothing = expectation(description: "no emission while covered")
        nothing.isInverted = true
        emitter.onCall = { _ in nothing.fulfill() }

        connection.send(true)

        await fulfillment(of: [nothing], timeout: 0.3)
    }

    func test_conversationHosts_reportTheScreenVisibility() throws {
        let views = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views")
        for host in ["RootLayers/RootRouteDestination.swift", "iPadRootView.swift", "GuestConversationContainer.swift"] {
            let source = AppSourceGuard.stripComments(try String(contentsOf: views.appendingPathComponent(host), encoding: .utf8))
            XCTAssertTrue(source.contains(".reportsConversationViewing("), "\(host) ne rapporte pas la visibilité de la conversation")
        }
    }

    func test_screenAppeared_beforeTheHandlerOpens_announcesNothing() {
        let (sut, emitter, _) = makeSUT()

        sut.screenAppeared("conv-a")

        XCTAssertEqual(emitter.calls, [])
    }
}
