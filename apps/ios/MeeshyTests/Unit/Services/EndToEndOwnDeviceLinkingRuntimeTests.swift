import XCTest
import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// **Deux de mes appareils s'approuvent en deux lectures de QR, et ce que j'écris
/// sur l'un se lit sur l'autre** (#13009, spec E2EE § 3.5).
///
/// Installations libsignal RÉELLES de l'app (enrôlement, scelleur, ouvreur,
/// appairage de production) sur une fausse passerelle : rien n'est simulé de la
/// cryptographie, seul le transport l'est.
final class EndToEndOwnDeviceLinkingRuntimeTests: XCTestCase {
    private let alice = "00000000000000000000aa11"
    private let bob = "00000000000000000000bb22"
    private let conversationId = "00000000000000000000ab01"

    private func installation(_ userId: String, on gateway: LibsignalTestGateway) async throws -> EndToEndMessagingRuntime {
        let runtime = EndToEndMessagingRuntime(provisioning: try LibsignalDeviceProvisioning.inMemory(on: gateway, userId: userId))
        _ = try await runtime.ready(for: userId)
        return runtime
    }

    private func content(_ text: String) -> E2EEContent {
        E2EEContent(text: text, language: "fr", replyTo: nil, conversationId: conversationId, clientMessageId: "cid_\(text.count)", sentAt: Date())
    }

    /// `scanner` lit le code que `shower` lui montre, puis confirme.
    private func approve(_ shower: EndToEndMessagingRuntime, showing deviceId: UInt32, from scanner: EndToEndMessagingRuntime) async throws {
        let code = try await shower.pairingCode(towards: deviceId, as: alice)
        let candidate = try await scanner.candidate(matching: code.qrPayload, as: alice)
        try await scanner.approve(XCTUnwrap(candidate), as: alice)
    }

    private func readableText(_ messageId: String, on runtime: EndToEndMessagingRuntime) async -> String? {
        guard case .readable(let content, _) = await runtime.plaintexts(for: [messageId])[messageId] else { return nil }
        return content.text
    }

    func test_myDevicesList_putsThisDeviceFirst_andTheOtherPendingUntilIApproveIt() async throws {
        let gateway = LibsignalTestGateway()
        let phone = try await installation(alice, on: gateway)
        _ = try await installation(alice, on: gateway)

        let listed = try await phone.linkedDevices(of: alice)

        XCTAssertEqual(listed.map(\.deviceId), [1, 2])
        XCTAssertEqual(listed.map(\.trust), [.thisDevice, .pending])
        XCTAssertEqual(listed.first?.platform, .ios)
    }

    func test_scanningTheCodeOfAnotherOfMyDevices_namesIt_andApprovesItOnlyOnConfirmation() async throws {
        let gateway = LibsignalTestGateway()
        let phone = try await installation(alice, on: gateway)
        let tablet = try await installation(alice, on: gateway)

        let code = try await tablet.pairingCode(towards: 1, as: alice)
        let candidate = try await phone.candidate(matching: code.qrPayload, as: alice)

        XCTAssertEqual(candidate?.deviceId, 2, "le code désigne de lui-même l'appareil")
        let beforeConfirmation = try await phone.linkedDevices(of: alice)
        XCTAssertEqual(beforeConfirmation.last?.trust, .pending, "lire n'épingle rien")

        try await phone.approve(XCTUnwrap(candidate), as: alice)

        let afterConfirmation = try await phone.linkedDevices(of: alice)
        XCTAssertEqual(afterConfirmation.last?.trust, .approved)
    }

    func test_theCodeOfAContactsDevice_matchesNoneOfMine() async throws {
        let gateway = LibsignalTestGateway()
        let phone = try await installation(alice, on: gateway)
        _ = try await installation(alice, on: gateway)
        let bobPhone = try await installation(bob, on: gateway)
        _ = try await installation(bob, on: gateway)

        let bobsCode = try await bobPhone.pairingCode(towards: 2, as: bob)
        let candidate = try await phone.candidate(matching: bobsCode.qrPayload, as: alice)

        XCTAssertNil(candidate)
    }

