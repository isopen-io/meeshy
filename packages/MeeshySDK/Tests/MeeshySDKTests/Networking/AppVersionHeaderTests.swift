import XCTest
@testable import MeeshySDK

/// C4b — la moitié SDK de la rupture cliente (plan
/// `docs/superpowers/plans/2026-08-20-meeshy-composer-lot-c.md`, tâche C4).
///
/// Le gateway porte DÉJÀ la porte serveur (lot A, tâches A5/A6) :
/// `services/gateway/src/utils/appVersion.ts` compare `X-App-Version` à
/// `MIN_APP_VERSION` et répond `426 UPGRADE_REQUIRED` avec `minVersion` et
/// `storeUrl` **à la racine** du corps (`sendError` étale `details` à la
/// racine — `services/gateway/src/utils/response.ts`).
///
/// Ce que cette suite éprouve, c'est que le client parle EXACTEMENT le même
/// dialecte que ce juge-là. Un comparateur « raisonnable » mais différent
/// (SemVer strict, comparaison lexicographique, quatrième composante lue)
/// produirait un client qui se croit à jour quand le serveur le refuse, ou —
/// pire — qui se barre lui-même alors que le serveur le sert : les deux moitiés
/// d'une porte ne peuvent pas avoir deux avis.
///
/// Miroir de référence, ligne à ligne :
/// ```ts
/// export function compareAppVersions(a: string, b: string): number {
///   const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
///   const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
///   for (let i = 0; i < 3; i++) { const d = (pa[i] ?? 0) - (pb[i] ?? 0); if (d !== 0) return d; }
///   return 0;
/// }
/// export function isBelowFloor(header: string | undefined, floor: string): boolean {
///   if (!floor) return false;   // porte désarmée par défaut
///   if (!header) return false;  // ABSENCE = web ou binaire d'avant l'en-tête
///   return compareAppVersions(header, floor) < 0;
/// }
/// ```
final class AppVersionHeaderTests: XCTestCase {

    // MARK: - La valeur portée par l'en-tête

    func test_value_surNimporteQuelBundle_rendUneVersionCourteNonVide() {
        let version = AppVersionHeader.value()

        XCTAssertFalse(
            version.isEmpty,
            "Un en-tête vide vaudrait ABSENCE côté gateway (isBelowFloor rend false sur !header) : "
            + "le binaire passerait la porte sans jamais être jugé."
        )
    }

    func test_value_surNimporteQuelBundle_neContientQueDesChiffresEtDesPoints() {
        let version = AppVersionHeader.value()
        let autorises = CharacterSet(charactersIn: "0123456789.")

        XCTAssertTrue(
            version.unicodeScalars.allSatisfy { autorises.contains($0) },
            "Le comparateur du gateway lit des composantes numériques ; une version « 1.2.0-beta » "
            + "verrait sa 3e composante valoir 0. Rendu : \(version)"
        )
    }

    /// Le repli n'est pas une valeur neutre : c'est un ARBITRAGE. Un bundle
    /// sans `CFBundleShortVersionString` ne peut pas être jugé, et `0.0.0`
    /// décide que dans le doute la porte se FERME. La propriété qui compte
    /// n'est donc pas la constante elle-même mais ce qu'elle produit face au
    /// comparateur — et elle doit rester vraie si quelqu'un la change.
    func test_fallbackVersion_faceAToutPlancherArme_estEnDessous() {
        for plancher in ["0.0.1", "1.0.0", "1.2.0", "99.0.0"] {
            XCTAssertTrue(
                AppVersionHeader.isBelow(AppVersionHeader.fallbackVersion, floor: plancher),
                "Repli \(AppVersionHeader.fallbackVersion) contre plancher \(plancher) : dans le doute, la porte se ferme."
            )
        }
    }

    func test_fallbackVersion_faceAUnPlancherVide_nEstPasEnDessous() {
        XCTAssertFalse(
            AppVersionHeader.isBelow(AppVersionHeader.fallbackVersion, floor: ""),
            "Un plancher vide reste une porte DÉSARMÉE, même pour un binaire dont on ignore la version : "
            + "l'absence de configuration ne doit jamais devenir un interrupteur d'extinction."
        )
    }

    // MARK: - Le nom des en-têtes (contrat gateway)

    func test_headerNames_sontCeuxQueLeGatewayLit() {
        XCTAssertEqual(AppVersionHeader.versionHeaderName, "X-App-Version",
                       "routes/posts/core.ts lit request.headers['x-app-version'].")
        XCTAssertEqual(AppVersionHeader.platformHeaderName, "X-App-Platform",
                       "getAppStoreUrl(platform) résout le storeUrl du 426 par plateforme.")
        XCTAssertEqual(AppVersionHeader.platformValue, "ios",
                       "utils/appVersion.ts : 'android' ⇒ Play Store, TOUT LE RESTE ⇒ App Store.")
    }

