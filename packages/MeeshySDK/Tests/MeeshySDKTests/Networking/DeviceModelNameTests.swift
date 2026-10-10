import XCTest
@testable import MeeshySDK

/// #9610 — le nom d'appareil que `X-Meeshy-Device-Name` déclare se DÉDUIT du
/// modèle : « iPhone 15 Pro », jamais `iPhone16,1`, jamais le nom que
/// l'utilisateur a donné à son téléphone.
final class DeviceModelNameTests: XCTestCase {

    func test_readable_nommeUnModeleConnu() {
        XCTAssertEqual(DeviceModelName.readable(forIdentifier: "iPhone16,1", environment: [:]), "iPhone 15 Pro")
        XCTAssertEqual(DeviceModelName.readable(forIdentifier: "iPhone17,5", environment: [:]), "iPhone 16e")
        XCTAssertEqual(DeviceModelName.readable(forIdentifier: "iPhone14,6", environment: [:]), "iPhone SE (3rd generation)")
        XCTAssertEqual(DeviceModelName.readable(forIdentifier: "iPad16,3", environment: [:]), "iPad Pro 11-inch (M4)")
    }

    /// Un modèle sorti après ce binaire garde sa FAMILLE : on le reconnaît,
    /// sans lui inventer une génération.
    func test_readable_modeleInconnu_garde_saFamille() {
        XCTAssertEqual(DeviceModelName.readable(forIdentifier: "iPhone99,9", environment: [:]), "iPhone")
        XCTAssertEqual(DeviceModelName.readable(forIdentifier: "iPad99,1", environment: [:]), "iPad")
    }

    func test_readable_identifiantSansFamille_rendNil() {
        XCTAssertNil(DeviceModelName.readable(forIdentifier: "unknown", environment: [:]))
        XCTAssertNil(DeviceModelName.readable(forIdentifier: "", environment: [:]))
    }

    /// Sur simulateur, `uname` rend l'architecture de l'hôte : le modèle
    /// simulé se lit dans l'environnement, et le nom dit qu'il est simulé.
    func test_readable_simulateur_litLeModeleSimule() {
        let env = ["SIMULATOR_MODEL_IDENTIFIER": "iPhone17,1"]
        XCTAssertEqual(DeviceModelName.readable(forIdentifier: "arm64", environment: env), "iPhone 16 Pro (Simulator)")
        XCTAssertEqual(DeviceModelName.readable(forIdentifier: "x86_64", environment: env), "iPhone 16 Pro (Simulator)")
    }

    func test_readable_architectureSansModeleSimule_rendNil() {
        XCTAssertNil(DeviceModelName.readable(forIdentifier: "arm64", environment: [:]))
    }

    /// Le contrat serveur borne le champ à 64 caractères (`client-session.ts`) :
    /// aucun nom de la table ne doit y être tronqué.
    func test_readable_toutNomTientDansLeContrat() {
        let identifiers = ["iPad13,8", "iPad14,5", "iPhone12,8", "iPod9,1", "iPad15,5"]
        for identifier in identifiers {
            let name = DeviceModelName.readable(forIdentifier: identifier, environment: [:]) ?? ""
            XCTAssertFalse(name.isEmpty, identifier)
            XCTAssertLessThanOrEqual(name.count, 64, identifier)
        }
    }
}
