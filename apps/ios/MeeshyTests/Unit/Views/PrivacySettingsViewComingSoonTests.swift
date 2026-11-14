import XCTest
@testable import Meeshy
import MeeshySDK

// #17652 — la confidentialité ne montre plus de rangée sans effet : les quatre bascules « Bientôt disponible »
// (partage de données, captures, demandes de contact, invitations de groupe) ont quitté l'écran, avec leur garde
// `isComingSoon`. Le témoin de leur absence est `EpureReglagesLiensTests`.
/// #11296 — « Masquer mon adresse IP dans les appels » : la connexion d'un appel ne passe
/// plus que par le relais TURN, sur TOUTES les connexions (appel à deux, maillage de groupe).
/// Réglage de l'APPAREIL (l'adresse est celle de cet appareil), coupé par défaut.
final class CallAddressPrivacyTests: XCTestCase {
    private func defaults() -> UserDefaults {
        let suite = "CallAddressPrivacyTests.\(UUID().uuidString)"
        let store = UserDefaults(suiteName: suite)!
        addTeardownBlock { UserDefaults().removePersistentDomain(forName: suite) }
        return store
    }

    func test_transport_parDefaut_laisseToutesLesRoutes() {
        XCTAssertEqual(CallAddressPrivacySetting.transport(in: defaults()), .all)
    }

    func test_transport_adresseMasquee_neGardeQueLeRelais() {
        let store = defaults()
        store.set(true, forKey: CallAddressPrivacySetting.key)
        XCTAssertEqual(CallAddressPrivacySetting.transport(in: store), .relayOnly)
    }

    #if canImport(WebRTC)
    @MainActor
    func test_configuration_relaisSeul_poseLaPolitiqueRelay() {
        XCTAssertEqual(WebRTCPeerConfiguration.make(iceServers: [], transport: .relayOnly).iceTransportPolicy, .relay)
        XCTAssertEqual(WebRTCPeerConfiguration.make(iceServers: [], transport: .all).iceTransportPolicy, .all)
    }
    #endif

    func test_toutesLesConnexions_passentParLaMemeConfiguration() throws {
        let racine = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        let dossier = racine.appendingPathComponent("Meeshy/Features/Call/Services/WebRTC")
        for nom in ["P2PWebRTCClient.swift", "WebRTCGroupPeerLink.swift"] {
            let code = try String(contentsOf: dossier.appendingPathComponent(nom), encoding: .utf8)
            XCTAssertFalse(code.contains("RTCConfiguration()"), "\(nom) : une connexion construite à la main échappe au réglage")
            XCTAssertTrue(code.contains("transport: CallAddressPrivacySetting.transport()"), nom)
        }
        let reglages = try String(contentsOf: racine.appendingPathComponent("Meeshy/Features/Settings/Views/PrivacySettingsView.swift"),
                                  encoding: .utf8)
        XCTAssertTrue(reglages.contains("@AppStorage(CallAddressPrivacySetting.key)"), "le réglage vit dans Confidentialité")
    }
}