    // MARK: - isBelow — miroir exact de isBelowFloor

    func test_isBelow_plancherVide_nEstJamaisEnDessous() {
        XCTAssertFalse(AppVersionHeader.isBelow("0.0.1", floor: ""),
                       "Plancher vide = porte DÉSARMÉE (MIN_APP_VERSION non défini est le défaut de prod).")
    }

    func test_isBelow_versionAbsente_nEstJamaisEnDessous() {
        XCTAssertFalse(AppVersionHeader.isBelow(nil, floor: "1.2.0"),
                       "ABSENCE d'en-tête = web ou binaire d'avant l'en-tête : le FORMAT juge, jamais l'absence.")
    }

    func test_isBelow_versionVide_nEstJamaisEnDessous() {
        XCTAssertFalse(AppVersionHeader.isBelow("", floor: "1.2.0"),
                       "En JS, `!header` attrape la chaîne vide autant que undefined.")
    }

    func test_isBelow_versionSousLePlancher_estEnDessous() {
        XCTAssertTrue(AppVersionHeader.isBelow("1.0.5", floor: "1.2.0"),
                      "Le cas nommé par le plan : 1.0.5 < 1.2.0 — le MINEUR l'emporte sur le patch.")
    }

    func test_isBelow_versionEgaleAuPlancher_nEstPasEnDessous() {
        XCTAssertFalse(AppVersionHeader.isBelow("1.2.0", floor: "1.2.0"),
                       "Le plancher est inclusif : `< 0`, jamais `<= 0`.")
    }

    func test_isBelow_versionAuDessusDuPlancher_nEstPasEnDessous() {
        XCTAssertFalse(AppVersionHeader.isBelow("1.2.1", floor: "1.2.0"))
        XCTAssertFalse(AppVersionHeader.isBelow("2.0.0", floor: "1.9.9"))
    }

    func test_isBelow_composanteManquante_vautZero() {
        XCTAssertFalse(AppVersionHeader.isBelow("1.2", floor: "1.2.0"),
                       "`pa[2] ?? 0` : « 1.2 » EST « 1.2.0 ».")
        XCTAssertTrue(AppVersionHeader.isBelow("1", floor: "1.0.1"),
                      "« 1 » vaut 1.0.0, donc sous 1.0.1.")
    }

    func test_isBelow_quatriemeComposante_estIgnoreeDesDeuxCotes() {
        XCTAssertFalse(AppVersionHeader.isBelow("1.2.0.9", floor: "1.2.0"),
                       "La boucle du gateway s'arrête à i < 3 : la 4e composante n'existe pas pour la porte.")
        XCTAssertFalse(AppVersionHeader.isBelow("1.2.0", floor: "1.2.0.9"),
                       "Symétriquement, un plancher à quatre composantes ne peut pas barrer un binaire égal sur trois.")
    }

    func test_isBelow_composanteNonNumerique_vautZero() {
        XCTAssertFalse(AppVersionHeader.isBelow("1.2.beta", floor: "1.2.0"),
                       "`parseInt('beta', 10) || 0` vaut 0 : « 1.2.beta » EST « 1.2.0 » pour la porte.")
        XCTAssertTrue(AppVersionHeader.isBelow("beta", floor: "1.0.0"),
                      "Une version entièrement illisible vaut 0.0.0 — sous tout plancher armé.")
    }

    func test_isBelow_prefixeNumerique_estLuCommeParseInt() {
        XCTAssertFalse(AppVersionHeader.isBelow("1.2.3rc1", floor: "1.2.3"),
                       "`parseInt('3rc1', 10)` vaut 3 — JS lit le PRÉFIXE numérique, il n'échoue pas.")
    }

    func test_isBelow_sansVersionExplicite_jugeLaVersionDuBundle() {
        XCTAssertEqual(
            AppVersionHeader.isBelow(floor: "99.0.0"),
            AppVersionHeader.isBelow(AppVersionHeader.value(), floor: "99.0.0"),
            "La surcharge sans argument DOIT juger exactement ce que l'en-tête transporte."
        )
        XCTAssertTrue(AppVersionHeader.isBelow(floor: "99.0.0"),
                      "Aucun binaire réel n'atteint 99.0.0 : le bootstrap doit conclure « en dessous ».")
    }

    // MARK: - Le corps du 426 — champs À LA RACINE

    private func corps(_ json: String) -> Data { Data(json.utf8) }

