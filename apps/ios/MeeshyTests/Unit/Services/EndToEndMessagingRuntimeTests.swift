import Combine
import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// Le moteur E2EE de l'app (#3707) : une installation préparée une fois et
/// partagée, oubliée quand la passerelle dit qu'elle n'est plus liée, et
/// chaque enveloppe ouverte annoncée au fil.
final class EndToEndMessagingRuntimeTests: XCTestCase {
    private let me = "00000000000000000000cd98"

    private final class StubSealer: E2EEMessageSealing, @unchecked Sendable {
        var error: (any Error)?
        func seal(_ content: E2EEContent, to peerUserId: String) async throws -> E2EESealedMessage {
            if let error { throw error }
            return E2EESealedMessage(senderDeviceId: 1, envelopes: [], unapprovedOwnDevices: [])
        }
        func sealAndDeliver<T: Sendable>(
            _ content: E2EEContent, to peerUserId: String,
            deliver: @concurrent @Sendable (E2EESealedMessage) async throws -> T
        ) async throws -> T {
            try await deliver(try await seal(content, to: peerUserId))
        }
    }

    private struct StubOpener: E2EEEnvelopeOpening {
        func open(_ envelope: E2EEServedEnvelope) -> E2EEOpenOutcome {
            .undecryptable(messageId: envelope.messageId, conversationId: envelope.conversationId)
        }
        func receive(_ envelope: E2EEServedEnvelope) async -> E2EEOpenOutcome { open(envelope) }
        func catchUp() async throws -> [E2EEOpenOutcome] { [] }
    }

    private final class StubProvisioning: EndToEndDeviceProvisioning, @unchecked Sendable {
        let sealer = StubSealer()
        private let lock = NSLock()
        private(set) var readyCount = 0

        func ready(for userId: String) async throws -> EndToEndReadyDevice {
            lock.withLock { readyCount += 1 }
            try await Task.sleep(nanoseconds: 20_000_000)
            return EndToEndReadyDevice(device: E2EELocalDevice(userId: userId, deviceId: 1, registrationId: 7), sealer: sealer, opener: StubOpener())
        }
        func plaintexts(owner: String) throws -> any E2EEPlaintextStoring { throw CocoaError(.featureUnsupported) }
        func registrar() throws -> any E2EEDeviceRegistering { throw CocoaError(.featureUnsupported) }
    }

    private func content() -> E2EEContent {
        E2EEContent(text: "x", language: "fr", replyTo: nil, conversationId: "c1", clientMessageId: "cid", sentAt: Date())
    }

    func test_concurrentSends_prepareTheInstallationOnce() async throws {
        let provisioning = StubProvisioning()
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        let content = content()
        let me = me

        try await withThrowingTaskGroup(of: Int.self) { group in
            (0..<3).forEach { _ in
                group.addTask { try await runtime.deliver(content, from: me, to: "peer") { _ in 1 } }
            }
            try await group.waitForAll()
        }

        XCTAssertEqual(provisioning.readyCount, 1)
    }

    func test_aDeviceNoLongerBound_isPreparedAgainAtTheNextSend() async throws {
        let provisioning = StubProvisioning()
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        provisioning.sealer.error = MeeshyError.rejected(APIRejection(statusCode: 403, code: E2EEErrorCode.deviceNotBound, message: "x"))

        _ = try? await runtime.deliver(content(), from: me, to: "peer") { _ in 1 }
        provisioning.sealer.error = nil
        _ = try await runtime.deliver(content(), from: me, to: "peer") { _ in 1 }

        XCTAssertEqual(provisioning.readyCount, 2, "une nouvelle session relie l'installation")
    }

    /// Une préparation lente pour un compte, rapide pour l'autre : le changement
    /// de compte survient pendant que la première est suspendue (#12769).
    private final class AccountSwitchProvisioning: EndToEndDeviceProvisioning, @unchecked Sendable {
        let slowUserId: String
        let sealer = StubSealer()
        private let lock = NSLock()
        private var started: [String] = []

        init(slowUserId: String) { self.slowUserId = slowUserId }

        private var running = 0
        private var peak = 0

        var startedUserIds: [String] { lock.withLock { started } }
        /// Le plus grand nombre de préparations simultanées sur le même coffre.
        var peakConcurrency: Int { lock.withLock { peak } }

