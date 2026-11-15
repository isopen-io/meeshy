import XCTest
import MeeshySDK
@testable import Meeshy

/// `BackgroundTaskManager.shouldRunBackgroundPrefetch` (BW-IOS-09) : le
/// `BGProcessingTask` de préchargement tirait jusqu'à 10 conversations × 30
/// messages toutes les ~30 min — réponses ET traductions incluses — sans
/// AUCUNE garde réseau, pour du contenu que l'utilisateur n'a pas demandé.
/// La planification ne posait que `requiresNetworkConnectivity`, qui ne
/// distingue pas le Wi-Fi du cellulaire. Décision pure, extraite pour être
/// couverte sans planifier de vraie BGTask.
///
/// Le videur d'outbox (`BGAppRefreshTask`) n'est PAS concerné : ce qu'il
/// envoie a été demandé par l'utilisateur.
final class BackgroundTaskManagerPrefetchPolicyTests: XCTestCase {

    func test_shouldRunBackgroundPrefetch_onWifi_returnsTrue() {
        XCTAssertTrue(BackgroundTaskManager.shouldRunBackgroundPrefetch(condition: .wifi))
    }

    func test_shouldRunBackgroundPrefetch_onGoodCellular_returnsFalse() {
        XCTAssertFalse(
            BackgroundTaskManager.shouldRunBackgroundPrefetch(condition: .goodCellular),
            "un BON cellulaire reste du cellulaire : un préchargement différable ne le consomme pas"
        )
    }

    func test_shouldRunBackgroundPrefetch_onBadCellular_returnsFalse() {
        XCTAssertFalse(BackgroundTaskManager.shouldRunBackgroundPrefetch(condition: .badCellular))
    }

    func test_shouldRunBackgroundPrefetch_offline_returnsFalse() {
        XCTAssertFalse(
            BackgroundTaskManager.shouldRunBackgroundPrefetch(condition: .offline),
            "hors ligne, la tâche se termine immédiatement — le rendez-vous suivant est déjà replanifié"
        )
    }
}
