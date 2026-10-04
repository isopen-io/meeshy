import Combine
import MeeshySDK
import XCTest
@testable import Meeshy

/// LE CADRE EN DIRECT (#9214, #9287) — appliqué chez moi tout de suite et PROPOSÉ à l'autre
/// avec le prénom que je partage ; une proposition reçue ne remplace jamais mon cadre : je
/// l'applique ou je la refuse, et l'autre l'apprend ; un autre appel repart sans cadre.
@MainActor
final class CallLiveFrameSessionTests: XCTestCase {

    private final class MockSocket: CallLiveFrameSocketProviding, @unchecked Sendable {
        var selectError: Error?
        var selections: [(callId: String, frameId: String?, texts: CallLiveFrameTexts?, reply: CallLiveFrameReply?)] = []
        var onSelect: (@MainActor () -> Void)?

        var callLiveFrameEvents: AnyPublisher<CallLiveFrameSelectedEvent, Never> { Empty().eraseToAnyPublisher() }

        func selectCallLiveFrame(callId: String, frameId: String?, texts: CallLiveFrameTexts?, reply: CallLiveFrameReply?) async throws {
            selections.append((callId, frameId, texts, reply))
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

    private func event(callId: String = "call-1", frameId: String?, name: String? = nil, reply: CallLiveFrameReply? = nil) -> CallLiveFrameSelectedEvent {
        CallLiveFrameSelectedEvent(callId: callId, userId: "u-peer", frameId: frameId, texts: name.map { CallLiveFrameTexts(name: $0) }, reply: reply)
    }

    // MARK: - Appliquer chez moi, proposer à l'autre (#9287)

    func test_apply_bound_showsAtOnceAndProposesWithTheSharedName() async {
        let env = await makeBoundEnv()
        var seenBeforeAck: String?
        env.socket.onSelect = { [weak sut = env.sut] in seenBeforeAck = sut?.frameId }

        await env.sut.apply("corporate.conseil.duo")

        XCTAssertEqual(seenBeforeAck, "corporate.conseil.duo")
        XCTAssertEqual(env.sut.frameId, "corporate.conseil.duo")
        XCTAssertEqual(env.socket.selections.count, 1)
        XCTAssertEqual(env.socket.selections.first?.callId, "call-1")
        XCTAssertEqual(env.socket.selections.first?.frameId, "corporate.conseil.duo")
        XCTAssertNil(env.socket.selections.first?.reply)
        XCTAssertEqual(env.socket.selections.first?.texts?.name, "Awa")
        XCTAssertEqual(env.sut.sentProposal, "corporate.conseil.duo")
        XCTAssertTrue(env.notices.messages.isEmpty)
    }

    func test_apply_nil_removesMineAndWithdrawsTheProposal() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")

        await env.sut.apply(nil)

        XCTAssertNil(env.sut.frameId)
        XCTAssertNil(env.sut.sentProposal)
        XCTAssertEqual(env.socket.selections.count, 2)
        XCTAssertEqual(env.socket.selections.last.map { $0.frameId == nil }, true)
    }

    func test_apply_nil_afterTheProposalWasAnswered_sendsNothing() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")
        env.sut.receive(event(frameId: "corporate.conseil.duo", reply: .accepted))

        await env.sut.apply(nil)

        XCTAssertNil(env.sut.frameId)
        XCTAssertEqual(env.socket.selections.count, 1)
    }

    func test_apply_proposalRefusedByTheGateway_keepsMyFrameAndSaysSo() async {
        let env = await makeBoundEnv()
        env.socket.selectError = CallControlRefusal(code: "RATE_LIMITED")

        await env.sut.apply("hors-norme.pop-art")

        XCTAssertEqual(env.sut.frameId, "hors-norme.pop-art")
        XCTAssertNil(env.sut.sentProposal)
        XCTAssertEqual(env.notices.messages, [CallLiveFrameCopy.notProposed])
    }

    func test_apply_theFrameThePeerAlreadyShows_proposesNothing() async {
        let env = await makeBoundEnv()
        env.sut.receive(event(frameId: "hors-norme.pop-art"))
        await env.sut.accept()

        await env.sut.apply("hors-norme.pop-art")

        XCTAssertEqual(env.socket.selections.map { $0.reply }, [.accepted])
    }

    func test_apply_withoutCall_sendsNothing() async {
        let env = makeEnv()

        await env.sut.apply("corporate.conseil.duo")

        XCTAssertNil(env.sut.frameId)
        XCTAssertTrue(env.socket.selections.isEmpty)
    }

    func test_apply_foreignId_sendsNothing() async {
        let env = await makeBoundEnv()

        await env.sut.apply("../etc/passwd")

        XCTAssertNil(env.sut.frameId)
        XCTAssertTrue(env.socket.selections.isEmpty)
    }

    // MARK: - Recevoir une proposition : jamais imposée

    func test_receive_proposal_neverReplacesMine_andWaitsForMyAnswer() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")

        env.sut.receive(event(frameId: "hors-norme.pop-art", name: "  Karim "))

