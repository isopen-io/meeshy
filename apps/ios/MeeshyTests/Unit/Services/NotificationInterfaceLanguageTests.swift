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
