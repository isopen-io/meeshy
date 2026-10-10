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

    // MARK: - Version du jeu

    /// Sans cet en-tête, la passerelle ne sert JAMAIS les badges de 1 000 et 5 000
    /// actions à ce client (rétrocompatibilité) : l'Obsidienne et le Prisme
    /// resteraient invisibles alors que le binaire sait les peindre.
    func test_buildHeaders_declareLaVersionDuJeuQueCeBinaireSaitLire() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertEqual(headers["X-Meeshy-Game-Version"], "2")
        XCTAssertEqual(GameRoutes.versionHeader, "X-Meeshy-Game-Version")
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

    // MARK: - Identité sans géolocalisation (extensions)

    /// Une extension (NSE) interroge les MÊMES routes que l'app mais ne peut
    /// pas attendre l'acteur ni toucher CoreLocation. Tant qu'elle recopiait
    /// ses en-têtes à la main, elle omettait `X-Canvas-Caps` : la passerelle
    /// lui servait la sentinelle « Mets à jour Meeshy », que l'app peignait au
    /// tap d'une notification de story (#7804).
    func test_identityHeaders_portentToutCeQueLaPasserelleNegocie() {
        let headers = ClientInfoProvider.identityHeaders()
        XCTAssertEqual(headers["X-Canvas-Caps"], "3")
        XCTAssertNotNil(headers["X-App-Version"])
        XCTAssertNotNil(headers["X-App-Platform"])
        XCTAssertNotNil(headers["X-Device-Locale"])
    }

    // MARK: - Capacités nommées (#9929)

    /// La passerelle ne sert l'étape `age` et `viewerWriteRestriction` dans
    /// `/me/onboarding` qu'au client qui déclare `onboarding-age` : sans
    /// l'en-tête, la carte « âge » ne naît jamais.
    func test_buildHeaders_declaresTheOnboardingAgeCapability() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        let declared = headers["X-Meeshy-Capabilities"]?.split(separator: ",").map(String.init) ?? []
        XCTAssertTrue(declared.contains("onboarding-age"))
    }

    func test_identityHeaders_declareTheSameCapabilitiesForExtensions() {
        XCTAssertEqual(ClientInfoProvider.identityHeaders()["X-Meeshy-Capabilities"], ClientCapabilities.headerValue())
    }

    func test_headerValue_joinsCapabilitiesWithCommas() {
        XCTAssertEqual(ClientCapabilities.headerName, "X-Meeshy-Capabilities")
        XCTAssertEqual(ClientCapabilities.headerValue([.onboardingAge]), "onboarding-age")
        XCTAssertEqual(ClientCapabilities.headerValue([]), "")
    }

    func test_identityHeaders_neLisentJamaisLaGeolocalisation() {
        let headers = ClientInfoProvider.identityHeaders()
        XCTAssertNil(headers["X-Meeshy-City"])
        XCTAssertNil(headers["X-Meeshy-Region"])
    }

    // MARK: - Aucun lieu GPS (#9612)

    /// La ville et la région partaient de la position GPS à chaque requête,
    /// hors de l'usage pour lequel la localisation avait été accordée. Le
    /// serveur situe une session par son adresse (base locale, #9609) : rien
    /// de la position de l'appareil ne doit plus partir, même autorisée.
    func test_buildHeaders_nEnvoieNiVilleNiRegion() async {
        let headers = await ClientInfoProvider.shared.buildHeaders()
        XCTAssertNil(headers["X-Meeshy-City"])
        XCTAssertNil(headers["X-Meeshy-Region"])
    }

    // MARK: - Nom d'appareil (#9610)

    /// Le nom LISIBLE se déduit du MODÈLE déclaré à côté — jamais du nom que
    /// l'utilisateur a donné à son appareil. Sur un hôte dont le modèle ne dit
    /// rien de sûr, l'en-tête est absent plutôt que faux.
    func test_identityHeaders_nommentLAppareilDepuisSonModele() {
        let headers = ClientInfoProvider.identityHeaders()
        let model = headers["X-Meeshy-Device"] ?? ""
        XCTAssertEqual(headers["X-Meeshy-Device-Name"], DeviceModelName.readable(forIdentifier: model))
    }

    // MARK: - Poignée de main de la socket (#9610)

    /// La socket ne peut pas porter les en-têtes : elle remet le MÊME relevé
    /// dans `handshake.auth.client`, sous les noms de champs du contrat
    /// (`CLIENT_SESSION_HEADERS`), valeur pour valeur.
    func test_socketAuthPayload_projetteLesEnTetesSousLesNomsDuContrat() throws {
        let headers = ClientInfoProvider.identityHeaders()
        let payload = ClientInfoProvider.socketAuthPayload()
        let client = try XCTUnwrap(payload["client"] as? [String: String])

        XCTAssertEqual(client["platform"], "ios")
        XCTAssertEqual(client["appVersion"], headers["X-Meeshy-Version"])
        XCTAssertEqual(client["appBuild"], headers["X-Meeshy-Build"])
        XCTAssertEqual(client["deviceModel"], headers["X-Meeshy-Device"])
        XCTAssertEqual(client["osVersion"], headers["X-Meeshy-OS"])
        XCTAssertEqual(client["timezone"], headers["X-Meeshy-Timezone"])
        XCTAssertEqual(client["deviceLocale"], headers["X-Device-Locale"])
        XCTAssertEqual(client["deviceName"], headers["X-Meeshy-Device-Name"])
    }

    /// Rien d'autre que le contrat ne part dans la poignée de main : ni le
    /// niveau de canvas, ni la porte de version, ni un lieu.
    func test_socketAuthPayload_neContientQueLesChampsDuContrat() throws {
        let client = try XCTUnwrap(ClientInfoProvider.socketAuthPayload()["client"] as? [String: String])
        let contrat: Set<String> = [
            "appVersion", "appBuild", "platform", "deviceModel",
            "osVersion", "timezone", "deviceLocale", "deviceName"
        ]
        XCTAssertTrue(Set(client.keys).isSubset(of: contrat), "Hors contrat : \(Set(client.keys).subtracting(contrat))")
    }

    /// Une SEULE source : ce que l'app envoie contient, valeur pour valeur,
    /// l'identité que l'extension envoie.
    func test_buildHeaders_contientLIdentiteValeurPourValeur() async {
        let identity = ClientInfoProvider.identityHeaders()
        let full = await ClientInfoProvider.shared.buildHeaders()
        for (key, value) in identity {
            XCTAssertEqual(full[key], value, "Divergence sur \(key)")
        }
    }
}
