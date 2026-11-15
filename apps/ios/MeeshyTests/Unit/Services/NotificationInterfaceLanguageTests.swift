import XCTest
import UserNotifications
import MeeshySDK
@testable import Meeshy

/// **Une notification déployée ne mélange plus deux langues** (#8951).
///
/// Appareil en anglais, app en français : les actions enregistrées par l'app
/// disaient « Ouvrir dans Plans », le bouton de l'extension de contenu « Open
/// in Maps ». L'app publie désormais sa langue dans le groupe d'app, et ses
/// catégories comme ses extensions la lisent par `InterfaceLanguageResolver`.
@MainActor
final class NotificationInterfaceLanguageTests: XCTestCase {

    // MARK: - Langue publiée par l'app

    func test_interfaceCode_explicitChoice_winsOverPrimaryAndRunningLanguage() {
        XCTAssertEqual(UILanguageOverride.interfaceCode(explicit: "fr", fallback: "de", running: "en"), "fr")
    }

    func test_interfaceCode_automaticChoice_followsPrimaryLanguage() {
        XCTAssertEqual(UILanguageOverride.interfaceCode(
            explicit: UILanguageOverride.automaticCode, fallback: "it", running: "en"), "it")
    }

    func test_interfaceCode_nothingChosen_publishesTheRunningLanguage() {
        XCTAssertEqual(UILanguageOverride.interfaceCode(explicit: nil, fallback: nil, running: "en"), "en")
    }

    func test_interfaceCode_unsupportedPrimary_publishesTheRunningLanguage() {
        XCTAssertEqual(UILanguageOverride.interfaceCode(explicit: nil, fallback: "ja", running: "es"), "es")
    }

    func test_publishInterfaceLanguage_unchangedCode_reportsNoChange() {
        let store = MockInterfaceLanguageStore()
        let first = UILanguageOverride.publishInterfaceLanguage(to: store)
        let second = UILanguageOverride.publishInterfaceLanguage(to: store)
        XCTAssertTrue(first)
        XCTAssertFalse(second)
        XCTAssertEqual(store.publishCallCount, 1)
        XCTAssertNotNil(store.publishedCode)
    }

    // MARK: - #11558 — le groupe d'app hors du fil principal

    /// `MeeshyApp.init` et la reprise de session publient la langue avant le
    /// premier rendu de la liste : le groupe d'app ne se touche que sur sa file.
    func test_publishInterfaceLanguageInBackground_touchesTheStoreOnlyOnItsQueue() {
        let io = AppGroupIO(label: "NotificationInterfaceLanguageTests.gated")
        let gate = DispatchSemaphore(value: 0)
        io.enqueue { gate.wait() }
        let store = ThreadRecordingInterfaceLanguageStore()

        UILanguageOverride.publishInterfaceLanguageInBackground(io: io, store: store)

        XCTAssertEqual(store.accesses, 0, "rien ne se lit ni ne s'écrit avant le tour de la file")
        gate.signal()
        io.drain()
        XCTAssertEqual(store.publishCallCount, 1)
        XCTAssertEqual(store.mainThreadAccesses, 0)
    }

    func test_publishInterfaceLanguageInBackground_changedLanguage_handsTheBundleBackOnTheMainActor() async {
        let io = AppGroupIO(label: "NotificationInterfaceLanguageTests.changed")
        let changed = expectation(description: "catégories réenregistrées")

        UILanguageOverride.publishInterfaceLanguageInBackground(
            io: io, store: ThreadRecordingInterfaceLanguageStore(),
            whenChanged: { _ in
                MainActor.assertIsolated()
                changed.fulfill()
            }
        )

        await fulfillment(of: [changed], timeout: 2)
    }

    func test_publishInterfaceLanguageInBackground_unchangedLanguage_keepsTheCategories() async {
        let io = AppGroupIO(label: "NotificationInterfaceLanguageTests.unchanged")
        let store = ThreadRecordingInterfaceLanguageStore()
        UILanguageOverride.publishInterfaceLanguage(to: store)
        let changed = expectation(description: "aucun réenregistrement")
        changed.isInverted = true

        UILanguageOverride.publishInterfaceLanguageInBackground(io: io, store: store, whenChanged: { _ in changed.fulfill() })

        await fulfillment(of: [changed], timeout: 0.5)
    }

