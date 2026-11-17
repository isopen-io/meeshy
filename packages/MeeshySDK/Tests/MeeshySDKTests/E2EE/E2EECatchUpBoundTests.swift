import Foundation
import XCTest
@testable import MeeshyE2EE
@testable import MeeshySDK

/// **Le rattrapage des enveloppes se termine toujours** (IOSX-05, #18948).
///
/// Il bouclait `repeat … while cursor != nil` sur le curseur que la passerelle
/// sert, sans borne : une passerelle fautive qui rend une page non vide avec le
/// même `nextCursor` le faisait tourner sans fin, et la fermeture de session,
/// rangée derrière lui, ne s'exécutait jamais.
final class E2EECatchUpBoundTests: XCTestCase {
    private let bob = String(repeating: "b2", count: 12)

    private func opener(for peer: E2EETestPeer, directory: any E2EEDirectoryClientProviding) -> E2EEEnvelopeOpener {
        E2EEEnvelopeOpener(local: peer.device, cipher: peer.cipher, plaintexts: peer.plaintexts, directory: directory, approvals: peer.approvals)
    }

    func test_aGatewayServingTheSameCursorForever_endsTheCatchUp() async throws {
        let server = FakeE2EEServer()
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let endless = EndlessEnvelopesDirectory(inner: bobIPhone.directory, recipient: bobIPhone.device.registrationId) { _ in "c1" }

        _ = try await opener(for: bobIPhone, directory: endless).catchUp()

        XCTAssertEqual(endless.pages, 2, "le curseur resservi arrête le rattrapage")
    }

    func test_aGatewayServingNewCursorsForever_stopsAtTheBudget() async throws {
        let server = FakeE2EEServer()
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let endless = EndlessEnvelopesDirectory(inner: bobIPhone.directory, recipient: bobIPhone.device.registrationId) { page in "c\(page)" }

        _ = try await opener(for: bobIPhone, directory: endless).catchUp()

        XCTAssertEqual(endless.pages, E2EEEnvelopeOpener.maxCatchUpPages)
    }

    func test_aCancelledCatchUp_stopsAtItsNextPage() async throws {
        let server = FakeE2EEServer()
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let endless = EndlessEnvelopesDirectory(
            inner: bobIPhone.directory, recipient: bobIPhone.device.registrationId, cancelsAtPage: 3
        ) { page in "c\(page)" }

        let catchingUp = opener(for: bobIPhone, directory: endless)
        let attempt = Task { try await catchingUp.catchUp() }

        guard case .failure(let error) = await attempt.result else {
            return XCTFail("la fermeture de la session annule le rattrapage")
        }
        XCTAssertTrue(error is CancellationError)
        XCTAssertEqual(endless.pages, 3)
    }

    /// Le miroir : une passerelle honnête est relue jusqu'au bout.
    func test_anHonestGateway_isReadToItsEnd() async throws {
        let server = FakeE2EEServer()
        let bobIPhone = try await E2EETestPeer.enroll(bob, on: server)
        let finite = EndlessEnvelopesDirectory(inner: bobIPhone.directory, recipient: bobIPhone.device.registrationId) { page in
            page < 4 ? "c\(page)" : nil
        }

        let outcomes = try await opener(for: bobIPhone, directory: finite).catchUp()

        XCTAssertEqual(finite.pages, 4)
        XCTAssertEqual(outcomes.count, 4)
    }
}

/// Une passerelle qui sert, page après page, une enveloppe d'une autre
/// génération (jamais ouverte, jamais acquittée) et le curseur que le témoin écrit.
private final class EndlessEnvelopesDirectory: ForwardingE2EEDirectory {
    private let lock = NSLock()
    private var served = 0
    private let recipient: UInt32
    private let cancelsAtPage: Int?
    private let cursor: @Sendable (Int) -> String?

    var pages: Int { lock.withLock { served } }

    init(inner: FakeE2EEDirectoryClient, recipient: UInt32, cancelsAtPage: Int? = nil, cursor: @escaping @Sendable (Int) -> String?) {
        self.recipient = recipient
        self.cancelsAtPage = cancelsAtPage
        self.cursor = cursor
        super.init(inner: inner)
    }

    override func envelopes(after cursor: String?, limit: Int?) async throws -> E2EEEnvelopePage {
        let page = lock.withLock { () -> Int in
            served += 1
            return served
        }
        if page == cancelsAtPage { withUnsafeCurrentTask { $0?.cancel() } }
        let envelope = E2EEServedEnvelope(
            id: "env\(page)", messageId: "m\(page)", conversationId: "conv1",
            recipientRegistrationId: recipient % 0x3FFF + 1, senderUserId: "sender", senderDeviceId: 1,
            type: E2EECiphertext.preKeyType, body: "AA==", createdAt: "2026-11-17T00:00:00.000Z"
        )
        return E2EEEnvelopePage(envelopes: [envelope], nextCursor: self.cursor(page))
    }
}
