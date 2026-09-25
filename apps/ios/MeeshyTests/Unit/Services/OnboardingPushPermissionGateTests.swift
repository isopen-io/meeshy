import XCTest
import MeeshySDK
@testable import Meeshy

/// **La fenêtre système des notifications appartient à la carte 5 (#7915).**
///
/// Recette 2026-09-25 : à la connexion d'un compte éligible créé ailleurs,
/// `onSessionOpened` demandait la permission PAR-DESSUS la carte Langues ; au
/// démarrage à froid, la séquence push ignorait le report posé à
/// l'inscription. La fenêtre ne sert qu'une fois : consommée là, « Oui » sur la
/// carte 5 ne pouvait plus l'ouvrir. Trois entrées, trois témoins, une règle.
@MainActor
final class OnboardingPushPermissionGateTests: XCTestCase {

    private func makeState(
        eligible: Bool = true,
        completedAt: String? = nil,
        seen: [OnboardingStepId] = []
    ) -> APIOnboardingState {
        APIOnboardingState(
            eligible: eligible,
            completedAt: completedAt,
            seenSteps: seen,
            prefilledSteps: [],
            globalConversationId: nil,
            protectedRegime: false,
            storyDefaultVisibility: .public,
            suggestions: []
        )
    }

    private struct SUT {
        let gate: OnboardingPushPermissionGate
        let service: MockOnboardingService
        let permission: MockOnboardingNotificationPermission
        let settled: MockOnboardingSettledStore
    }

    private func makeSUT(
        state: Result<APIOnboardingState, Error>? = nil,
        status: OnboardingNotificationStatus = .notDetermined,
        userId: String? = "me"
    ) -> SUT {
        let service = MockOnboardingService()
        service.fetchStateResult = state ?? .success(makeState())
        let permission = MockOnboardingNotificationPermission()
        permission.status = status
        let settled = MockOnboardingSettledStore()
        let gate = OnboardingPushPermissionGate(
            service: service,
            settled: settled,
            permission: permission,
            currentUserId: { userId }
        )
        return SUT(gate: gate, service: service, permission: permission, settled: settled)
    }

    /// Double qui retient si la demande est partie — la vraie ouvrirait une
    /// alerte système que xctest ne sait pas refermer.
    private final class RequestProbe {
        private(set) var count = 0
        func request() async { count += 1 }
    }

    private final class StubGate: OnboardingPushPermissionGating {
        nonisolated deinit {}
        let holds: Bool
        private(set) var askedWithReportPending: [Bool] = []
        init(holds: Bool) { self.holds = holds }
        func holdsPushPermission(reportPending: Bool) async -> Bool {
            askedWithReportPending.append(reportPending)
            return holds
        }
    }

    // MARK: - La règle

    func test_holdsPushPermission_eligibleOnboardingNotYetSettled_holds() async {
        let sut = makeSUT()

        let holds = await sut.gate.holdsPushPermission(reportPending: false)

        XCTAssertTrue(holds)
    }

    func test_holdsPushPermission_dialogAlreadyUsed_neverHoldsAndNeverFetches() async {
        let sut = makeSUT(status: .authorized)

        let holds = await sut.gate.holdsPushPermission(reportPending: true)

        XCTAssertFalse(holds, "déjà autorisé : la séquence doit pouvoir (re)déclarer l'appareil")
        XCTAssertEqual(sut.service.fetchStateCallCount, 0)
    }

    func test_holdsPushPermission_reportPendingFromRegistration_holdsWithoutFetching() async {
        let sut = makeSUT()

        let holds = await sut.gate.holdsPushPermission(reportPending: true)

        XCTAssertTrue(holds)
        XCTAssertEqual(sut.service.fetchStateCallCount, 0)
    }

    func test_holdsPushPermission_onboardingSettledOnThisDevice_doesNotHold() async {
        let sut = makeSUT()
        sut.settled.markSettled(userId: "me")

        let holds = await sut.gate.holdsPushPermission(reportPending: false)

        XCTAssertFalse(holds)
        XCTAssertEqual(sut.service.fetchStateCallCount, 0)
    }

    func test_holdsPushPermission_notEligible_doesNotHold() async {
        let sut = makeSUT(state: .success(makeState(eligible: false)))

        let holds = await sut.gate.holdsPushPermission(reportPending: false)

        XCTAssertFalse(holds)
    }

    func test_holdsPushPermission_onboardingFinished_doesNotHold() async {
        let sut = makeSUT(state: .success(makeState(completedAt: "2026-09-25T10:00:00.000Z")))

        let holds = await sut.gate.holdsPushPermission(reportPending: false)

        XCTAssertFalse(holds)
    }

    func test_holdsPushPermission_notificationsCardAlreadySeen_doesNotHold() async {
        let sut = makeSUT(state: .success(makeState(seen: [.languages, .notifications])))

        let holds = await sut.gate.holdsPushPermission(reportPending: false)

        XCTAssertFalse(holds)
    }