    func test_scheduleNotificationCategoriesRegistration_readsTheGroupOnItsQueue() async {
        let io = AppGroupIO(label: "NotificationInterfaceLanguageTests.categories")
        let gate = DispatchSemaphore(value: 0)
        io.enqueue { gate.wait() }
        let store = ThreadRecordingInterfaceLanguageStore(publishedCode: "fr")
        let registered = expectation(description: "catégories enregistrées")

        AppDelegate.scheduleNotificationCategoriesRegistration(io: io, store: store, register: { _ in
            MainActor.assertIsolated()
            registered.fulfill()
        })

        XCTAssertEqual(store.accesses, 0)
        gate.signal()
        await fulfillment(of: [registered], timeout: 2)
        XCTAssertEqual(store.mainThreadAccesses, 0)
    }

    // MARK: - Catégories dans la langue publiée

    func test_categories_frenchPublishedEnglishDevice_titlesInFrench() throws {
        let titles = try detailActionTitles(published: "fr", device: ["en-US"])
        XCTAssertEqual(titles, ["Ouvrir dans Plans", "Ajouter aux contacts", "Rejoindre"])
    }

    func test_categories_englishPublishedFrenchDevice_titlesInEnglish() throws {
        let titles = try detailActionTitles(published: "en", device: ["fr-FR"])
        XCTAssertEqual(titles, ["Open in Maps", "Add to Contacts", "Join"])
    }

    func test_categories_unsupportedPublished_followDevice() throws {
        let titles = try detailActionTitles(published: "ja", device: ["de-DE"])
        XCTAssertEqual(titles.first, "In Karten öffnen")
    }

    // MARK: - Fabriques

    private func detailActionTitles(published: String?, device: [String]) throws -> [String] {
        let bundle = InterfaceLanguageResolver.bundle(
            for: .main, store: MockInterfaceLanguageStore(publishedCode: published), devicePreferred: device)
        let reply = UNTextInputNotificationAction(identifier: MeeshyNotificationAction.reply.rawValue, title: "R", options: [])
        let markRead = UNNotificationAction(identifier: MeeshyNotificationAction.markRead.rawValue, title: "L", options: [])
        let byId = Dictionary(uniqueKeysWithValues: NotificationDetailCategories
            .categories(reply: reply, markRead: markRead, bundle: bundle)
            .map { ($0.identifier, $0) })
        return try [MeeshyNotificationCategory.location, .contact, .invite].map {
            try XCTUnwrap(byId[$0.rawValue]?.actions.first?.title, $0.rawValue)
        }
    }
}

private final class MockInterfaceLanguageStore: InterfaceLanguageProviding {
    private(set) var publishedCode: String?
    private(set) var publishCallCount = 0

    init(publishedCode: String? = nil) {
        self.publishedCode = publishedCode
    }

    func publish(_ code: String?) {
        publishCallCount += 1
        publishedCode = code
    }
}

nonisolated private final class ThreadRecordingInterfaceLanguageStore: InterfaceLanguageProviding, @unchecked Sendable {
    private let lock = NSLock()
    private var code: String?
    private var publishes = 0
    private var touches = 0
    private var mainTouches = 0

    init(publishedCode: String? = nil) { code = publishedCode }

    var accesses: Int { lock.withLock { touches } }
    var mainThreadAccesses: Int { lock.withLock { mainTouches } }
    var publishCallCount: Int { lock.withLock { publishes } }

    var publishedCode: String? {
        note()
        return lock.withLock { code }
    }

    func publish(_ code: String?) {
        note()
        lock.withLock {
            publishes += 1
            self.code = code
        }
    }

    private func note() {
        let isMain = Thread.isMainThread
        lock.withLock {
            touches += 1
            if isMain { mainTouches += 1 }
        }
    }
}
