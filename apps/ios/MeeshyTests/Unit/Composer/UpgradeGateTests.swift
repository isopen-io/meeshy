import XCTest
import Combine
import MeeshySDK
@testable import Meeshy

/// C4b — la moitié APP de la rupture cliente (plan
/// `docs/superpowers/plans/2026-08-20-meeshy-composer-lot-c.md`, tâche C4).
///
/// La moitié SDK (`AppVersionHeaderTests`) éprouve le dialecte : même
/// comparateur que le gateway, corps du 426 lu à la racine, signal posté avant
/// le throw. Ce qui reste, et que cette suite éprouve, c'est la RUPTURE
/// elle-même : deux entrées (le 426 vécu en pleine requête, et le plancher lu
/// au démarrage), une seule sortie, et **aucune sortie de secours**.
///
/// Le point qui distingue une porte d'un avertissement : `UpgradeGateView` n'a
/// pas de bouton de fermeture. Un utilisateur sous le plancher ne « continue
/// pas quand même » — le serveur refuse ses écritures, le laisser croire le
/// contraire ne lui rendrait pas service.
@MainActor
final class UpgradeGateTests: XCTestCase {

    // MARK: - Faux plancher

    private final class MockAppVersionFloorService: AppVersionFloorProviding {
        var result: Result<String, Error> = .success("")
        private(set) var callCount = 0

        func minVersion() async throws -> String {
            callCount += 1
            return try result.get()
        }
    }

    private struct ReseauCoupe: Error {}

    private func attendreLaPorte(
        _ controller: UpgradeGateController,
        _ declencheur: () -> Void
    ) async -> UpgradeRequirement? {
        let posee = expectation(description: "porte posée")
        var vue: UpgradeRequirement?
        // `dropFirst()` est OBLIGATOIRE : un `@Published` rejoue sa valeur
        // COURANTE à tout nouvel abonné. Sans lui, le second appel se
        // satisferait instantanément de la porte déjà posée par le premier —
        // et l'assertion « la dernière exigence l'emporte » lirait l'ancienne
        // en croyant lire la neuve.
        let abonnement = controller.$requirement
            .dropFirst()
            .compactMap { $0 }
            .sink { requirement in
                vue = requirement
                posee.fulfill()
            }
        declencheur()
        await fulfillment(of: [posee], timeout: 2)
        abonnement.cancel()
        return vue
    }

    // MARK: - État initial

    func test_requirement_auDemarrage_estNil() {
        let controller = UpgradeGateController(
            floor: MockAppVersionFloorService(),
            currentVersion: "1.0.0",
            center: NotificationCenter()
        )

        XCTAssertNil(controller.requirement)
        XCTAssertFalse(controller.isBlocked, "Une app démarre ouverte : la porte est une exception, pas un état.")
    }

    // MARK: - Entrée 1 — le 426 vécu en pleine requête

    func test_notificationDeRupture_recue_barreLApp() async {
        let center = NotificationCenter()
        let controller = UpgradeGateController(
            floor: MockAppVersionFloorService(),
            currentVersion: "1.0.0",
            center: center
        )

        let vue = await attendreLaPorte(controller) {
            UpgradeRequirement(minVersion: "1.2.0", storeUrl: "https://apps.apple.com/app/meeshy").post(via: center)
        }

        XCTAssertEqual(vue?.minVersion, "1.2.0")
        XCTAssertEqual(vue?.storeUrl, "https://apps.apple.com/app/meeshy",
                       "L'URL vient du SERVEUR (résolue par X-App-Platform), jamais du client.")
        XCTAssertTrue(controller.isBlocked)
    }

    func test_notificationDeRupture_recueDeuxFois_gardeLaDerniereExigence() async {
        let center = NotificationCenter()
        let controller = UpgradeGateController(
            floor: MockAppVersionFloorService(),
            currentVersion: "1.0.0",
            center: center
        )

        _ = await attendreLaPorte(controller) {
            UpgradeRequirement(minVersion: "1.2.0", storeUrl: nil).post(via: center)
        }
        let seconde = await attendreLaPorte(controller) {
            UpgradeRequirement(minVersion: "1.3.0", storeUrl: nil).post(via: center)
        }

        XCTAssertEqual(seconde?.minVersion, "1.3.0")
        XCTAssertTrue(controller.isBlocked, "Une porte fermée ne se rouvre jamais d'elle-même.")
    }

    // MARK: - Entrée 2 — le plancher lu au démarrage

    func test_checkFloor_plancherAuDessusDeLaVersionCourante_barreLApp() async {
        let center = NotificationCenter()
        let plancher = MockAppVersionFloorService()
        plancher.result = .success("1.2.0")
        let controller = UpgradeGateController(floor: plancher, currentVersion: "1.0.5", center: center)

        let vue = await attendreLaPorte(controller) {
            Task { await controller.checkFloor() }
        }

        XCTAssertEqual(vue?.minVersion, "1.2.0",
                       "Le bootstrap emprunte la MÊME porte que le 426 — une seule entrée dans l'état bloqué.")
        XCTAssertEqual(plancher.callCount, 1)
    }

    func test_checkFloor_plancherEgalALaVersionCourante_neBarrePas() async {
        let plancher = MockAppVersionFloorService()
        plancher.result = .success("1.2.0")
        let controller = UpgradeGateController(
            floor: plancher, currentVersion: "1.2.0", center: NotificationCenter()
        )

        await controller.checkFloor()

        XCTAssertNil(controller.requirement, "Le plancher est inclusif : être AU plancher, c'est être à jour.")
    }