    func test_somethingThatIsNotAPairingCode_matchesNothing() async throws {
        let gateway = LibsignalTestGateway()
        let phone = try await installation(alice, on: gateway)
        _ = try await installation(alice, on: gateway)

        let candidate = try await phone.candidate(matching: "https://meeshy.me/l/abc", as: alice)

        XCTAssertNil(candidate)
    }

    func test_aMessageWrittenBetweenTheTwoApprovals_opensOnTheSecondApproval_withoutAnyReload() async throws {
        let gateway = LibsignalTestGateway()
        let phone = try await installation(alice, on: gateway)
        let tablet = try await installation(alice, on: gateway)
        _ = try await installation(bob, on: gateway)
        try await approve(phone, showing: 2, from: tablet)

        let alice = alice, conversationId = conversationId
        try await tablet.deliver(content("écrit sur la tablette"), from: alice, to: bob) { sealed in
            gateway.relay(sealed, from: alice, conversationId: conversationId, messageId: "m_between")
        }
        for envelope in gateway.pending(for: alice) { await phone.receive(envelope, as: alice) }
        let beforeApproval = await readableText("m_between", on: phone)
        XCTAssertNil(beforeApproval, "un appareil que le téléphone n'a pas approuvé n'est pas lu")

        try await approve(tablet, showing: 1, from: phone)

        let afterApproval = await readableText("m_between", on: phone)
        XCTAssertEqual(afterApproval, "écrit sur la tablette", "l'approbation relance le rattrapage")
    }

    func test_aRevokedApproval_isPendingAgain_andMyNextMessageNoLongerReachesIt() async throws {
        let gateway = LibsignalTestGateway()
        let phone = try await installation(alice, on: gateway)
        let tablet = try await installation(alice, on: gateway)
        _ = try await installation(bob, on: gateway)
        try await approve(tablet, showing: 1, from: phone)

        try await phone.revokeApproval(of: 2, as: alice)

        let listed = try await phone.linkedDevices(of: alice)
        XCTAssertEqual(listed.last?.trust, .pending)
        let alice = alice, conversationId = conversationId
        try await phone.deliver(content("après le retrait"), from: alice, to: bob) { sealed in
            XCTAssertEqual(sealed.unapprovedOwnDevices, [2])
            gateway.relay(sealed, from: alice, conversationId: conversationId, messageId: "m_after")
        }
    }

    func test_theListNamesMyDevices_fromTheirMetadata_butTrustNeverComesFromTheServer() {
        let current = E2EELocalDevice(userId: alice, deviceId: 3, registrationId: 30)
        let others = [
            E2EEOwnDeviceStatus(deviceId: 1, registrationId: 10, approved: true),
            E2EEOwnDeviceStatus(deviceId: 2, registrationId: 20, approved: false),
        ]
        let details = [
            E2EEOwnDeviceDetails(deviceId: 1, registrationId: 11, platform: .web, label: "ancien", enrolledAt: nil, lastSeenAt: nil, current: false),
            E2EEOwnDeviceDetails(deviceId: 2, registrationId: 20, platform: .macos, label: "Mac", enrolledAt: nil, lastSeenAt: nil, current: true),
            E2EEOwnDeviceDetails(deviceId: 3, registrationId: 30, platform: .ios, label: "iPhone", enrolledAt: nil, lastSeenAt: nil, current: false),
        ]

        let listed = EndToEndOwnDevice.list(current: current, others: others, details: details)

        XCTAssertEqual(listed.map(\.deviceId), [3, 1, 2])
        XCTAssertEqual(listed.map(\.trust), [.thisDevice, .approved, .pending], "« current » servi pour un autre appareil ne le rend pas mien")
        XCTAssertNil(listed[1].label, "une métadonnée d'une autre génération ne s'attache pas")
        XCTAssertEqual(listed[2].label, "Mac")
        XCTAssertEqual(listed[0].label, "iPhone")
    }
}
