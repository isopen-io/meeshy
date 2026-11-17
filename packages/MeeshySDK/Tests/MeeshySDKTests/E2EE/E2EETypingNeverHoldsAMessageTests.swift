import Foundation
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// **Une frappe ne retient jamais un message** (R-1 de l'audit de #19078, #18946).
///
/// Depuis IOS-08, messages et signaux passent un à un par la file de
/// l'appareil. La frappe est réémise toutes les trois secondes ; sur un réseau
/// lent, chaque scellement tenait la file deux allers-retours vers l'annuaire,
/// et le message touché « Envoyer » attendait derrière des frappes périmées —
/// ou derrière une requête pendue une minute. Seule la dernière frappe en
/// attente vaut, un message passe devant, et il interrompt celle en cours.
/// Les scellements restent un à la fois : la course d'IOS-08 ne se rouvre pas.
final class E2EETypingNeverHoldsAMessageTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)
    private let carol = String(repeating: "c3", count: 12)

    // MARK: - La file

    func test_aMessage_interruptsTheTypingInFlight_andPassesTheWaitingOne() async throws {
        let queue = E2EESealingQueue()
        let log = TurnLog()
        let first = Task { try await queue.runTyping { try await log.hang("frappe 1") } }
        try await expectEventually { log.contains("frappe 1 commencée") }
        let older = Task { try await queue.runTyping { log.note("frappe 2") } }
        try await expectEventually { queue.waiting.typing }
        let newest = Task { try await queue.runTyping { log.note("frappe 3") } }
        let superseded = await older.result

        let message = Task { await queue.run { log.note("message") } }
        try await expectEventually(timeout: 5) { log.contains("message") }
        await message.value
        _ = try await newest.value
        let interrupted = await first.result

        XCTAssertThrowsError(try superseded.get(), "une frappe plus récente la remplace : elle ne part pas")
        XCTAssertThrowsError(try interrupted.get(), "interrompue, elle cède sa place à la plus récente")
        XCTAssertEqual(log.entries, ["frappe 1 commencée", "frappe 1 interrompue", "message", "frappe 3"])
    }

    func test_anInterruptedTyping_goesAfterTheMessage_whenNoNewerOneWaits() async throws {
        let queue = E2EESealingQueue()
        let log = TurnLog()
        let typing = Task { try await queue.runTyping { try await log.hangOnce("frappe") } }
        try await expectEventually { log.contains("frappe commencée") }

        await queue.run { log.note("message") }
        _ = try await typing.value

        XCTAssertEqual(log.entries, ["frappe commencée", "frappe interrompue", "message", "frappe reprise"])
    }

    func test_aMessage_isNeverInterrupted_andMessagesKeepTheirOrder() async throws {
        let queue = E2EESealingQueue()
        let log = TurnLog()
        let gate = TurnGate()
        let first = Task {
            await queue.run {
                log.note("message 1 commencé")
                await gate.wait()
                log.note(Task.isCancelled ? "message 1 interrompu" : "message 1 fini")
            }
        }
        try await expectEventually { log.contains("message 1 commencé") }
        let second = Task { await queue.run { log.note("message 2") } }
        try await expectEventually { queue.waiting.seals == 1 }
        let typing = Task { try await queue.runTyping { log.note("frappe") } }
        try await expectEventually { queue.waiting.typing }

        gate.open()
        await first.value
        await second.value
        _ = try await typing.value

        XCTAssertEqual(log.entries, ["message 1 commencé", "message 1 fini", "message 2", "frappe"])
    }

    // MARK: - Le scelleur, sur un annuaire lent

    func test_fiveTypingsThenAMessage_onASlowDirectory_theMessageGoesSecond() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await E2EETestPeer.enroll(carol, on: server)
        let slow = SlowDevicesDirectory(inner: aliceIPhone.directory, slowFor: bob)
        let sealer = E2EEMessageSealer(local: aliceIPhone.device, cipher: aliceIPhone.cipher, directory: slow, approvals: aliceIPhone.approvals)
        let queue = E2EESealingQueue.shared(for: aliceIPhone.device)
        let typing = E2EESignal(conversationId: "conv1", sentAt: Date(), action: .typing(active: true))
        let hello = aliceIPhone.content("salut", in: "conv2")
        let (bobId, carolId) = (bob, carol)

        let first = Task { try await sealer.seal(typing, to: bobId) }
        try await expectEventually { slow.calls.contains(bobId) }
        let later = (0..<4).map { _ in Task { try await sealer.seal(typing, to: bobId) } }
        try await expectEventually { queue.waiting.typing }
        let message = Task { try await sealer.seal(hello, to: carolId) }
        let sealedMessage = try await message.value
        var typingOutcomes = [await first.result]
        for task in later { typingOutcomes.append(await task.result) }

        XCTAssertTrue(sealedMessage.envelopes.contains { $0.userId == carolId })
        XCTAssertEqual(slow.calls.firstIndex(of: carolId), 1, "le message part juste après la frappe qu'il interrompt")
        XCTAssertEqual(typingOutcomes.filter { (try? $0.get()) != nil }.count, 1, "seule la dernière frappe part")
        XCTAssertEqual(slow.calls.filter { $0 == bobId }.count, 2, "la frappe interrompue et la dernière, jamais les quatre autres")
    }

    // MARK: - Outils

    private func expectEventually(timeout: TimeInterval = 5, _ condition: () -> Bool) async throws {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() {
            guard Date() < deadline else { return XCTFail("la condition n'est jamais venue") }
            try await Task.sleep(nanoseconds: 5_000_000)
        }
    }
}

