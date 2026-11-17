import Foundation
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// **Deux envois chiffrés simultanés ne cassent plus une session** (IOS-08 et
/// IOSX-06, #18946).
///
/// Le toucher « Envoyer » émet À LA FOIS la fin de frappe et le message : deux
/// scellements vers un appareil sans session lisaient chacun « pas de
/// session », effaçaient puis ouvraient chacun la leur. Si l'appareil du
/// correspondant traitait la seconde avant la première, il répondait sur une
/// session que l'iPhone avait EFFACÉE : réponse illisible, acquittée, perdue.
/// Et l'annuaire pouvait répondre un bundle qu'on ne lui avait pas demandé :
/// la session saine de cet autre appareil était effacée.
final class E2EESealingConcurrencyTests: XCTestCase {
    private let alice = String(repeating: "a1", count: 12)
    private let bob = String(repeating: "b2", count: 12)
    private let carol = String(repeating: "c3", count: 12)
    private let conversation = "conv1"

    // MARK: - La file

    func test_theQueue_runsOneBodyAtATime() async {
        let queue = E2EESealingQueue()
        let ledger = ConcurrencyLedger()

        await withTaskGroup(of: Void.self) { group in
            for index in 0..<40 {
                group.addTask {
                    await queue.run {
                        ledger.enter(index)
                        for _ in 0..<3 { await Task.yield() }
                        ledger.leave()
                    }
                }
            }
        }

        XCTAssertEqual(ledger.maximumConcurrency, 1)
        XCTAssertEqual(ledger.entries.count, 40)
    }

    func test_twoSealersOfTheSameDevice_shareOneQueue() {
        let device = E2EELocalDevice(userId: alice, deviceId: 3, registrationId: 42)

        XCTAssertTrue(E2EESealingQueue.shared(for: device) === E2EESealingQueue.shared(for: device))
        XCTAssertFalse(E2EESealingQueue.shared(for: device)
            === E2EESealingQueue.shared(for: E2EELocalDevice(userId: alice, deviceId: 4, registrationId: 42)))
    }

    // MARK: - Fin de frappe et message, au premier envoi

    func test_typingAndMessageSealedTogether_openOneSession_andBobsReplyOpens() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let gated = GatedBundlesDirectory(inner: aliceIPhone.directory)
        let sealer = E2EEMessageSealer(local: aliceIPhone.device, cipher: aliceIPhone.cipher, directory: gated, approvals: aliceIPhone.approvals)
        let typingEnded = E2EESignal(conversationId: conversation, sentAt: Date(), action: .typing(active: false))
        let hello = aliceIPhone.content("salut")
        let peer = bob

        async let typing = sealer.seal(typingEnded, to: peer)
        let typingHeld = await waitUntil(timeout: 5) { gated.heldCount == 1 }
        XCTAssertTrue(typingHeld)
        async let message = sealer.seal(hello, to: peer)
        // L'ancien scelleur laissait le message réserver SON bundle pendant que la frappe attendait le sien.
        _ = await waitUntil(timeout: 0.3) { gated.heldCount == 2 }
        gated.releaseOldest()
        let sealedTyping = try await typing
        gated.releaseOldest()
        let sealedMessage = try await message

