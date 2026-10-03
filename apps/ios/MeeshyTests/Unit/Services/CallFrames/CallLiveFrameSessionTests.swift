import Combine
import MeeshySDK
import XCTest
@testable import Meeshy

/// LE CHOIX DU CADRE EN DIRECT (#9214) — optimiste chez moi, envoyé avec le prénom que je
/// partage, retiré si la passerelle refuse ; le choix de l'autre remplace le mien ; un autre
/// appel repart sans cadre.
@MainActor
final class CallLiveFrameSessionTests: XCTestCase {

    private final class MockSocket: CallLiveFrameSocketProviding, @unchecked Sendable {
        var selectError: Error?
        var selections: [(callId: String, frameId: String?, texts: CallLiveFrameTexts?)] = []
        var onSelect: (@MainActor () -> Void)?

        var callLiveFrameEvents: AnyPublisher<CallLiveFrameSelectedEvent, Never> { Empty().eraseToAnyPublisher() }

        func selectCallLiveFrame(callId: String, frameId: String?, texts: CallLiveFrameTexts?) async throws {
            selections.append((callId, frameId, texts))
            if let onSelect { await onSelect() }
            if let selectError { throw selectError }
        }
    }

    private final class MockTexts: CallFrameTextsProviding {
        var immediate = CallFrameTexts(groupName: nil, isGroup: false, date: "3 oct. 2026", accentHex: nil)
        var resolved = CallFrameTexts(groupName: nil, isGroup: false, date: "3 oct. 2026", accentHex: nil)
        var resolveCount = 0

        func immediateTexts(for call: CallFrameCallContext) -> CallFrameTexts { immediate }

        func texts(for call: CallFrameCallContext) async -> CallFrameTexts {
            resolveCount += 1
            return resolved
        }
    }

    private struct Env {
        let sut: CallLiveFrameSession
        let socket: MockSocket
        let texts: MockTexts
        let notices: Notices
    }

    private final class Notices {
        var messages: [String] = []
    }

    private let context = CallFrameCallContext(conversationId: "conv-1", knownGroupTitle: nil, isGroupCall: false)

    private func makeEnv(name: String? = "Awa") -> Env {
        let socket = MockSocket()
        let texts = MockTexts()
        let notices = Notices()
        let sut = CallLiveFrameSession(
            socket: socket,
            textsProvider: texts,
            myName: { name },
            notify: { notices.messages.append($0) },
            wait: { _ in },
            events: Empty().eraseToAnyPublisher()
        )
        return Env(sut: sut, socket: socket, texts: texts, notices: notices)
    }

    private func makeBoundEnv(name: String? = "Awa") async -> Env {
        let env = makeEnv(name: name)
        await env.sut.bind(callId: "call-1", context: context)
        return env
    }

    private func event(callId: String = "call-1", frameId: String?, name: String? = nil) -> CallLiveFrameSelectedEvent {
        CallLiveFrameSelectedEvent(callId: callId, userId: "u-peer", frameId: frameId, texts: name.map { CallLiveFrameTexts(name: $0) })
    }

    // MARK: - Choisir

    func test_select_bound_appliesAtOnceAndSendsTheSharedName() async {
        let env = await makeBoundEnv()
        var seenBeforeAck: String?
        env.socket.onSelect = { [weak sut = env.sut] in seenBeforeAck = sut?.frameId }

        await env.sut.select("corporate.conseil.duo")

        XCTAssertEqual(seenBeforeAck, "corporate.conseil.duo")
        XCTAssertEqual(env.sut.frameId, "corporate.conseil.duo")
        XCTAssertEqual(env.socket.selections.count, 1)
        XCTAssertEqual(env.socket.selections.first?.callId, "call-1")
        XCTAssertEqual(env.socket.selections.first?.texts?.name, "Awa")
        XCTAssertTrue(env.notices.messages.isEmpty)
    }

    func test_select_nil_clearsTheFrameAndSendsTheClear() async {
        let env = await makeBoundEnv()
        await env.sut.select("corporate.conseil.duo")

        await env.sut.select(nil)

        XCTAssertNil(env.sut.frameId)
        XCTAssertEqual(env.socket.selections.count, 2)
        XCTAssertEqual(env.socket.selections.last.map { $0.frameId == nil }, true)
    }

    func test_select_refused_rollsBackAndTellsTheUser() async {
        let env = await makeBoundEnv()
        await env.sut.select("corporate.conseil.duo")
        env.socket.selectError = CallControlRefusal(code: "PERMISSION_DENIED")

        await env.sut.select("hors-norme.pop-art")

        XCTAssertEqual(env.sut.frameId, "corporate.conseil.duo")
        XCTAssertEqual(env.notices.messages, [CallLiveFrameCopy.refused])
    }