        XCTAssertEqual(env.sut.frameId, "corporate.conseil.duo")
        XCTAssertEqual(env.sut.proposal, CallLiveFrameProposal(frameId: "hors-norme.pop-art", from: "Karim"))
        XCTAssertEqual(env.sut.remoteSharedName, "Karim")
    }

    func test_accept_appliesTheProposalAndTellsThePeer() async {
        let env = await makeBoundEnv()
        env.sut.receive(event(frameId: "hors-norme.pop-art"))

        await env.sut.accept()

        XCTAssertEqual(env.sut.frameId, "hors-norme.pop-art")
        XCTAssertNil(env.sut.proposal)
        XCTAssertEqual(env.socket.selections.last?.frameId, "hors-norme.pop-art")
        XCTAssertEqual(env.socket.selections.last?.reply, .accepted)
    }

    func test_decline_keepsMineAndTellsThePeer() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")
        env.sut.receive(event(frameId: "hors-norme.pop-art"))

        await env.sut.decline()

        XCTAssertEqual(env.sut.frameId, "corporate.conseil.duo")
        XCTAssertNil(env.sut.proposal)
        XCTAssertEqual(env.socket.selections.last?.frameId, "hors-norme.pop-art")
        XCTAssertEqual(env.socket.selections.last?.reply, .declined)
    }

    func test_receive_proposalOfTheFrameIAlreadyShow_acceptsSilently() async {
        let env = await makeBoundEnv()
        await env.sut.apply("hors-norme.pop-art")

        env.sut.receive(event(frameId: "hors-norme.pop-art"))
        await env.sut.settle()

        XCTAssertNil(env.sut.proposal)
        XCTAssertEqual(env.socket.selections.last?.reply, .accepted)
    }

    func test_receive_withdrawal_dismissesTheProposalAndKeepsMine() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")
        env.sut.receive(event(frameId: "hors-norme.pop-art"))

        env.sut.receive(event(frameId: nil))

        XCTAssertNil(env.sut.proposal)
        XCTAssertEqual(env.sut.frameId, "corporate.conseil.duo")
    }

    func test_receive_reply_toMyProposal_tellsMeAndClosesIt() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")

        env.sut.receive(event(frameId: "corporate.conseil.duo", name: "Karim", reply: .declined))

        XCTAssertNil(env.sut.sentProposal)
        XCTAssertEqual(env.sut.frameId, "corporate.conseil.duo")
        XCTAssertEqual(env.sut.answer, CallLiveFrameAnswer(frameId: "corporate.conseil.duo", reply: .declined, from: "Karim"))
        XCTAssertTrue(env.notices.messages.isEmpty)
    }

    func test_receive_reply_toAnOlderProposal_isIgnored() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")

        env.sut.receive(event(frameId: "hors-norme.pop-art", reply: .accepted))

        XCTAssertEqual(env.sut.sentProposal, "corporate.conseil.duo")
        XCTAssertNil(env.sut.answer)
    }

    func test_dismissAnswer_clearsIt() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")
        env.sut.receive(event(frameId: "corporate.conseil.duo", reply: .accepted))

        env.sut.dismissAnswer()

        XCTAssertNil(env.sut.answer)
    }

    func test_receive_otherCall_isIgnored() async {
        let env = await makeBoundEnv()

        env.sut.receive(event(callId: "call-2", frameId: "hors-norme.pop-art", name: "Karim"))

        XCTAssertNil(env.sut.proposal)
        XCTAssertNil(env.sut.remoteSharedName)
    }

    func test_receive_foreignId_isIgnored() async {
        let env = await makeBoundEnv()

        env.sut.receive(event(frameId: "Not A Frame"))

        XCTAssertNil(env.sut.proposal)
    }

    func test_receive_longSharedName_isCapped() async {
        let env = await makeBoundEnv()

        env.sut.receive(event(frameId: "hors-norme.pop-art", name: String(repeating: "k", count: 200)))

        XCTAssertEqual(env.sut.remoteSharedName?.count, CallLiveFrameTexts.maxLength)
    }

    // MARK: - L'appel

    func test_bind_otherCall_forgetsTheFrameTheProposalAndTheSharedName() async {
        let env = await makeBoundEnv()
        await env.sut.apply("corporate.conseil.duo")
        env.sut.receive(event(frameId: "hors-norme.pop-art", name: "Karim"))

        await env.sut.bind(callId: "call-2", context: context)

        XCTAssertNil(env.sut.frameId)
        XCTAssertNil(env.sut.proposal)
        XCTAssertNil(env.sut.sentProposal)
        XCTAssertNil(env.sut.remoteSharedName)
        XCTAssertEqual(env.sut.callId, "call-2")
    }

    func test_bind_sameCall_keepsTheFrame() async {
        let env = await makeBoundEnv()
        await env.sut.apply("hors-norme.pop-art")

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
        await env.sut.apply("corporate.conseil.duo")
        env.sut.receive(event(frameId: "hors-norme.pop-art", name: "Karim"))

        env.sut.leaveDuo()

        XCTAssertNil(env.sut.frameId)
        XCTAssertNil(env.sut.proposal)
        XCTAssertNil(env.sut.remoteSharedName)
        XCTAssertEqual(env.socket.selections.count, 1)
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