        XCTAssertEqual(gated.bundleRequests, 1, "UNE session s'ouvre ; le second scellement la trouve")
        try server.relay(sealedTyping, from: alice, conversationId: conversation, participants: [alice, bob], messageId: "s1")
        try server.relay(sealedMessage, from: alice, conversationId: conversation, participants: [alice, bob], messageId: "m1")
        let toBob = server.pending(userId: bob, deviceId: bobIPhone.device.deviceId)
        XCTAssertEqual(toBob.count, 2)
        _ = bobIPhone.opener.open(toBob[1])
        _ = bobIPhone.opener.open(toBob[0])
        let reply = try await bobIPhone.sealer.seal(bobIPhone.content("réponse", clientMessageId: "cid_2"), to: alice)
        try server.relay(reply, from: bob, conversationId: conversation, participants: [alice, bob], messageId: "m2")
        let toAlice = try XCTUnwrap(server.pending(userId: alice, deviceId: aliceIPhone.device.deviceId).first)
        guard case .opened(let opened) = aliceIPhone.opener.open(toAlice) else {
            return XCTFail("la réponse de Bob part sur une session que l'iPhone a remplacée")
        }
        XCTAssertEqual(opened.content.text, "réponse")
    }

    // MARK: - Mes appareils, cibles de tous les scellements

    func test_sealsToTwoPeersTogether_openMyApprovedDeviceOnce() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let aliceMac = try await E2EETestPeer.enroll(alice, on: server)
        _ = try await E2EETestPeer.enroll(bob, on: server)
        _ = try await E2EETestPeer.enroll(carol, on: server)
        try aliceIPhone.approve(aliceMac)
        let slow = SlowBundlesDirectory(inner: aliceIPhone.directory)
        let sealer = E2EEMessageSealer(local: aliceIPhone.device, cipher: aliceIPhone.cipher, directory: slow, approvals: aliceIPhone.approvals)

        let toBobContent = aliceIPhone.content("à Bob")
        let toCarolContent = aliceIPhone.content("à Carol", in: "conv2")
        let (bobId, carolId) = (bob, carol)

        async let toBob = sealer.seal(toBobContent, to: bobId)
        async let toCarol = sealer.seal(toCarolContent, to: carolId)
        let sealedToBob = try await toBob
        let sealedToCarol = try await toCarol
        let sealed = [sealedToBob, sealedToCarol]

        XCTAssertEqual(slow.requests(for: alice), 1, "la session vers mon Mac ne s'ouvre qu'une fois, d'une conversation à l'autre")
        XCTAssertTrue(sealed.allSatisfy { $0.envelopes.contains { $0.userId == self.alice && $0.deviceId == aliceMac.device.deviceId } })
    }

    // MARK: - IOSX-06 : la session s'ouvre sur ce qu'on a DEMANDÉ

    func test_aBundleServedForAnotherDevice_leavesThatDevicesSessionIntact() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobPhone = try await E2EETestPeer.enroll(bob, on: server)
        let first = try await aliceIPhone.sealer.seal(aliceIPhone.content("un"), to: bob)
        try server.relay(first, from: alice, conversationId: conversation, participants: [alice, bob], messageId: "m1")
        _ = bobPhone.opener.open(try XCTUnwrap(server.pending(userId: bob, deviceId: bobPhone.device.deviceId).first))
        let reply = try await bobPhone.sealer.seal(bobPhone.content("deux", clientMessageId: "cid_2"), to: alice)
        try server.relay(reply, from: bob, conversationId: conversation, participants: [alice, bob], messageId: "m2")
        _ = aliceIPhone.opener.open(try XCTUnwrap(server.pending(userId: alice, deviceId: aliceIPhone.device.deviceId).first))
        let bobTablet = try await E2EETestPeer.enroll(bob, on: server)
        let phoneId = bobPhone.device.deviceId
        let misdirected = RewrittenBundlesDirectory(inner: aliceIPhone.directory) { inner, userId, _ in
            try await inner.bundles(userId: userId, deviceIds: [phoneId])
        }
        let sealer = E2EEMessageSealer(local: aliceIPhone.device, cipher: aliceIPhone.cipher, directory: misdirected, approvals: aliceIPhone.approvals)

        let sealed = try await sealer.seal(aliceIPhone.content("trois", clientMessageId: "cid_3"), to: bob)

        let toPhone = try XCTUnwrap(sealed.envelopes.first { $0.deviceId == bobPhone.device.deviceId })
        XCTAssertEqual(toPhone.type, E2EECiphertext.whisperType, "la session acquittée du téléphone continue : rien ne l'a remplacée")
        XCTAssertFalse(sealed.envelopes.contains { $0.deviceId == bobTablet.device.deviceId })
    }

    func test_aBundleOfAnotherGeneration_opensNoSession() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobPhone = try await E2EETestPeer.enroll(bob, on: server)
        let regenerated = RewrittenBundlesDirectory(inner: aliceIPhone.directory) { inner, userId, deviceIds in
            let served = try await inner.bundles(userId: userId, deviceIds: deviceIds)
            return E2EEUserBundles(userId: served.userId, devices: served.devices.map { bundle in
                E2EEDeviceBundle(
                    deviceId: bundle.deviceId, registrationId: bundle.registrationId % 0x3FFF + 1,
                    identityKey: bundle.identityKey, signedPreKey: bundle.signedPreKey,
                    kyberPreKey: bundle.kyberPreKey, preKey: bundle.preKey
                )
            })
        }
        let sealer = E2EEMessageSealer(local: aliceIPhone.device, cipher: aliceIPhone.cipher, directory: regenerated, approvals: aliceIPhone.approvals)

        do {
            _ = try await sealer.seal(aliceIPhone.content("un"), to: bob)
            XCTFail("un bundle d'une autre génération que la liste n'ouvre rien")
        } catch {
            XCTAssertEqual(error as? E2EESealError, .recipientHasNoDevice(userId: bob))
        }
        XCTAssertFalse(try aliceIPhone.cipher.hasSession(with: bobPhone.device.address))
    }

    func test_aPeerReenrolledBetweenTheListAndTheBundles_isListedAgain_andTheFirstMessageLeaves() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobPhone = try await E2EETestPeer.enroll(bob, on: server)
        let stale = StaleFirstListingDirectory(inner: aliceIPhone.directory, peer: bob)
        let sealer = E2EEMessageSealer(local: aliceIPhone.device, cipher: aliceIPhone.cipher, directory: stale, approvals: aliceIPhone.approvals)

        let sealed = try await sealer.seal(aliceIPhone.content("premier"), to: bob)

        XCTAssertTrue(sealed.envelopes.contains {
            $0.deviceId == bobPhone.device.deviceId && $0.registrationId == bobPhone.device.registrationId
        }, "R-4 : jamais « votre correspondant doit mettre Meeshy à jour » pour une course de réenrôlement")
        XCTAssertEqual(stale.listings, 2, "la liste se relit une fois, jamais plus")
    }

    // MARK: - R-2 : l'effacement Sesame passe par la file

    func test_aSesameRefusal_neverForgetsASessionUnderASealInProgress() async throws {
        let server = FakeE2EEServer()
        let aliceIPhone = try await E2EETestPeer.enroll(alice, on: server)
        let bobPhone = try await E2EETestPeer.enroll(bob, on: server)
        let gated = GatedOwnDevicesDirectory(inner: aliceIPhone.directory, owner: alice)
        let sealer = E2EEMessageSealer(local: aliceIPhone.device, cipher: aliceIPhone.cipher, directory: gated, approvals: aliceIPhone.approvals)
        _ = try await sealer.seal(aliceIPhone.content("ouverture"), to: bob)
        let refusal = OneSesameRefusal(stale: [E2EEDeviceRef(userId: bob, deviceId: bobPhone.device.deviceId)])
        let (peer, first, second) = (bob, aliceIPhone.content("un"), aliceIPhone.content("deux", clientMessageId: "cid_2"))

        let refused = Task { try await sealer.sealAndDeliver(first, to: peer) { sealed in try await refusal.deliver(sealed) } }
        let deliveryHeld = await waitUntil(timeout: 5) { refusal.isHolding }
        XCTAssertTrue(deliveryHeld)
        gated.arm()
        let inProgress = Task { try await sealer.seal(second, to: peer) }
        let sealHeld = await waitUntil(timeout: 5) { gated.isHolding }
        XCTAssertTrue(sealHeld, "le second scellement tient la file, la session de Bob retenue")
        refusal.release()
        _ = await waitUntil(timeout: 5) { refusal.hasRefused }
        try await Task.sleep(nanoseconds: 200_000_000)
        gated.release()

        let sealedSecond = try await inProgress.value
        _ = try await refused.value

        XCTAssertTrue(sealedSecond.envelopes.contains { $0.userId == peer }, "le 409 n'efface la session qu'une fois le scellement en cours terminé")
    }

    // MARK: - Outils

    private func waitUntil(timeout: TimeInterval, _ condition: () -> Bool) async -> Bool {
        let deadline = Date().addingTimeInterval(timeout)
        while !condition() {
            guard Date() < deadline else { return false }
            try? await Task.sleep(nanoseconds: 5_000_000)
        }
        return true
    }
}

