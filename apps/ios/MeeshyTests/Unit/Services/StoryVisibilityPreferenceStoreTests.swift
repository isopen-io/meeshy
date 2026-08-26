import XCTest
@testable import Meeshy
import MeeshyUI

/// C6 — le composer s'ouvre sur le dernier mode d'audience choisi.
/// Chaque test utilise une suite `UserDefaults` JETABLE : `MeeshyTests` est
/// hébergé dans `Meeshy.app`, donc écrire la vraie clé laisserait un résidu
/// visible dans le composer au lancement suivant.
@MainActor
final class StoryVisibilityPreferenceStoreTests: XCTestCase {

    private var suiteName: String!
    private var defaults: UserDefaults!

    override func setUp() {
        super.setUp()
        suiteName = "StoryVisibilityPreferenceStoreTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suiteName)
    }

    override func tearDown() {
        defaults.removePersistentDomain(forName: suiteName)
        defaults = nil
        suiteName = nil
        super.tearDown()
    }

    /// Loi produit 2026-08-23 : une story naît PUBLIQUE, comme un post et
    /// comme un réel. Le fallback n'est que le point de départ — le dernier
    /// mode retenu par l'auteur le remplace dès qu'il en choisit un.
    func test_lastVisibility_nothingStored_returnsPublic() {
        let store = StoryVisibilityPreferenceStore(defaults: defaults)
        XCTAssertEqual(store.lastVisibility(), PostVisibility.public.rawValue)
    }

    func test_remember_thenLastVisibility_returnsStoredMode() {
        let store = StoryVisibilityPreferenceStore(defaults: defaults)
        store.remember(PostVisibility.public.rawValue)
        XCTAssertEqual(store.lastVisibility(), PostVisibility.public.rawValue)
    }

    func test_remember_modeRequiringUserSelection_isIgnored() {
        let store = StoryVisibilityPreferenceStore(defaults: defaults)
        store.remember(PostVisibility.only.rawValue)
        XCTAssertEqual(store.lastVisibility(), PostVisibility.public.rawValue)

        store.remember(PostVisibility.except.rawValue)
        XCTAssertEqual(store.lastVisibility(), PostVisibility.public.rawValue)
    }

    func test_lastVisibility_corruptedStoredValue_returnsPublic() {
        defaults.set("NOT_A_VISIBILITY", forKey: StoryVisibilityPreferenceStore.key)
        let store = StoryVisibilityPreferenceStore(defaults: defaults)
        XCTAssertEqual(store.lastVisibility(), PostVisibility.public.rawValue)
    }

    func test_isRememberable_publicCommunityPrivate_returnsTrue() {
        for mode in [PostVisibility.public, .community, .private, .friends] {
            XCTAssertTrue(StoryVisibilityPreferenceStore.isRememberable(mode.rawValue), "\(mode)")
        }
        for mode in [PostVisibility.except, .only] {
            XCTAssertFalse(StoryVisibilityPreferenceStore.isRememberable(mode.rawValue), "\(mode)")
        }
    }
}
