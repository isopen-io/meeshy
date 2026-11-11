import XCTest
import UserNotifications
import MeeshySDK
@testable import Meeshy

/// La LOI de l'alarme d'un Bring (#17442) : même alarme pour l'app et la NSE, jamais sans drapeau, jamais passée.
final class BringAlarmPlanTests: XCTestCase {

    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private let iso = ISO8601DateFormatter()

    private func push(type: String = "bring", expiresIn: TimeInterval = 120, extra: [String: Any] = [:]) -> [AnyHashable: Any] {
        var info: [AnyHashable: Any] = [
            "type": type, "bringId": "b1", "title": "Alice te fait sonner",
            "stopLabel": "Arrêter", "expiresAt": iso.string(from: now.addingTimeInterval(expiresIn)),
        ]
        extra.forEach { info[$0.key] = $0.value }
        return info
    }

    func test_aRingPush_becomesTheAlarmOfItsBring() {
        guard case .ring(let request) = BringAlarmPlan.action(push: push(), now: now) else { return XCTFail("pas d'alarme") }
        XCTAssertEqual(request.bringId, "b1")
        XCTAssertEqual(request.title, "Alice te fait sonner")
        XCTAssertEqual(request.stopLabel, "Arrêter")
        XCTAssertEqual(request.deadline, now.addingTimeInterval(120).roundedToSeconds)
    }

    func test_aStoppedPush_silencesIt() {
        XCTAssertEqual(BringAlarmPlan.action(push: push(type: "bring_stopped"), now: now), .silence(bringId: "b1"))
    }

    func test_anExpiredOrForeignPush_touchesNothing() {
        XCTAssertEqual(BringAlarmPlan.action(push: push(expiresIn: -1), now: now), .none)
        XCTAssertEqual(BringAlarmPlan.action(push: push(type: "message"), now: now), .none)
        XCTAssertEqual(BringAlarmPlan.action(push: ["type": "bring"], now: now), .none)
    }

    func test_anUnreadableDeadline_neverOpensAnEndlessAlarm() {
        guard case .ring(let request) = BringAlarmPlan.action(push: push(extra: ["expiresAt": "demain"]), now: now) else {
            return XCTFail("pas d'alarme")
        }
        XCTAssertEqual(request.deadline, now.addingTimeInterval(BringAlarmPlan.ringWindow))
    }

    func test_theAlarmIdentifier_isStableAndPerBring() {
        XCTAssertEqual(BringAlarmPlan.alarmID(bringId: "b1"), BringAlarmPlan.alarmID(bringId: "b1"))
        XCTAssertNotEqual(BringAlarmPlan.alarmID(bringId: "b1"), BringAlarmPlan.alarmID(bringId: "b2"))
    }

    func test_theFlag_isOpenInDebug_closedInRelease_andForcedByTheEnvironment() {
        XCTAssertTrue(BringAlarmPlan.isEnabled(environment: [:], storedValue: nil, debugBuild: true))
        XCTAssertFalse(BringAlarmPlan.isEnabled(environment: [:], storedValue: nil, debugBuild: false))
        XCTAssertTrue(BringAlarmPlan.isEnabled(environment: ["MEESHY_FLAG_BRING_ALARM": "1"], storedValue: false, debugBuild: false))
        XCTAssertFalse(BringAlarmPlan.isEnabled(environment: ["MEESHY_FLAG_BRING_ALARM": "0"], storedValue: true, debugBuild: true))
        XCTAssertTrue(BringAlarmPlan.isEnabled(environment: [:], storedValue: true, debugBuild: false))
    }

    func test_theForegroundApp_ringsItself_neverTwoSounds() {
        XCTAssertTrue(BringAlarmPlan.appShouldRingAlarm(enabled: true, appIsActive: false))
        XCTAssertFalse(BringAlarmPlan.appShouldRingAlarm(enabled: true, appIsActive: true))
        XCTAssertFalse(BringAlarmPlan.appShouldRingAlarm(enabled: false, appIsActive: false))
    }
}

private extension Date {
    var roundedToSeconds: Date { Date(timeIntervalSince1970: timeIntervalSince1970.rounded()) }
}

/// Ce que l'app et l'extension font d'une action : drapeau, autorisation, jamais de demande depuis l'extension.
final class BringAlarmCoordinatorTests: XCTestCase {

    private let request = BringAlarmPlan.Request(
        bringId: "b1", title: "Alice te fait sonner", stopLabel: "Arrêter", deadline: Date(timeIntervalSince1970: 1_800_000_120)
    )

    func test_aClosedFlag_isInert() async {
        let scheduler = MockBringAlarmScheduler()
        let sut = BringAlarmCoordinator(scheduler: scheduler, enabled: false)

        await sut.apply(.ring(request), mayAsk: true)
        await sut.cancel(bringId: "b1")

        let scheduled = await scheduler.scheduled
        let cancelled = await scheduler.cancelled
        XCTAssertTrue(scheduled.isEmpty)
        XCTAssertTrue(cancelled.isEmpty)
    }

    func test_authorized_schedulesTheAlarm() async {
        let scheduler = MockBringAlarmScheduler(state: .authorized)
        let posted = await BringAlarmCoordinator(scheduler: scheduler, enabled: true).apply(.ring(request), mayAsk: false)

        XCTAssertTrue(posted)
        let scheduled = await scheduler.scheduled
        XCTAssertEqual(scheduled, [request])
    }