/// Qui est entré, et combien à la fois.
private final class ConcurrencyLedger: @unchecked Sendable {
    private let lock = NSLock()
    private var inside = 0
    private var peak = 0
    private var order: [Int] = []

    func enter(_ index: Int) {
        lock.withLock {
            inside += 1
            peak = max(peak, inside)
            order.append(index)
        }
    }

    func leave() { lock.withLock { inside -= 1 } }
    var maximumConcurrency: Int { lock.withLock { peak } }
    var entries: [Int] { lock.withLock { order } }
}

/// L'annuaire d'un appareil, que chaque témoin ne réécrit que sur la route des bundles.
class ForwardingE2EEDirectory: E2EEDirectoryClientProviding, @unchecked Sendable {
    let inner: FakeE2EEDirectoryClient

    init(inner: FakeE2EEDirectoryClient) {
        self.inner = inner
    }

    func enroll(_ request: E2EEEnrollDeviceRequest) async throws -> E2EEEnrollment { try await inner.enroll(request) }
    func publishKeys(deviceId: UInt32, _ request: E2EEPublishKeysRequest) async throws -> E2EEPreKeyStock {
        try await inner.publishKeys(deviceId: deviceId, request)
    }
    func preKeyStock() async throws -> E2EEPreKeyStock { try await inner.preKeyStock() }
    func retireDevice(deviceId: UInt32, registrationId: UInt32) async throws -> E2EERetirement {
        try await inner.retireDevice(deviceId: deviceId, registrationId: registrationId)
    }
    func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        try await inner.bundles(userId: userId, deviceIds: deviceIds)
    }
    func devices(userId: String) async throws -> E2EEUserDevices { try await inner.devices(userId: userId) }
    func ownDevices() async throws -> [E2EEOwnDeviceDetails] { try await inner.ownDevices() }
    func envelopes(after cursor: String?, limit: Int?) async throws -> E2EEEnvelopePage {
        try await inner.envelopes(after: cursor, limit: limit)
    }
    func acknowledge(envelopeIds: [String]) async throws -> E2EEAckResult { try await inner.acknowledge(envelopeIds: envelopeIds) }
}

