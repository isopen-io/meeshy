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

    func test_isComingSoon_blockScreenshots_returnsTrue() {
        XCTAssertTrue(PrivacySettingsView.isComingSoon(\.blockScreenshots))
    }

    func test_isComingSoon_allowCallsFromNonContacts_returnsTrue() {
        XCTAssertTrue(PrivacySettingsView.isComingSoon(\.allowCallsFromNonContacts))
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