    func test_theExtension_neverAsksForAuthorization() async {
        let scheduler = MockBringAlarmScheduler(state: .notDetermined)
        let posted = await BringAlarmCoordinator(scheduler: scheduler, enabled: true).apply(.ring(request), mayAsk: false)

        XCTAssertFalse(posted)
        let asked = await scheduler.authorizationRequests
        XCTAssertEqual(asked, 0)
    }

    func test_theApp_asksOnceThenSchedules() async {
        let scheduler = MockBringAlarmScheduler(state: .notDetermined, grants: .authorized)
        let posted = await BringAlarmCoordinator(scheduler: scheduler, enabled: true).apply(.ring(request), mayAsk: true)

        XCTAssertTrue(posted)
        let asked = await scheduler.authorizationRequests
        XCTAssertEqual(asked, 1)
    }

    func test_aDeniedAuthorization_schedulesNothing() async {
        let scheduler = MockBringAlarmScheduler(state: .denied)
        let posted = await BringAlarmCoordinator(scheduler: scheduler, enabled: true).apply(.ring(request), mayAsk: true)

        XCTAssertFalse(posted)
        let scheduled = await scheduler.scheduled
        XCTAssertTrue(scheduled.isEmpty)
    }

    func test_aSilence_cancelsTheAlarm() async {
        let scheduler = MockBringAlarmScheduler()
        await BringAlarmCoordinator(scheduler: scheduler, enabled: true).apply(.silence(bringId: "b1"), mayAsk: false)

        let cancelled = await scheduler.cancelled
        XCTAssertEqual(cancelled, ["b1"])
    }

    func test_primingTheAuthorization_asksOnlyWhenUndetermined() async {
        let undetermined = MockBringAlarmScheduler(state: .notDetermined)
        await BringAlarmCoordinator(scheduler: undetermined, enabled: true).primeAuthorization()
        let denied = MockBringAlarmScheduler(state: .denied)
        await BringAlarmCoordinator(scheduler: denied, enabled: true).primeAuthorization()

        let first = await undetermined.authorizationRequests
        let second = await denied.authorizationRequests
        XCTAssertEqual(first, 1)
        XCTAssertEqual(second, 0)
    }
}

/// Le bouton de l'en-tête (#17442) : absent tant que la passerelle ne l'ouvre pas, quota dit, annule tant que ça sonne.
@MainActor
final class BringHeaderStateTests: XCTestCase {

    private func availability(available: Bool = true, remaining: Int? = 1) -> BringAvailability {
        BringAvailability(userId: "u1", available: available, perDay: 1, remainingToday: remaining)
    }

    func test_absentUntilTheGatewayOpensIt() {
        XCTAssertEqual(BringHeaderState.resolve(availability: nil, ringing: false), .hidden)
        XCTAssertEqual(BringHeaderState.resolve(availability: availability(available: false), ringing: true), .hidden)
    }

    func test_open_sends_andUnlimitedToo() {
        XCTAssertEqual(BringHeaderState.resolve(availability: availability(), ringing: false), .send)
        XCTAssertEqual(BringHeaderState.resolve(availability: availability(remaining: nil), ringing: false), .send)
    }

    func test_exhaustedStaysAndSaysTheQuota_butRingingWins() {
        XCTAssertEqual(BringHeaderState.resolve(availability: availability(remaining: 0), ringing: false), .exhausted)
        XCTAssertEqual(BringHeaderState.resolve(availability: availability(remaining: 0), ringing: true), .ringing)
    }
}

/// La bannière d'un Bring (#17442) : la catégorie que la passerelle pose (`BRING`) porte « Arrêter ».
@MainActor
final class BringNotificationCategoryTests: XCTestCase {

    func test_theBringCategory_isTheGatewaysLiteral_andCarriesStop() throws {
        var registered: Set<UNNotificationCategory> = []
        AppDelegate.registerNotificationCategories(bundle: .main) { registered = $0 }

        let bring = try XCTUnwrap(registered.first { $0.identifier == "BRING" })
        XCTAssertEqual(bring.actions.map(\.identifier), [MeeshyNotificationAction.stopBring.rawValue])
        XCTAssertFalse(bring.actions[0].options.contains(.foreground))
    }
}

/// « Arrêter » sur la bannière d'un Bring (#17442) : le Bring s'éteint, l'app ne s'ouvre pas.
@MainActor
final class BringStopActionTests: XCTestCase {

    private final class InertBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }

        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    func test_stopAction_stopsTheBringOfThePayload_withoutOpeningTheApp() async {
        var stopped: [String] = []
        var opened = 0
        let sut = NotificationActionHandler(
            backgroundTasks: InertBackgroundTasks(),
            authTokenProvider: { "jwt" },
            applyAuthToken: { _ in },
            openNotification: { _ in opened += 1 },
            stopBring: { stopped.append($0) }
        )

        await sut.handle(
            actionIdentifier: MeeshyNotificationAction.stopBring.rawValue,
            userInfo: ["type": "bring", "bringId": "b1"],
            replyText: nil
        )

        XCTAssertEqual(stopped, ["b1"])
        XCTAssertEqual(opened, 0)
    }

    func test_stopAction_withoutABringId_doesNothing() async {
        var stopped: [String] = []
        let sut = NotificationActionHandler(
            backgroundTasks: InertBackgroundTasks(),
            authTokenProvider: { "jwt" },
            applyAuthToken: { _ in },
            stopBring: { stopped.append($0) }
        )

        await sut.handle(actionIdentifier: MeeshyNotificationAction.stopBring.rawValue, userInfo: ["type": "bring"], replyText: nil)

        XCTAssertTrue(stopped.isEmpty)
    }
}