        func ready(for userId: String) async throws -> EndToEndReadyDevice {
            lock.withLock {
                started.append(userId)
                running += 1
                peak = max(peak, running)
            }
            defer { lock.withLock { running -= 1 } }
            // Une préparation réelle ne s'annule pas à mi-chemin : le coffre est écrit jusqu'au bout.
            try? await Task.sleep(nanoseconds: userId == slowUserId ? 300_000_000 : 5_000_000)
            return EndToEndReadyDevice(device: E2EELocalDevice(userId: userId, deviceId: 1, registrationId: 7), sealer: sealer, opener: StubOpener())
        }
        func plaintexts(owner: String) throws -> any E2EEPlaintextStoring { throw CocoaError(.featureUnsupported) }
        func registrar() throws -> any E2EEDeviceRegistering { throw CocoaError(.featureUnsupported) }
    }

    private func waitUntilStarted(_ userId: String, in provisioning: AccountSwitchProvisioning) async {
        for _ in 0..<200 where !provisioning.startedUserIds.contains(userId) {
            try? await Task.sleep(nanoseconds: 1_000_000)
        }
    }

    func test_ready_afterForgetDuringAnotherAccountsPreparation_returnsTheRequestedAccountsDevice() async throws {
        let provisioning = AccountSwitchProvisioning(slowUserId: "accountA")
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        let preparingA = Task { try await runtime.ready(for: "accountA") }
        await waitUntilStarted("accountA", in: provisioning)

        await runtime.forget()
        let device = try await runtime.ready(for: "accountB")

        XCTAssertEqual(device.device.userId, "accountB", "jamais l'appareil d'un autre compte")
        _ = try? await preparingA.value
    }

    func test_ready_forAnotherAccountWhileOneIsPreparing_returnsTheRequestedAccountsDevice() async throws {
        let provisioning = AccountSwitchProvisioning(slowUserId: "accountA")
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        let preparingA = Task { try await runtime.ready(for: "accountA") }
        await waitUntilStarted("accountA", in: provisioning)

        let device = try await runtime.ready(for: "accountB")

        XCTAssertEqual(device.device.userId, "accountB")
        _ = try? await preparingA.value
    }

    func test_ready_aPreparationForgottenMidway_isNeitherReturnedNorCached() async throws {
        let provisioning = AccountSwitchProvisioning(slowUserId: "accountA")
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        let preparingA = Task { try await runtime.ready(for: "accountA") }
        await waitUntilStarted("accountA", in: provisioning)

        await runtime.forget()
        let forgotten = await preparingA.result
        let deviceB = try await runtime.ready(for: "accountB")

        XCTAssertThrowsError(try forgotten.get(), "une préparation oubliée ne rend rien à la session fermée")
        XCTAssertEqual(deviceB.device.userId, "accountB")
        XCTAssertEqual(provisioning.startedUserIds, ["accountA", "accountB"])
    }

    /// Audit #12769 — annuler ne suffit pas : la préparation remplacée écrit
    /// encore le coffre partagé. La suivante attend qu'elle soit finie.
    func test_ready_aReplacingPreparationStartsOnlyOnceThePreviousOneEnded() async throws {
        let provisioning = AccountSwitchProvisioning(slowUserId: "accountA")
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        let preparingA = Task { try await runtime.ready(for: "accountA") }
        await waitUntilStarted("accountA", in: provisioning)

        _ = try await runtime.ready(for: "accountB")

        XCTAssertEqual(provisioning.peakConcurrency, 1, "deux préparations ne tournent jamais ensemble sur le même coffre")
        _ = try? await preparingA.value
    }

    /// Contre-audit #12769 — le vrai chemin d'un changement de compte (fermer,
    /// ouvrir l'autre) attend aussi la préparation annulée.
    func test_switchingSessions_waitsForTheCancelledPreparationBeforePreparingTheNextAccount() async throws {
        let provisioning = AccountSwitchProvisioning(slowUserId: "accountA")
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        await runtime.open(session: "accountA")
        let preparingA = Task { try await runtime.ready(for: "accountA") }
        await waitUntilStarted("accountA", in: provisioning)

        await runtime.close()
        await runtime.open(session: "accountB")
        _ = try await runtime.ready(for: "accountB")

        XCTAssertEqual(provisioning.peakConcurrency, 1)
        _ = try? await preparingA.value
    }

    /// Audit #12769 — un appel resté en file pour l'ancien compte ne touche
    /// pas la session ouverte.
    func test_ready_forAnAccountOtherThanTheOpenSession_isRefusedWithoutPreparing() async throws {
        let provisioning = AccountSwitchProvisioning(slowUserId: "none")
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        await runtime.open(session: "accountB")

        do {
            _ = try await runtime.ready(for: "accountA")
            XCTFail("l'ancien compte ne prépare rien sous la session de B")
        } catch {}
        _ = try await runtime.ready(for: "accountB")

        XCTAssertEqual(provisioning.startedUserIds, ["accountB"])
    }