/// Chaque demande de bundles attend que le témoin la libère, dans l'ordre d'arrivée.
private final class GatedBundlesDirectory: ForwardingE2EEDirectory {
    private let lock = NSLock()
    private var held: [CheckedContinuation<Void, Never>] = []
    private var requests = 0

    var heldCount: Int { lock.withLock { held.count } }
    var bundleRequests: Int { lock.withLock { requests } }

    override func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            lock.withLock {
                requests += 1
                held.append(continuation)
            }
        }
        return try await inner.bundles(userId: userId, deviceIds: deviceIds)
    }

    func releaseOldest() {
        let next = lock.withLock { held.isEmpty ? nil : held.removeFirst() }
        next?.resume()
    }
}

/// La première liste des appareils du correspondant annonce la génération
/// d'avant son réenrôlement ; les bundles, et les listes suivantes, la nouvelle.
private final class StaleFirstListingDirectory: ForwardingE2EEDirectory {
    private let peer: String
    private let lock = NSLock()
    private var count = 0

    init(inner: FakeE2EEDirectoryClient, peer: String) {
        self.peer = peer
        super.init(inner: inner)
    }

    var listings: Int { lock.withLock { count } }

    override func devices(userId: String) async throws -> E2EEUserDevices {
        let served = try await inner.devices(userId: userId)
        guard userId == peer else { return served }
        let isFirst = lock.withLock { () -> Bool in
            count += 1
            return count == 1
        }
        guard isFirst else { return served }
        return E2EEUserDevices(userId: served.userId, devices: served.devices.map {
            E2EEDeviceListing(deviceId: $0.deviceId, registrationId: $0.registrationId % 0x3FFF + 1)
        })
    }
}

