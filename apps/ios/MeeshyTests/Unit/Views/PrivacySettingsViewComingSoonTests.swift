import XCTest
@testable import Meeshy
import MeeshySDK

/// P1 (placebo audit 2026-07-20) — 5 bascules de confidentialité étaient
/// persistées/synchronisées mais appliquées nulle part (ni iOS ni gateway),
/// donnant un faux sentiment de confidentialité. `isComingSoon` est le coeur
/// pur de la décision « quelle bascule griser » — extrait pour être
/// testable sans construire `PrivacySettingsView` (mêmes contraintes
/// SwiftUI @State que documentées pour `StoryViewerView`).
///
/// Remédiation B12 (2026-07-21) : `allowContactRequests` et
/// `allowGroupInvites` rejoignent le lot — même pattern « persisté/synchronisé
/// mais appliqué nulle part » : aucune route gateway (friends.ts,
/// conversations/participants.ts) ni aucun code iOS ne consulte ces deux
/// préférences avant de créer une demande de contact ou d'ajouter un membre
/// à un groupe. `PrivacyPreferencesService` ne les expose qu'à
/// `PresenceVisibilityService` / lecture des accusés de réception — jamais à
/// la création de demande d'ami ou d'invitation de groupe.
final class PrivacySettingsViewComingSoonTests: XCTestCase {

    // MARK: - Les bascules encore sans effet (six depuis #8105)

    /// Appliqué par la passerelle à toute recherche par identifiant, et à
    /// l'annonce « X a rejoint Meeshy » (#8104, #8105) : l'interrupteur a un
    /// effet, il n'est plus « bientôt ».
    func test_isComingSoon_hideProfileFromSearch_isLiveSinceTheGatewayAppliesIt() {
        XCTAssertFalse(PrivacySettingsView.isComingSoon(\.hideProfileFromSearch))
    }

    /// La passerelle lit ce réglage avant d'annoncer « X était sur Meeshy
    /// récemment » (#8285) : l'interrupteur a un effet dès sa naissance.
    func test_isComingSoon_notifyContactsOnReturn_isLiveSinceTheGatewayAppliesIt() {
        XCTAssertFalse(PrivacySettingsView.isComingSoon(\.notifyContactsOnReturn))
    }

    func test_isComingSoon_blockScreenshots_returnsTrue() {
        XCTAssertTrue(PrivacySettingsView.isComingSoon(\.blockScreenshots))
    }

    /// La passerelle refuse de faire sonner un non-contact quand le réglage
    /// est coupé (#8073) : l'interrupteur a un effet, il n'est plus « bientôt ».
    func test_isComingSoon_acceptCallsFromNonContacts_isLiveSinceTheGatewayAppliesIt() {
        XCTAssertFalse(PrivacySettingsView.isComingSoon(\.acceptCallsFromNonContacts))
    }

    func test_isComingSoon_saveMediaToGallery_returnsTrue() {
        XCTAssertTrue(PrivacySettingsView.isComingSoon(\.saveMediaToGallery))
    }

    func test_isComingSoon_shareUsageData_returnsTrue() {
        XCTAssertTrue(PrivacySettingsView.isComingSoon(\.shareUsageData))
    }

    func test_isComingSoon_allowContactRequests_returnsTrue() {
        XCTAssertTrue(PrivacySettingsView.isComingSoon(\.allowContactRequests))
    }

    func test_isComingSoon_allowGroupInvites_returnsTrue() {
        XCTAssertTrue(PrivacySettingsView.isComingSoon(\.allowGroupInvites))
    }

    // MARK: - Toggles that DO have a real effect elsewhere — must stay interactive

    func test_isComingSoon_showOnlineStatus_returnsFalse() {
        XCTAssertFalse(PrivacySettingsView.isComingSoon(\.showOnlineStatus))
    }

    func test_isComingSoon_showReadReceipts_returnsFalse() {
        XCTAssertFalse(PrivacySettingsView.isComingSoon(\.showReadReceipts))
    }

    func test_isComingSoon_showTypingIndicator_returnsFalse() {
        XCTAssertFalse(PrivacySettingsView.isComingSoon(\.showTypingIndicator))
    }

    func test_isComingSoon_allowAnalytics_returnsFalse() {
        XCTAssertFalse(PrivacySettingsView.isComingSoon(\.allowAnalytics))
    }

    func test_isComingSoon_showLastSeen_returnsFalse() {
        XCTAssertFalse(PrivacySettingsView.isComingSoon(\.showLastSeen))
    }
}

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
        let dossier = racine.appendingPathComponent("Meeshy/Features/Main/Services/WebRTC")
        for nom in ["P2PWebRTCClient.swift", "WebRTCGroupPeerLink.swift"] {
            let code = try String(contentsOf: dossier.appendingPathComponent(nom), encoding: .utf8)
            XCTAssertFalse(code.contains("RTCConfiguration()"), "\(nom) : une connexion construite à la main échappe au réglage")
            XCTAssertTrue(code.contains("transport: CallAddressPrivacySetting.transport()"), nom)
        }
        let reglages = try String(contentsOf: racine.appendingPathComponent("Meeshy/Features/Main/Views/PrivacySettingsView.swift"),
                                  encoding: .utf8)
        XCTAssertTrue(reglages.contains("@AppStorage(CallAddressPrivacySetting.key)"), "le réglage vit dans Confidentialité")
    }
}