    func test_select_refusedAfterThePeerChose_keepsThePeerChoice() async {
        let env = await makeBoundEnv()
        env.socket.selectError = CallControlRefusal(code: "RATE_LIMITED")
        env.socket.onSelect = { [weak sut = env.sut] in
            sut?.receive(CallLiveFrameSelectedEvent(callId: "call-1", userId: "u-peer", frameId: "hors-norme.pop-art"))
        }

        await env.sut.select("corporate.conseil.duo")

        XCTAssertEqual(env.sut.frameId, "hors-norme.pop-art")
        XCTAssertTrue(env.notices.messages.isEmpty)
    }

    func test_select_withoutCall_sendsNothing() async {
        let env = makeEnv()

        await env.sut.select("corporate.conseil.duo")

        XCTAssertNil(env.sut.frameId)
        XCTAssertTrue(env.socket.selections.isEmpty)
    }

    func test_select_foreignId_sendsNothing() async {
        let env = await makeBoundEnv()

        await env.sut.select("../etc/passwd")

        XCTAssertNil(env.sut.frameId)
        XCTAssertTrue(env.socket.selections.isEmpty)
    }

    // MARK: - Recevoir

    func test_receive_peerChoice_replacesMineAndNamesThePeer() async {
        let env = await makeBoundEnv()
        await env.sut.select("corporate.conseil.duo")

        env.sut.receive(event(frameId: "hors-norme.pop-art", name: "  Karim "))

        XCTAssertEqual(env.sut.frameId, "hors-norme.pop-art")
        XCTAssertEqual(env.sut.remoteSharedName, "Karim")
    }

    func test_receive_peerClear_removesTheFrame() async {
        let env = await makeBoundEnv()
        env.sut.receive(event(frameId: "hors-norme.pop-art"))

        env.sut.receive(event(frameId: nil))

        XCTAssertNil(env.sut.frameId)
    }

    func test_receive_otherCall_isIgnored() async {
        let env = await makeBoundEnv()

        env.sut.receive(event(callId: "call-2", frameId: "hors-norme.pop-art", name: "Karim"))

        XCTAssertNil(env.sut.frameId)
        XCTAssertNil(env.sut.remoteSharedName)
    }

    func test_receive_foreignId_isIgnored() async {
        let env = await makeBoundEnv()

        env.sut.receive(event(frameId: "Not A Frame"))

        XCTAssertNil(env.sut.frameId)
    }

    func test_receive_longSharedName_isCapped() async {
        let env = await makeBoundEnv()

        env.sut.receive(event(frameId: "hors-norme.pop-art", name: String(repeating: "k", count: 200)))

        XCTAssertEqual(env.sut.remoteSharedName?.count, CallLiveFrameTexts.maxLength)
    }

    // MARK: - L'appel

    func test_bind_otherCall_forgetsTheFrameAndTheSharedName() async {
        let env = await makeBoundEnv()
        env.sut.receive(event(frameId: "hors-norme.pop-art", name: "Karim"))

        await env.sut.bind(callId: "call-2", context: context)

        XCTAssertNil(env.sut.frameId)
        XCTAssertNil(env.sut.remoteSharedName)
        XCTAssertEqual(env.sut.callId, "call-2")
    }

    func test_bind_sameCall_keepsTheFrame() async {
        let env = await makeBoundEnv()
        env.sut.receive(event(frameId: "hors-norme.pop-art"))

        await env.sut.bind(callId: "call-1", context: context)

        XCTAssertEqual(env.sut.frameId, "hors-norme.pop-art")
    }

    func test_bind_resolvesTheTextsFromTheCache() async {
        let env = makeEnv()
        env.texts.resolved = CallFrameTexts(groupName: nil, isGroup: false, date: "4 oct. 2026", accentHex: nil)

        await env.sut.bind(callId: "call-1", context: context)

        XCTAssertEqual(env.sut.texts?.date, "4 oct. 2026")
        XCTAssertEqual(env.texts.resolveCount, 1)
    }

    func test_leaveDuo_clearsLocallyWithoutSending() async {
        let env = await makeBoundEnv()
        env.sut.receive(event(frameId: "hors-norme.pop-art", name: "Karim"))

        env.sut.leaveDuo()

        XCTAssertNil(env.sut.frameId)
        XCTAssertNil(env.sut.remoteSharedName)
        XCTAssertTrue(env.socket.selections.isEmpty)
    }

    func test_refreshTexts_sameTexts_publishesNothing() async {
        let env = await makeBoundEnv()
        var publications = 0
        let subscription = env.sut.$texts.dropFirst().sink { _ in publications += 1 }

        await env.sut.refreshTexts()

        XCTAssertEqual(publications, 0)
        subscription.cancel()
    }
}