    func test_ready_afterTheSessionCloses_isRefused() async {
        let provisioning = AccountSwitchProvisioning(slowUserId: "none")
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        await runtime.open(session: "accountA")
        await runtime.close()

        let device = try? await runtime.ready(for: "accountA")

        XCTAssertNil(device)
        XCTAssertTrue(provisioning.startedUserIds.isEmpty)
    }

    /// Audit #12769 — l'appareil délié d'un compte n'annule pas la préparation d'un autre.
    func test_forgetting_oneAccountsDevice_leavesAnotherAccountsPreparationRunning() async throws {
        let provisioning = AccountSwitchProvisioning(slowUserId: "accountB")
        let runtime = EndToEndMessagingRuntime(provisioning: provisioning)
        let preparingB = Task { try await runtime.ready(for: "accountB") }
        await waitUntilStarted("accountB", in: provisioning)

        await runtime.forgetDevice(of: "accountA")

        let device = try await preparingB.value
        XCTAssertEqual(device.device.userId, "accountB")
        XCTAssertEqual(provisioning.startedUserIds, ["accountB"])
    }

    func test_aReceivedEnvelope_isAnnouncedToTheThread() async {
        let runtime = EndToEndMessagingRuntime(provisioning: StubProvisioning())
        let announced = expectation(description: "annoncée")
        let subscription = runtime.opened.sink { outcome in
            if outcome.messageId == "m1" { announced.fulfill() }
        }
        let envelope = E2EEServedEnvelope(
            id: "e1", messageId: "m1", conversationId: "c1", recipientRegistrationId: 7,
            senderUserId: "peer", senderDeviceId: 1, type: 3, body: "AAAA", createdAt: "t"
        )

        await runtime.receive(envelope, as: me)

        await fulfillment(of: [announced], timeout: 1)
        subscription.cancel()
    }
}

/// L'écran de retrait d'un appareil quand le compte est plein.
@MainActor
final class EndToEndDeviceLimitViewModelTests: XCTestCase {
    private final class StubDevices: EndToEndDeviceManaging, @unchecked Sendable {
        var devices: [E2EEDeviceListing] = []
        var listError: (any Error)?
        private(set) var retired: [UInt32] = []
        private(set) var enrolled = 0

        func ownDevices(of userId: String) async throws -> [E2EEDeviceListing] {
            if let listError { throw listError }
            return devices
        }
        func retire(deviceId: UInt32) async throws { retired.append(deviceId) }
        func enroll(_ userId: String) async throws { enrolled += 1 }
    }