    func test_decoded_corps426DuGateway_litLesDeuxChampsALaRacine() {
        let requirement = UpgradeRequirement.decoded(fromResponseBody: corps("""
        {"success":false,"error":"App version outdated - update the app",\
        "message":"App version outdated - update the app","code":"UPGRADE_REQUIRED",\
        "minVersion":"1.2.0","storeUrl":"https://apps.apple.com/app/meeshy"}
        """))

        XCTAssertEqual(requirement.minVersion, "1.2.0")
        XCTAssertEqual(requirement.storeUrl, "https://apps.apple.com/app/meeshy")
    }

    func test_decoded_corps426Android_gardeLUrlServieParLeGateway() {
        let requirement = UpgradeRequirement.decoded(fromResponseBody: corps("""
        {"success":false,"code":"UPGRADE_REQUIRED","minVersion":"2.0.0",\
        "storeUrl":"https://play.google.com/store/apps/details?id=me.meeshy.app"}
        """))

        XCTAssertEqual(requirement.storeUrl, "https://play.google.com/store/apps/details?id=me.meeshy.app",
                       "Le client N'INVENTE PAS l'URL : elle est résolue par le serveur via X-App-Platform.")
    }

    func test_decoded_corps426SansPlancher_resteExploitable() {
        // `rejectNonV3StoryEffects` répond 426 même quand MIN_APP_VERSION est
        // vide : c'est le FORMAT qui est refusé, pas la version. La porte doit
        // quand même se montrer.
        let requirement = UpgradeRequirement.decoded(fromResponseBody: corps("""
        {"success":false,"code":"UPGRADE_REQUIRED","minVersion":"","storeUrl":"https://apps.apple.com/app/meeshy"}
        """))

        XCTAssertEqual(requirement.minVersion, "")
        XCTAssertEqual(requirement.storeUrl, "https://apps.apple.com/app/meeshy")
    }

    func test_decoded_corpsIllisible_rendUneExigenceNuePlutotQueRien() {
        let requirement = UpgradeRequirement.decoded(fromResponseBody: corps("<html>502</html>"))

        XCTAssertEqual(requirement.minVersion, "",
                       "Un corps illisible ne doit pas ANNULER la rupture — le 426 seul la déclenche.")
        XCTAssertNil(requirement.storeUrl)
    }

    // MARK: - Le signal — posté AVANT que l'erreur ne soit jetée

    func test_signal_statut426_posteLExigenceLueDansLeCorps() {
        let center = NotificationCenter()
        let recu = expectation(description: "meeshyUpgradeRequired")
        var porte: UpgradeRequirement?
        let jeton = center.addObserver(forName: .meeshyUpgradeRequired, object: nil, queue: nil) { note in
            porte = UpgradeRequirement(notification: note)
            recu.fulfill()
        }
        defer { center.removeObserver(jeton) }

        let rendu = UpgradeGateSignal.signal(
            statusCode: 426,
            body: corps("""
            {"success":false,"code":"UPGRADE_REQUIRED","minVersion":"1.2.0","storeUrl":"https://apps.apple.com/app/meeshy"}
            """),
            center: center
        )

        wait(for: [recu], timeout: 2)
        XCTAssertEqual(rendu?.minVersion, "1.2.0")
        XCTAssertEqual(porte?.minVersion, "1.2.0")
        XCTAssertEqual(porte?.storeUrl, "https://apps.apple.com/app/meeshy")
    }

    func test_signal_toutAutreStatut_neSignaleRien() {
        let center = NotificationCenter()
        var posts = 0
        let jeton = center.addObserver(forName: .meeshyUpgradeRequired, object: nil, queue: nil) { _ in posts += 1 }
        defer { center.removeObserver(jeton) }

        for statut in [200, 400, 401, 403, 409, 429, 500, 503] {
            XCTAssertNil(
                UpgradeGateSignal.signal(statusCode: statut, body: corps("{}"), center: center),
                "Seul 426 est une rupture. Un 403 qui barrerait l'app serait une porte fantôme."
            )
        }
        XCTAssertEqual(posts, 0)
    }

    // MARK: - Aller-retour par la notification

    func test_notification_allerRetour_conserveLesDeuxChamps() {
        let center = NotificationCenter()
        let recu = expectation(description: "aller-retour")
        var relu: UpgradeRequirement?
        let jeton = center.addObserver(forName: .meeshyUpgradeRequired, object: nil, queue: nil) { note in
            relu = UpgradeRequirement(notification: note)
            recu.fulfill()
        }
        defer { center.removeObserver(jeton) }

        UpgradeRequirement(minVersion: "3.1.4", storeUrl: "https://apps.apple.com/app/meeshy").post(via: center)

        wait(for: [recu], timeout: 2)
        XCTAssertEqual(relu, UpgradeRequirement(minVersion: "3.1.4", storeUrl: "https://apps.apple.com/app/meeshy"))
    }

