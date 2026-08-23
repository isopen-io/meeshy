import XCTest
@testable import MeeshySDK

final class ClientInfoProviderTests: XCTestCase {

    private let requiredHeaderKeys = [
        "X-Meeshy-Version",
        "X-Meeshy-Build",
        "X-Meeshy-Platform",
        "X-Meeshy-Device",
        "X-Meeshy-OS",
        "X-Meeshy-Locale",
        "X-Device-Locale",
        "X-Meeshy-Timezone",
        "X-Canvas-Caps",
        "X-App-Version",
        "X-App-Platform"
    ]

    // MARK: - Required Keys

    func test_buildHeaders_always_includesAllRequiredKeys() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        for key in requiredHeaderKeys {
            XCTAssertNotNil(headers[key], "Missing required header: \(key)")
        }
    }

    // MARK: - Platform

    func test_buildHeaders_platformKey_isAlwaysIOS() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers["X-Meeshy-Platform"], "ios")
    }

    // MARK: - Capacités canvas

    /// Sans cet en-tête, le gateway prend iOS pour un client du passé et lui
    /// sert la SENTINELLE — un fond `1E1B4B` uni à la place du canevas
    /// (`storyEffectsV3.ts:467`, table de négociation O17). Or les DEUX
    /// composers écrivent déjà du v3 natif : le web (`StoryComposer.tsx:288`)
    /// et iOS lui-même (`StoryEffects.encode(to:)` passe par
    /// `CanvasV3(migrating:)`). Le parc natif ne voyait donc plus AUCUN canevas
    /// de story, y compris les siens, alors que son décodeur v3
    /// (`StoryModels.swift:1769`) sait les peindre depuis le lot B.
    ///
    /// La valeur est le NIVEAU que ce binaire sait lire, pas un booléen : le
    /// gateway compare `caps >= 3`. Un jour où v4 existera, c'est ce nombre qui
    /// devra monter — et ce test le dira.
    func test_buildHeaders_annonceLeNiveauDeCanvasQueCeBinaireSaitLire() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers["X-Canvas-Caps"], "3")
    }

    // MARK: - Porte de version

    /// La porte serveur (`services/gateway/src/utils/appVersion.ts`) ne juge
    /// que les requêtes qui PORTENT un `X-App-Version` : `isBelowFloor` rend
    /// `false` sur l'absence, délibérément — le web est exempt, et les binaires
    /// d'avant l'en-tête sont attrapés par le FORMAT. Un iOS qui oublierait cet
    /// en-tête ne serait donc jamais barré : la porte existerait sans jamais
    /// s'appliquer à personne.
    func test_buildHeaders_annonceLaVersionQueLaPorteServeurJuge() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers["X-App-Version"], AppVersionHeader.value())
    }

    /// `getAppStoreUrl(platform)` : `android` ⇒ Play Store, tout le reste ⇒
    /// App Store. Le `storeUrl` du 426 vient de là — sans cet en-tête, il
    /// serait correct sur iOS par accident, jamais par contrat.
    func test_buildHeaders_annonceLaPlateformeQuiResoutLUrlDuStore() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers["X-App-Platform"], "ios")
    }

    // MARK: - Locale Format

    func test_buildHeaders_localeKey_usesDashSeparator() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let locale = headers["X-Meeshy-Locale"]!
        XCTAssertFalse(locale.contains("_"), "Locale should use dashes, not underscores: \(locale)")
    }

    // MARK: - Timezone

    func test_buildHeaders_timezoneKey_isNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let timezone = headers["X-Meeshy-Timezone"]!
        XCTAssertFalse(timezone.isEmpty)
    }

    // MARK: - Version

    func test_buildHeaders_versionKey_isNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let version = headers["X-Meeshy-Version"]!
        XCTAssertFalse(version.isEmpty)
    }

    // MARK: - Caching

    func test_buildHeaders_returnsCachedResult() async {
        let headers1 = await ClientInfoProvider.shared.buildHeaders()
        let headers2 = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers1["X-Meeshy-Version"], headers2["X-Meeshy-Version"])
        XCTAssertEqual(headers1["X-Meeshy-Device"], headers2["X-Meeshy-Device"])
        XCTAssertEqual(headers1["X-Meeshy-OS"], headers2["X-Meeshy-OS"])
    }

    // MARK: - Consistency

    func test_buildHeaders_calledTwice_stableKeysMatch() async {
        let first = await ClientInfoProvider.shared.buildHeaders()
        let second = await ClientInfoProvider.shared.buildHeaders()

        let stableKeys = ["X-Meeshy-Platform", "X-Meeshy-Device", "X-Meeshy-OS", "X-Meeshy-Version", "X-Meeshy-Build"]
        for key in stableKeys {
            XCTAssertEqual(first[key], second[key], "Header \(key) should be stable across calls")
        }
    }

    // MARK: - Non-Empty Values

    func test_buildHeaders_requiredKeys_allValuesNonEmpty() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        for key in requiredHeaderKeys {
            let value = headers[key]
            XCTAssertNotNil(value, "\(key) should exist")
            XCTAssertFalse(value?.isEmpty ?? true, "\(key) should not be empty")
        }
    }
}