/// Ce qui a pris son tour, dans l'ordre.
private final class TurnLog: @unchecked Sendable {
    private let lock = NSLock()
    private var recorded: [String] = []
    private var hung = false

    func note(_ entry: String) { lock.withLock { recorded.append(entry) } }
    func contains(_ entry: String) -> Bool { lock.withLock { recorded.contains(entry) } }
    var entries: [String] { lock.withLock { recorded } }

    /// Une requête pendue : elle ne rend la main qu'à l'annulation.
    func hang(_ name: String) async throws {
        note("\(name) commencée")
        do {
            try await Task.sleep(nanoseconds: 60_000_000_000)
        } catch {
            note("\(name) interrompue")
            throw error
        }
    }

    /// Pendue la première fois seulement : la reprise passe.
    func hangOnce(_ name: String) async throws {
        let first = lock.withLock { () -> Bool in
            defer { hung = true }
            return !hung
        }
        guard first else { return note("\(name) reprise") }
        try await hang(name)
    }
}

/// Une porte que le témoin ouvre ; elle ne s'ouvre pas à l'annulation.
private final class TurnGate: @unchecked Sendable {
    private let lock = NSLock()
    private var opened = false
    private var waiting: CheckedContinuation<Void, Never>?

    func wait() async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            let passes = lock.withLock { () -> Bool in
                guard !opened else { return true }
                waiting = continuation
                return false
            }
            if passes { continuation.resume() }
        }
    }

    func open() {
        let resumed = lock.withLock { () -> CheckedContinuation<Void, Never>? in
            opened = true
            defer { waiting = nil }
            return waiting
        }
        resumed?.resume()
    }
}

/// La liste des appareils d'UN correspondant prend deux secondes, et
/// s'interrompt à l'annulation de sa tâche, comme une requête réseau.
private final class SlowDevicesDirectory: ForwardingE2EEDirectory {
    private let slowFor: String
    private let lock = NSLock()
    private var requested: [String] = []

    init(inner: FakeE2EEDirectoryClient, slowFor: String) {
        self.slowFor = slowFor
        super.init(inner: inner)
    }

    var calls: [String] { lock.withLock { requested } }

    override func devices(userId: String) async throws -> E2EEUserDevices {
        lock.withLock { requested.append(userId) }
        if userId == slowFor { try await Task.sleep(nanoseconds: 2_000_000_000) }
        return try await inner.devices(userId: userId)
    }
}
