import XCTest
@_spi(Testing) import MeeshyE2EE
import MeeshySDK
@testable import Meeshy

/// L'écran « Mes appareils chiffrés » (#13009) : cache d'abord, rien
/// d'approuvé sans confirmation, un code qui ne correspond à rien le dit.
@MainActor
final class EncryptedDevicesViewModelTests: XCTestCase {
    private let me = "00000000000000000000aa11"

    private func device(_ id: UInt32, trust: EndToEndOwnDevice.Trust, label: String? = nil) -> EndToEndOwnDevice {
        EndToEndOwnDevice(deviceId: id, registrationId: id * 10, platform: .ios, label: label, enrolledAt: nil, lastSeenAt: nil, trust: trust)
    }

    private func candidate(_ id: UInt32) -> E2EEPairingCandidate {
        E2EEPairingCandidate(deviceId: id, registrationId: id * 10, identityKey: Data([5, 1, 2]))
    }

    private func makeModel(
        linking: MockEndToEndOwnDeviceLinking,
        cache: EncryptedDevicesCache = EncryptedDevicesCache(),
        online: Bool = true,
        userId: String? = "00000000000000000000aa11"
    ) -> EncryptedDevicesViewModel {
        EncryptedDevicesViewModel(linking: linking, cache: cache, networkMonitor: FakeNetworkMonitor(isOnline: online), userId: { userId })
    }

    func test_load_withACachedList_showsItAtOnce_thenRevalidates() async {
        let linking = MockEndToEndOwnDeviceLinking()
        let fresh = [device(1, trust: .thisDevice), device(2, trust: .approved)]
        linking.devicesResult = .success(fresh)
        let cache = EncryptedDevicesCache()
        cache.store([device(1, trust: .thisDevice)], for: me)
        let model = makeModel(linking: linking, cache: cache)

        model.showCached()

        XCTAssertEqual(model.devices.count, 1, "le cache s'affiche avant tout appel")
        XCTAssertNotEqual(model.loadState, .loading, "jamais de squelette sur un cache non vide")
        await model.load()
        XCTAssertEqual(model.devices, fresh)
        XCTAssertEqual(model.loadState, .loaded)
        XCTAssertEqual(cache.devices(for: me), fresh)
    }

    func test_load_failingOffline_keepsTheKnownList_andSaysOffline() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.devicesResult = .failure(URLError(.notConnectedToInternet))
        let cache = EncryptedDevicesCache()
        cache.store([device(1, trust: .thisDevice)], for: me)
        let model = makeModel(linking: linking, cache: cache, online: false)

        await model.load()