    func test_checkFloor_plancherSousLaVersionCourante_neBarrePas() async {
        let plancher = MockAppVersionFloorService()
        plancher.result = .success("1.0.0")
        let controller = UpgradeGateController(
            floor: plancher, currentVersion: "1.2.0", center: NotificationCenter()
        )

        await controller.checkFloor()

        XCTAssertNil(controller.requirement)
    }

    func test_checkFloor_plancherVide_neBarrePas() async {
        let plancher = MockAppVersionFloorService()
        plancher.result = .success("")
        let controller = UpgradeGateController(
            floor: plancher, currentVersion: "0.0.1", center: NotificationCenter()
        )

        await controller.checkFloor()

        XCTAssertNil(
            controller.requirement,
            "MIN_APP_VERSION non défini est le DÉFAUT de prod : un plancher vide qui barrerait tout le "
            + "parc serait un interrupteur d'extinction déclenché par l'absence de configuration."
        )
    }

    func test_checkFloor_echecReseau_neBarrePasEtNeJettePas() async {
        let plancher = MockAppVersionFloorService()
        plancher.result = .failure(ReseauCoupe())
        let controller = UpgradeGateController(
            floor: plancher, currentVersion: "0.0.1", center: NotificationCenter()
        )

        await controller.checkFloor()

        XCTAssertNil(
            controller.requirement,
            "Best-effort et SILENCIEUX : un avion, un tunnel ou un gateway en redéploiement ne sont pas "
            + "des raisons de barrer une app qui fonctionne hors ligne en lecture."
        )
    }

    // MARK: - L'URL de repli

    func test_storeURL_quandLeServeurNEnDonnePas_retombeSurLAppStore() {
        let sansUrl = UpgradeRequirement(minVersion: "1.2.0", storeUrl: nil)

        XCTAssertEqual(UpgradeGateView.storeURL(for: sansUrl), UpgradeGateView.defaultStoreURL,
                       "Le bootstrap ne connaît pas de storeUrl : le bouton doit quand même mener quelque part.")
    }

    func test_storeURL_quandLeServeurEnDonneUne_laPrefere() {
        let avecUrl = UpgradeRequirement(minVersion: "1.2.0", storeUrl: "https://apps.apple.com/fr/app/meeshy/id123")

        XCTAssertEqual(UpgradeGateView.storeURL(for: avecUrl),
                       URL(string: "https://apps.apple.com/fr/app/meeshy/id123"))
    }

    func test_storeURL_quandLUrlServieEstIllisible_retombeSurLAppStore() {
        let cassee = UpgradeRequirement(minVersion: "1.2.0", storeUrl: "")

        XCTAssertEqual(UpgradeGateView.storeURL(for: cassee), UpgradeGateView.defaultStoreURL)
    }

    // MARK: - Gardes de source — les deux racines, et l'absence de sortie

    private func source(_ chemin: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // .../Unit/Composer
            .deletingLastPathComponent()   // .../Unit
            .deletingLastPathComponent()   // .../MeeshyTests
            .deletingLastPathComponent()   // .../apps/ios
            .appendingPathComponent(chemin)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// L'iPad a sa racine PROPRE (`iPadRootView`) : sans cette observation-là,
    /// un iPad prend des 426 bruts en pleine publication et ne voit JAMAIS
    /// l'écran de mise à jour. C'est la remarque G6 de la rév. 2 du plan, et
    /// c'est exactement le genre d'oubli qu'aucun test de comportement ne
    /// rattrape — les deux racines ne partagent pas une ligne.
    func test_lesDeuxRacines_montentLaPorte_enFullScreenCover() throws {
        for racine in ["Meeshy/Features/Main/Views/RootView.swift",
                       "Meeshy/Features/Main/Views/iPadRootView.swift"] {
            let texte = try source(racine)

            XCTAssertTrue(
                texte.contains("UpgradeGateView"),
                "\(racine) doit monter UpgradeGateView — l'iPad a sa racine propre, il ne l'hérite de personne."
            )
            XCTAssertTrue(
                texte.contains("fullScreenCover") && texte.contains("upgradeGate"),
                "\(racine) doit présenter la porte en fullScreenCover piloté par le contrôleur : "
                + "une sheet se referme d'un geste, une rupture non."
            )
        }
    }

    func test_lesDeuxRacines_amorcentLePlancherAuDemarrage() throws {
        for racine in ["Meeshy/Features/Main/Views/RootView.swift",
                       "Meeshy/Features/Main/Views/iPadRootView.swift"] {
            let texte = try source(racine)

            XCTAssertTrue(
                texte.contains("checkFloor()"),
                "\(racine) doit lire le plancher au démarrage : sans ce bootstrap, un binaire périmé qui "
                + "n'écrit rien ne rencontre jamais de 426 et croit être à jour indéfiniment."
            )
        }
    }

    /// La porte n'a AUCUN bouton de fermeture. On l'éprouve par ce que le
    /// fichier NE contient pas — et une garde négative ne vaut que si elle
    /// rougirait à la réintroduction de l'interdit : chacun des jetons listés
    /// ci-dessous est précisément ce qu'écrirait quelqu'un qui rajouterait une
    /// sortie (`dismiss()`, un `isPresented = false`, un bouton « Plus tard »).
    func test_upgradeGateView_nOffreAucuneSortie() throws {
        let texte = try source("Meeshy/Features/Main/Composer/UpgradeGateView.swift")

        for sortie in ["\\.dismiss", "dismiss()", "isPresented = false",
                       "presentationDragIndicator", "interactiveDismissDisabled(false)"] {
            XCTAssertFalse(
                texte.contains(sortie),
                "UpgradeGateView ne doit contenir aucune sortie — trouvé « \(sortie) ». "
                + "Une porte avec une poignée est un avertissement, pas une rupture."
            )
        }
    }
}
