import XCTest
import UIKit
@preconcurrency import UserNotifications
import MeeshySDK
@testable import Meeshy

/// « Tout va bien ? » (#18738) : l'action « Je vais bien » répond sans ouvrir l'app, le toucher de la bannière répond
/// aussi, l'extension pose la catégorie, et l'état d'un Sang se dit avec sa batterie et sa position seulement servies.
@MainActor
final class WellnessCheckNotificationTests: XCTestCase {

    private final class InertBackgroundTasks: BackgroundTaskScheduling {
        func beginTask(name: String, expirationHandler: (@Sendable () -> Void)?) -> UIBackgroundTaskIdentifier {
            UIBackgroundTaskIdentifier(rawValue: 7)
        }

        func endTask(_ identifier: UIBackgroundTaskIdentifier) {}
    }

    private func makeHandler(answers: @escaping () -> Void, opens: @escaping () -> Void) -> NotificationActionHandler {
        NotificationActionHandler(
            backgroundTasks: InertBackgroundTasks(),
            authTokenProvider: { "jwt" },
            applyAuthToken: { _ in },
            openNotification: { _ in opens() },
            answerWellness: { answers() }
        )
    }

    func test_category_offersIAmFine_withoutOpeningTheApp() throws {
        var registered: Set<UNNotificationCategory> = []
        AppDelegate.registerNotificationCategories(bundle: .main) { registered = $0 }

        let category = try XCTUnwrap(registered.first { $0.identifier == MeeshyNotificationCategory.wellnessCheck.rawValue })
        XCTAssertEqual(category.actions.map(\.identifier), [MeeshyNotificationAction.wellnessOk.rawValue])
        XCTAssertFalse(category.actions[0].options.contains(.foreground))
    }

    func test_iAmFineAction_answers_andDoesNotOpenTheApp() async {
        var answered = 0
        var opened = 0
        let sut = makeHandler(answers: { answered += 1 }, opens: { opened += 1 })

        await sut.handle(actionIdentifier: MeeshyNotificationAction.wellnessOk.rawValue,
                         userInfo: ["type": "wellness_check"], replyText: nil)

        XCTAssertEqual(answered, 1)
        XCTAssertEqual(opened, 0)
    }

    func test_tappingTheQuestion_isAlreadyAnAnswer() async {
        var answered = 0
        var opened = 0
        let sut = makeHandler(answers: { answered += 1 }, opens: { opened += 1 })

        await sut.handle(actionIdentifier: UNNotificationDefaultActionIdentifier,
                         userInfo: ["type": "wellness_check"], replyText: nil)

        XCTAssertEqual(answered, 1)
        XCTAssertEqual(opened, 1)
    }

    func test_tappingAnyOtherNotification_answersNothing() async {
        var answered = 0
        let sut = makeHandler(answers: { answered += 1 }, opens: {})

        await sut.handle(actionIdentifier: UNNotificationDefaultActionIdentifier,
                         userInfo: ["type": "inactivity_alert", "userId": "u1"], replyText: nil)

        XCTAssertEqual(answered, 0)
    }

    func test_theExtension_putsTheWellnessCategory_onTheQuestion() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("MeeshyNotificationExtension/NotificationService.swift")
        let source = AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
        let branch = try XCTUnwrap(source.range(of: "case \"wellness_check\":"), "la NSE ne range pas « Tout va bien ? »")
        let next = source[branch.upperBound...].prefix(80)
        XCTAssertTrue(next.contains("\"\(MeeshyNotificationCategory.wellnessCheck.rawValue)\""))
    }

    // MARK: - Les mots de l'état

    private let since = Date(timeIntervalSince1970: 1_800_000_000)

    private func state(battery: Int?, position: Bool) -> InactivityAlertState {
        InactivityAlertState(
            userId: "u1", inactiveSince: since, alertedAt: since.addingTimeInterval(43_200),
            lastPosition: position ? InactivityLastPosition(latitude: 48.85, longitude: 2.35, recordedAt: since) : nil,
            lastBattery: battery.map { InactivityLastBattery(level: $0, measuredAt: since) }
        )
    }

    func test_headline_saysSinceWhen_atTheReadersLocalTime() {
        let headline = InactivityCheckWording.headline(state(battery: nil, position: false), now: since)
        XCTAssertTrue(headline.contains(PhoneReachabilityWording.sinceTime(since, now: since)))
    }

    func test_batteryAndPosition_areOfferedOnlyWhenServed() {
        let bare = state(battery: nil, position: false)
        XCTAssertNil(InactivityCheckWording.battery(bare))
        XCTAssertNil(InactivityCheckWording.mapsURL(for: bare))

        let full = state(battery: 9, position: true)
        XCTAssertTrue(InactivityCheckWording.battery(full)?.contains("9") == true)
        XCTAssertEqual(InactivityCheckWording.mapsURL(for: full)?.absoluteString, "https://maps.apple.com/?ll=48.85,2.35")
    }

    func test_pillLabel_namesThePerson_orSaysSomeoneClose() {
        XCTAssertTrue(InactivityCheckWording.pillLabel(kind: .alert, name: "Jacques").contains("Jacques"))
        XCTAssertTrue(InactivityCheckWording.pillLabel(kind: .responded, name: "Jacques").contains("Jacques"))
        XCTAssertFalse(InactivityCheckWording.pillLabel(kind: .alert, name: nil).isEmpty)
    }
}
