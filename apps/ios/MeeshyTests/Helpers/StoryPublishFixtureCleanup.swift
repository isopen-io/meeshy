import Foundation
@testable import Meeshy
import MeeshySDK

/// `MeeshyTests` est hébergé dans `Meeshy.app` : tout résidu écrit par un test
/// de publication est VISIBLE dans l'app au lancement suivant (leçon
/// `reference_outbox_db_path_and_test_residue`). Les chemins pollués par ce
/// domaine sont la queue de publication (+ son historique d'échecs), les
/// dossiers médias hors-ligne, le cache GRDB du tray, les covers optimistes du
/// `DiskCacheStore` et la préférence d'audience.
///
/// À appeler en `tearDown` de TOUTE suite qui publie une story.
enum StoryPublishFixtureCleanup {

    /// Borne de balayage des covers optimistes : une fixture de test ne compose
    /// jamais plus de slides que ça.
    private static let maxFixtureSlides = 8

    @MainActor
    static func purge(_ vm: StoryViewModel?, defaults: UserDefaults = .standard) async {
        // 1. Capturer les tempStoryId AVANT `clearAll` : après, les covers
        //    optimistes seraient orphelines et invisibles au nettoyage.
        let tempIds = await StoryPublishQueue.shared.pendingItems.map(\.tempStoryId)
            + StoryPublishQueue.shared.failedPendingItems.map(\.tempStoryId)
        await StoryPublishQueue.shared.clearAll()

        for temp in tempIds {
            for idx in 0..<maxFixtureSlides {
                let id = StoryViewModel.optimisticStoryId(tempStoryId: temp, slideIndex: idx)
                await CacheCoordinator.shared.thumbnails.remove(
                    for: StoryCoverThumbnail.cacheKey(storyId: id)
                )
            }
            StoryViewModel.removeOfflineQueueMediaDirectory(tempStoryId: temp)
        }

        vm?.storyGroups = []
        // Écriture VIDE via le MÊME acteur : elle se sérialise APRÈS tout
        // `persistStoryCache()` encore en vol (fire-and-forget `Task`), sinon
        // l'invalidation courrait devant lui et le tray ressusciterait.
        await CacheCoordinator.shared.stories.mergeUpdate(for: StoryViewModel.storiesCacheKey) { _ in [] }
        await CacheCoordinator.shared.stories.invalidate(for: StoryViewModel.storiesCacheKey)

        defaults.removeObject(forKey: StoryVisibilityPreferenceStore.key)

        let root = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("meeshy_offline_queue")
        FileManager.default.removeItemLogging(at: root, context: "test fixture purge")
    }
}