        XCTAssertEqual(model.devices.count, 1)
        XCTAssertEqual(model.loadState, .offline)
    }

    func test_load_failingOnline_isAnError_notAnEmptyList() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.devicesResult = .failure(URLError(.badServerResponse))
        let model = makeModel(linking: linking)

        await model.load()

        XCTAssertEqual(model.loadState, .failed)
    }

    func test_scanningACodeThatMatchesOneOfMyDevices_asksForConfirmation_andApprovesNothingYet() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.devicesResult = .success([device(1, trust: .thisDevice), device(2, trust: .pending, label: "iPad")])
        linking.candidateResult = .success(candidate(2))
        let model = makeModel(linking: linking)
        await model.load()

        await model.scanned("meeshy-device-link:v1:code")

        XCTAssertEqual(model.pendingApproval?.candidate.deviceId, 2)
        XCTAssertEqual(model.pendingApproval?.device?.label, "iPad", "la confirmation nomme l'appareil trouvé")
        XCTAssertTrue(linking.approved.isEmpty, "rien n'est approuvé sans geste explicite")
    }

    func test_confirmingTheApproval_approvesExactlyTheScannedCandidate_andReloads() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.devicesResult = .success([device(1, trust: .thisDevice), device(2, trust: .pending)])
        linking.candidateResult = .success(candidate(2))
        let model = makeModel(linking: linking)
        await model.load()
        await model.scanned("meeshy-device-link:v1:code")
        linking.devicesResult = .success([device(1, trust: .thisDevice), device(2, trust: .approved)])

        await model.confirmApproval(XCTUnwrap(model.pendingApproval))

        XCTAssertEqual(linking.approved, [candidate(2)])
        XCTAssertNil(model.pendingApproval)
        XCTAssertEqual(model.devices.last?.trust, .approved)
        XCTAssertEqual(model.notice, .approved(deviceId: 2))
    }

    func test_cancellingTheApproval_approvesNothing_evenIfTheAlertStillConfirms() async throws {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.candidateResult = .success(candidate(2))
        let model = makeModel(linking: linking)
        await model.scanned("meeshy-device-link:v1:code")
        let presented = try XCTUnwrap(model.pendingApproval)

        model.cancelApproval()
        await model.confirmApproval(presented)

        XCTAssertTrue(linking.approved.isEmpty)
    }

    func test_aCodeThatMatchesNoneOfMyDevices_saysSo_andAsksNothing() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.candidateResult = .success(nil)
        let model = makeModel(linking: linking)

        await model.scanned("meeshy-device-link:v1:someone-else")

        XCTAssertNil(model.pendingApproval)
        XCTAssertEqual(model.notice, .noMatch)
    }

    func test_twoCodesReadAtOnce_onlyTheFirstIsExamined() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.candidateResult = .success(candidate(2))
        linking.holdsCandidate = true
        let model = makeModel(linking: linking)

        async let first: Void = model.scanned("first")
        await linking.waitUntilACandidateIsAsked()
        await model.scanned("second")
        linking.releaseCandidate()
        await first

        XCTAssertEqual(linking.scannedPayloads, ["first"], "un code lu pendant l'examen d'un autre n'est pas lu")
    }

    func test_aScanOpenedForOneDevice_refusesTheCodeOfAnother_andAsksNothing() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.candidateResult = .success(candidate(3))
        let model = makeModel(linking: linking)

        await model.scanned("code", expecting: 2)

        XCTAssertNil(model.pendingApproval, "le code d'un autre appareil que celui qu'on approuve ne s'approuve pas")
        XCTAssertEqual(model.notice, .otherDevice)
    }

    func test_anApprovalReadUnderOneAccount_isNotConfirmedUnderAnother() async throws {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.candidateResult = .success(candidate(2))
        var account: String? = me
        let model = EncryptedDevicesViewModel(linking: linking, cache: EncryptedDevicesCache(), networkMonitor: FakeNetworkMonitor(isOnline: true), userId: { account })
        await model.scanned("code")
        let presented = try XCTUnwrap(model.pendingApproval)

        account = "00000000000000000000ee55"
        await model.confirmApproval(presented)

        XCTAssertTrue(linking.approved.isEmpty)
    }

    func test_aScanWhileAConfirmationIsOpen_doesNotReplaceIt() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.candidateResult = .success(candidate(2))
        let model = makeModel(linking: linking)
        await model.scanned("first")
        linking.candidateResult = .success(candidate(3))

        await model.scanned("second")

        XCTAssertEqual(model.pendingApproval?.candidate.deviceId, 2, "un second code lu ne change pas l'appareil qu'on confirme")
        XCTAssertEqual(linking.scannedPayloads, ["first"])
    }

    func test_aFailingApproval_saysItFailed_andApprovesNothing() async {
        let linking = MockEndToEndOwnDeviceLinking()
        linking.candidateResult = .success(candidate(2))
        linking.approveError = CocoaError(.fileWriteUnknown)
        let model = makeModel(linking: linking)
        await model.scanned("code")

        await model.confirmApproval(XCTUnwrap(model.pendingApproval))

        XCTAssertEqual(model.notice, .actionFailed)
        XCTAssertNil(model.pendingApproval)
    }

    func test_showingMyCode_towardsADevice_carriesThatDevicesCode() async {
        let linking = MockEndToEndOwnDeviceLinking()
        let model = makeModel(linking: linking)
        let target = device(2, trust: .pending)

        await model.showCode(towards: target)

        XCTAssertEqual(linking.codeRequests, [2])
        XCTAssertEqual(model.shownCode?.device, target)
        XCTAssertEqual(model.shownCode?.groups.count, 12, "les 60 chiffres en 12 groupes de 5")
        XCTAssertEqual(model.shownCode?.groups.first, "01234")
    }

    func test_revokingAnApproval_andRetiringADevice_reachTheLinking_andReload() async {
        let linking = MockEndToEndOwnDeviceLinking()
        let model = makeModel(linking: linking)

        await model.revokeApproval(of: device(2, trust: .approved))
        await model.retire(device(3, trust: .pending))

        XCTAssertEqual(linking.revoked, [2])
        XCTAssertEqual(linking.retired, [3])
        XCTAssertEqual(linking.listCallCount, 2)
    }

    func test_thisDevice_canNeitherBeRevokedNorRetiredFromTheScreen() async {
        let linking = MockEndToEndOwnDeviceLinking()
        let model = makeModel(linking: linking)

        await model.revokeApproval(of: device(1, trust: .thisDevice))
        await model.retire(device(1, trust: .thisDevice))

        XCTAssertTrue(linking.revoked.isEmpty)
        XCTAssertTrue(linking.retired.isEmpty)
    }

    func test_withoutASignedInAccount_nothingIsAsked() async {
        let linking = MockEndToEndOwnDeviceLinking()
        let model = makeModel(linking: linking, userId: nil)

        await model.load()
        await model.scanned("code")

        XCTAssertEqual(linking.listCallCount, 0)
        XCTAssertTrue(linking.scannedPayloads.isEmpty)
        XCTAssertEqual(model.loadState, .failed)
    }
}