    /// Fail-closed : une fenêtre gaspillée ne se rattrape pas, une demande
    /// reportée si — le premier message envoyé l'honorera.
    func test_holdsPushPermission_stateUnreadable_holds() async {
        let sut = makeSUT(state: .failure(URLError(.notConnectedToInternet)))

        let holds = await sut.gate.holdsPushPermission(reportPending: false)

        XCTAssertTrue(holds)
    }

    func test_holdsPushPermission_noSignedInUser_doesNotHold() async {
        let sut = makeSUT(userId: nil)

        let holds = await sut.gate.holdsPushPermission(reportPending: false)

        XCTAssertFalse(holds)
    }

    // MARK: - Entrée 1 : la connexion

    func test_onSessionOpened_loginWhileOnboardingHolds_postponesAndNeverAsks() async {
        let deferral = MockPushPermissionDeferral()
        let probe = RequestProbe()

        await PushPermissionPrompt.onSessionOpened(
            origin: .login, deferral: deferral, gate: StubGate(holds: true), request: probe.request
        )

        XCTAssertEqual(probe.count, 0, "aucune fenêtre système par-dessus la carte Langues")
        XCTAssertTrue(deferral.isPending, "la demande attend la carte 5 — ou le premier message")
    }

    func test_onSessionOpened_loginOutsideOnboarding_asks() async {
        let deferral = MockPushPermissionDeferral()
        let probe = RequestProbe()

        await PushPermissionPrompt.onSessionOpened(
            origin: .login, deferral: deferral, gate: StubGate(holds: false), request: probe.request
        )

        XCTAssertEqual(probe.count, 1)
        XCTAssertFalse(deferral.isPending)
    }

    // MARK: - Entrée 2 : l'inscription

    func test_onSessionOpened_registration_neverAsks() async {
        let deferral = MockPushPermissionDeferral()
        let probe = RequestProbe()

        await PushPermissionPrompt.onSessionOpened(
            origin: .registration, deferral: deferral, gate: StubGate(holds: false), request: probe.request
        )

        XCTAssertEqual(probe.count, 0)
        XCTAssertTrue(deferral.isPending)
    }

    /// Le report d'une inscription s'honore au premier message ENVOYÉ — sauf
    /// tant que l'onboarding garde la fenêtre pour sa carte 5.
    func test_honourDeferredRequest_whileOnboardingHolds_keepsTheReportAndNeverAsks() async {
        let deferral = MockPushPermissionDeferral()
        deferral.postpone()
        let probe = RequestProbe()

        await PushPermissionPrompt.honourDeferredRequest(deferral, gate: StubGate(holds: true), request: probe.request)

        XCTAssertEqual(probe.count, 0)
        XCTAssertTrue(deferral.isPending)
    }

    func test_honourDeferredRequest_onboardingSettled_asksOnce() async {
        let deferral = MockPushPermissionDeferral()
        deferral.postpone()
        let probe = RequestProbe()

        await PushPermissionPrompt.honourDeferredRequest(deferral, gate: StubGate(holds: false), request: probe.request)

        XCTAssertEqual(probe.count, 1)
        XCTAssertFalse(deferral.isPending)
    }

    // MARK: - Entrée 3 : le démarrage à froid

    func test_onColdStart_whileOnboardingHolds_neverAsks() async {
        let deferral = MockPushPermissionDeferral()
        let probe = RequestProbe()

        await PushPermissionPrompt.onColdStart(deferral: deferral, gate: StubGate(holds: true), request: probe.request)

        XCTAssertEqual(probe.count, 0)
    }

    func test_onColdStart_honoursTheReportPostedAtRegistration() async {
        let deferral = MockPushPermissionDeferral()
        deferral.postpone()
        let probe = RequestProbe()
        let sut = makeSUT(state: .success(makeState(eligible: false)))

        await PushPermissionPrompt.onColdStart(deferral: deferral, gate: sut.gate, request: probe.request)

        XCTAssertEqual(probe.count, 0, "le report posé à l'inscription survit au redémarrage")
        XCTAssertTrue(deferral.isPending)
    }

    func test_onColdStart_nothingHeld_asks() async {
        let deferral = MockPushPermissionDeferral()
        let probe = RequestProbe()

        await PushPermissionPrompt.onColdStart(deferral: deferral, gate: StubGate(holds: false), request: probe.request)

        XCTAssertEqual(probe.count, 1)
    }

    func test_onColdStart_passesThePendingReportToTheGate() async {
        let deferral = MockPushPermissionDeferral()
        deferral.postpone()
        let gate = StubGate(holds: false)

        await PushPermissionPrompt.onColdStart(deferral: deferral, gate: gate, request: RequestProbe().request)

        XCTAssertEqual(gate.askedWithReportPending, [true])
    }
}
