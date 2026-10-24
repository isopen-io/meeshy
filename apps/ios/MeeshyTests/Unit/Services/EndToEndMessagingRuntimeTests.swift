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
        func plaintexts() throws -> any E2EEPlaintextStoring { throw CocoaError(.featureUnsupported) }
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
}