    private func listing(_ id: UInt32) -> E2EEDeviceListing {
        JSONStub.decode(#"{"deviceId":\#(id),"registrationId":5}"#)
    }

    func test_load_listsMyDevices() async {
        let stub = StubDevices()
        stub.devices = [listing(1), listing(2)]
        let model = EndToEndDeviceLimitViewModel(devices: stub, userId: { "me" })

        await model.load()

        XCTAssertEqual(model.state, .loaded([listing(1), listing(2)]))
    }

    func test_load_failure_saysSo() async {
        let stub = StubDevices()
        stub.listError = URLError(.notConnectedToInternet)
        let model = EndToEndDeviceLimitViewModel(devices: stub, userId: { "me" })

        await model.load()

        XCTAssertEqual(model.state, .failed)
    }

    func test_retire_thenThisDeviceEnrolls() async {
        let stub = StubDevices()
        let model = EndToEndDeviceLimitViewModel(devices: stub, userId: { "me" })

        await model.retire(3)

        XCTAssertEqual(stub.retired, [3])
        XCTAssertEqual(stub.enrolled, 1)
        XCTAssertEqual(model.state, .enrolled)
        XCTAssertNil(model.retiringDeviceId)
    }

    // MARK: - Le coffre ne se lit que pour le compte de la session (#13000)

    private let alice = "00000000000000000000aa11"
    private let bob = "00000000000000000000bb22"

    private func written(by userId: String) -> E2EEContent {
        E2EEContent(text: "le secret de \(userId.suffix(2))", language: "fr", replyTo: nil, conversationId: "c1", clientMessageId: "cid_1", sentAt: Date())
    }

    private func device(_ userIds: [String]) throws -> [String: EndToEndMessagingRuntime] {
        try LibsignalDeviceProvisioning.sharedDevice(on: LibsignalTestGateway(), userIds: userIds)
            .mapValues { EndToEndMessagingRuntime(provisioning: $0) }
    }

    private func enrolled(_ runtime: EndToEndMessagingRuntime, as userId: String) async throws {
        await runtime.open(session: userId)
        _ = try await runtime.ready(for: userId)
    }

    func test_plaintexts_ofTheOpenSessionsAccount_areServed() async throws {
        let runtime = try XCTUnwrap(try device([alice])[alice])
        try await enrolled(runtime, as: alice)

        let kept = await runtime.remember(written(by: alice), from: alice, as: ["m1"])

        XCTAssertTrue(kept)
        let served = await runtime.plaintexts(for: ["m1"], as: alice)
        XCTAssertEqual(served.keys.sorted(), ["m1"])
    }

    func test_plaintexts_ofAnotherAccountOnTheSameDevice_areNeverServed() async throws {
        let runtimes = try device([alice, bob])
        let asAlice = try XCTUnwrap(runtimes[alice]), asBob = try XCTUnwrap(runtimes[bob])
        try await enrolled(asAlice, as: alice)
        await asAlice.remember(written(by: alice), from: alice, as: ["m1"])
        await asAlice.close()

        await asBob.open(session: bob)

        let servedToBob = await asBob.plaintexts(for: ["m1"], as: bob)
        XCTAssertEqual(servedToBob, [:], "B, connecté sur l'appareil de A, ne lit pas le coffre de A")
        let storedForBob = await asBob.storedMessageIds(as: bob)
        XCTAssertNil(storedForBob, "le coffre n'est pas celui de B")
    }

    func test_plaintexts_askedForAnotherAccountThanTheSession_areNotServed() async throws {
        let runtime = try XCTUnwrap(try device([alice])[alice])
        try await enrolled(runtime, as: alice)
        await runtime.remember(written(by: alice), from: alice, as: ["m1"])

        let servedToBob = await runtime.plaintexts(for: ["m1"], as: bob)

        XCTAssertEqual(servedToBob, [:], "une interface déjà basculée vers B ne lit pas le coffre de A, même session encore ouverte")
    }

    func test_plaintexts_afterTheSessionCloses_orBeforeItOpens_areNotServed() async throws {
        let runtime = try XCTUnwrap(try device([alice])[alice])
        let beforeOpening = await runtime.plaintexts(for: ["m1"], as: alice)
        XCTAssertEqual(beforeOpening, [:])
        try await enrolled(runtime, as: alice)
        await runtime.remember(written(by: alice), from: alice, as: ["m1"])

        await runtime.close()

        let afterClosing = await runtime.plaintexts(for: ["m1"], as: alice)
        XCTAssertEqual(afterClosing, [:])
    }

    func test_remember_forAnotherAccountThanTheSession_storesNothing_andSaysSo() async throws {
        let runtime = try XCTUnwrap(try device([alice])[alice])
        try await enrolled(runtime, as: alice)

        let kept = await runtime.remember(written(by: bob), from: bob, as: ["m2"])

        XCTAssertFalse(kept)
        let stored = await runtime.storedMessageIds(as: alice)
        XCTAssertEqual(stored, [])
    }

    // MARK: - Un clair effacé quitte le coffre (#13001)

    func test_erase_removesTheClear_onlyForTheVaultsAccount_withinItsSession() async throws {
        let runtime = try XCTUnwrap(try device([alice])[alice])
        try await enrolled(runtime, as: alice)
        await runtime.remember(written(by: alice), from: alice, as: ["m1", "cid_1", "m2"])

        let erasedForBob = await runtime.erase(["m2"], as: bob)
        let erased = await runtime.erase(["m1", "cid_1"], as: alice)

        XCTAssertFalse(erasedForBob)
        XCTAssertTrue(erased)
        let stored = await runtime.storedMessageIds(as: alice)
        XCTAssertEqual(stored, ["m2"])
        await runtime.close()
        let erasedClosed = await runtime.erase(["m2"], as: alice)
        XCTAssertFalse(erasedClosed, "hors session, l'effacement attend")
    }

    /// Audit (M-7) — un premier envoi juste après la connexion, avant que
    /// l'installation se soit enrôlée, range son clair : il attend l'enrôlement.
    func test_remember_beforeEnrollment_waitsForIt_andKeepsTheClear() async throws {
        let runtime = try XCTUnwrap(try device([alice])[alice])
        await runtime.open(session: alice)

        let kept = await runtime.remember(written(by: alice), from: alice, as: ["cid_1"])

        XCTAssertTrue(kept)
        let stored = await runtime.storedMessageIds(as: alice)
        XCTAssertEqual(stored, ["cid_1"])
    }
}