/// La liste de MES appareils attend que le témoin la libère, une fois armée.
private final class GatedOwnDevicesDirectory: ForwardingE2EEDirectory {
    private let owner: String
    private let lock = NSLock()
    private var armed = false
    private var held: CheckedContinuation<Void, Never>?

    init(inner: FakeE2EEDirectoryClient, owner: String) {
        self.owner = owner
        super.init(inner: inner)
    }

    var isHolding: Bool { lock.withLock { held != nil } }

    func arm() { lock.withLock { armed = true } }

    func release() {
        let next = lock.withLock { () -> CheckedContinuation<Void, Never>? in
            armed = false
            defer { held = nil }
            return held
        }
        next?.resume()
    }

    override func devices(userId: String) async throws -> E2EEUserDevices {
        if lock.withLock({ userId == owner && armed }) {
            await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
                lock.withLock { held = continuation }
            }
        }
        return try await inner.devices(userId: userId)
    }
}

/// La remise qui répond UN refus Sesame (`stale`) quand le témoin la libère ; la suivante passe.
private final class OneSesameRefusal: @unchecked Sendable {
    private let stale: [E2EEDeviceRef]
    private let lock = NSLock()
    private var held: CheckedContinuation<Void, Never>?
    private var refused = false

    init(stale: [E2EEDeviceRef]) {
        self.stale = stale
    }

    var isHolding: Bool { lock.withLock { held != nil } }
    var hasRefused: Bool { lock.withLock { refused } }

    func deliver(_ sealed: E2EESealedMessage) async throws -> E2EESealedMessage {
        guard !hasRefused else { return sealed }
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            lock.withLock { held = continuation }
        }
        lock.withLock { refused = true }
        throw E2EEDevicesMismatch(stale: stale)
    }

    func release() {
        let next = lock.withLock { () -> CheckedContinuation<Void, Never>? in
            defer { held = nil }
            return held
        }
        next?.resume()
    }
}

/// Chaque demande de bundles prend du temps : deux scellements non sérialisés s'y croiseraient.
private final class SlowBundlesDirectory: ForwardingE2EEDirectory {
    private let lock = NSLock()
    private var requested: [String] = []

    func requests(for userId: String) -> Int { lock.withLock { requested.filter { $0 == userId }.count } }

    override func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        lock.withLock { requested.append(userId) }
        try await Task.sleep(nanoseconds: 50_000_000)
        return try await inner.bundles(userId: userId, deviceIds: deviceIds)
    }
}

/// La route des bundles répond ce que le témoin écrit (une passerelle fautive ou hostile).
private final class RewrittenBundlesDirectory: ForwardingE2EEDirectory {
    private let serve: @Sendable (FakeE2EEDirectoryClient, String, [UInt32]?) async throws -> E2EEUserBundles

    init(
        inner: FakeE2EEDirectoryClient,
        serve: @escaping @Sendable (FakeE2EEDirectoryClient, String, [UInt32]?) async throws -> E2EEUserBundles
    ) {
        self.serve = serve
        super.init(inner: inner)
    }

    override func bundles(userId: String, deviceIds: [UInt32]?) async throws -> E2EEUserBundles {
        try await serve(inner, userId, deviceIds)
    }
}
