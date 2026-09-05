import XCTest
@testable import MeeshySDK

/// `ReaderPrism` — la descente STRICTE du lecteur, UNE pour tout ce qui grave
/// ou affiche une traduction dans la conversation : la bulle, et la citation
/// gravée par le chemin REST comme par le chemin socket.
final class ReaderPrismTests: XCTestCase {

    // MARK: - La descente pure

    func test_resolve_ordersTheFourRanks() {
        XCTAssertEqual(
            ReaderPrism.resolve(systemLanguage: "fr", regionalLanguage: "es", customDestinationLanguage: "pt", deviceLocale: "it"),
            ["fr", "es", "pt", "it"]
        )
    }

    func test_resolve_dedupesCaseInsensitively_keepingTheFirstSpelling() {
        XCTAssertEqual(
            ReaderPrism.resolve(systemLanguage: "FR", regionalLanguage: "fr", customDestinationLanguage: nil, deviceLocale: "fr_FR"),
            ["FR"]
        )
    }

    func test_resolve_normalizesTheDeviceLocale_andSkipsWhatDoesNotNormalize() {
        XCTAssertEqual(
            ReaderPrism.resolve(systemLanguage: "fr", regionalLanguage: nil, customDestinationLanguage: nil, deviceLocale: "pt-BR"),
            ["fr", "pt"]
        )
        XCTAssertEqual(
            ReaderPrism.resolve(systemLanguage: "fr", regionalLanguage: nil, customDestinationLanguage: nil, deviceLocale: "@@@"),
            ["fr"]
        )
    }

    /// AUCUN repli « fr » : vide veut dire « aucune préférence », et la règle 1
    /// du Prisme sert alors l'original — jamais le premier venu.
    func test_resolve_withoutAnyPreference_isEmpty() {
        XCTAssertTrue(
            ReaderPrism.resolve(systemLanguage: nil, regionalLanguage: "", customDestinationLanguage: nil, deviceLocale: nil).isEmpty
        )
    }

    // MARK: - La locale appareil : serveur d'abord, appareil ensuite

    func test_deviceLocale_prefersTheServerPersistedValue() {
        let user = MeeshyUser(id: "u", username: "alice", deviceLocale: "it")
        XCTAssertEqual(ReaderPrism.deviceLocale(for: user, current: Locale(identifier: "es_ES")), "it")
    }

    func test_deviceLocale_fallsBackToTheDeviceItself_whenTheServerHasNone() {
        let user = MeeshyUser(id: "u", username: "alice", deviceLocale: "")
        XCTAssertEqual(ReaderPrism.deviceLocale(for: user, current: Locale(identifier: "es_ES")), "es")
        XCTAssertEqual(ReaderPrism.deviceLocale(for: nil, current: Locale(identifier: "de_DE")), "de")
    }

    // MARK: - Depuis l'utilisateur

    func test_resolveForUser_readsTheFourRanksOfTheUser() {
        let user = MeeshyUser(
            id: "u", username: "alice",
            systemLanguage: "fr", regionalLanguage: "en", customDestinationLanguage: "es"
        )
        XCTAssertEqual(ReaderPrism.resolve(for: user, current: Locale(identifier: "it_IT")), ["fr", "en", "es", "it"])
    }

    /// Sans session : la locale de l'appareil seule — un participant anonyme
    /// lit dans sa langue quand une traduction existe, l'original sinon.
    func test_resolveForNilUser_isTheDeviceLocaleAlone() {
        XCTAssertEqual(ReaderPrism.resolve(for: nil, current: Locale(identifier: "pt_BR")), ["pt"])
    }
}