    func test_init_notificationDUnAutreNom_nEstPasUneExigence() {
        let note = Notification(name: Notification.Name("me.meeshy.autreChose"), object: nil, userInfo: nil)
        XCTAssertNil(UpgradeRequirement(notification: note))
    }

    // MARK: - Le câblage : l'en-tête atteint vraiment la requête

    func test_buildURLRequest_porteLEnTeteDeVersionApplicative() async throws {
        let request = try await APIClient.shared._buildURLRequestForTesting(
            endpoint: APIClient.shared.legacyPath(for: PostsEndpoint.root))

        XCTAssertEqual(
            request.value(forHTTPHeaderField: AppVersionHeader.versionHeaderName),
            AppVersionHeader.value(),
            "Sans cet en-tête, `isBelowFloor` rend false sur l'ABSENCE : la porte serveur ne juge jamais ce binaire."
        )
    }

    func test_buildURLRequest_annonceLaPlateformeQuiResoutLUrlDuStore() async throws {
        let request = try await APIClient.shared._buildURLRequestForTesting(
            endpoint: APIClient.shared.legacyPath(for: PostsEndpoint.root))

        XCTAssertEqual(
            request.value(forHTTPHeaderField: AppVersionHeader.platformHeaderName),
            "ios",
            "getAppStoreUrl lit cet en-tête pour choisir entre App Store et Play Store."
        )
    }

    func test_buildURLRequest_lEnTeteDePorte_neSeConfondPasAvecLaTelemetrie() async throws {
        let request = try await APIClient.shared._buildURLRequestForTesting(
            endpoint: APIClient.shared.legacyPath(for: PostsEndpoint.root))

        XCTAssertNotNil(request.value(forHTTPHeaderField: "X-Meeshy-Version"),
                        "La télémétrie reste : deux contrats, deux en-têtes.")
        XCTAssertEqual(request.value(forHTTPHeaderField: "X-Meeshy-Version"),
                       request.value(forHTTPHeaderField: AppVersionHeader.versionHeaderName),
                       "Une SEULE lecture de CFBundleShortVersionString — les deux ne peuvent pas diverger.")
    }

    // MARK: - Garde de source : le funnel signale AVANT de jeter

    /// Le funnel d'`APIClient` tient une `URLSession` réelle avec épinglage de
    /// certificat : aucun test ne peut lui servir une réponse 426. Ce que la
    /// garde éprouve, c'est donc la seule chose qu'un test PEUT établir ici —
    /// que la branche 426 existe, qu'elle appelle le signal, et que cet appel
    /// PRÉCÈDE le `throw`. L'inverse (jeter d'abord) rendrait la porte
    /// dépendante du bon vouloir de chaque appelant à ne pas avaler l'erreur.
    func test_apiClient_brancheLeSignal426_avantDeJeterLErreur() throws {
        let source = try apiClientSource()

        guard let branche = source.range(of: "if statusCode == 426 {") else {
            return XCTFail("Aucune branche 426 dans le funnel d'APIClient — la porte n'a plus de sonnette.")
        }
        let corps = String(source[branche.upperBound...].prefix(600))

        guard let signal = corps.range(of: "UpgradeGateSignal.signal("),
              let jet = corps.range(of: "throw MeeshyError") else {
            return XCTFail("La branche 426 doit signaler ET jeter. Trouvé : \(corps.prefix(300))")
        }
        XCTAssertLessThan(
            signal.lowerBound, jet.lowerBound,
            "Le signal doit partir AVANT le throw : un appelant qui avale son erreur ne doit pas avaler la rupture."
        )
    }

    func test_apiClient_neSignale426_quePourLeStatut426() throws {
        let source = try apiClientSource()
        let appels = source.components(separatedBy: "UpgradeGateSignal.signal(").count - 1

        XCTAssertEqual(
            appels, 2,
            "Deux appels attendus, et deux seulement : le chemin nominal et le second passage après "
            + "rafraîchissement de jeton. Un troisième appel serait un chemin non éprouvé ; zéro serait "
            + "un funnel muet."
        )
    }

    private func apiClientSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Tests/MeeshySDKTests/Networking
            .deletingLastPathComponent()   // .../Tests/MeeshySDKTests
            .deletingLastPathComponent()   // .../Tests
            .deletingLastPathComponent()   // .../MeeshySDK
            .appendingPathComponent("Sources/MeeshySDK/Networking/APIClient.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }
}
