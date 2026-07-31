import XCTest
@testable import Meeshy

/// Le tap sur l'avatar « Moi » du tray doit toujours mener au travail existant.
///
/// Défaut corrigé (user 2026-08-01, « le /! dans le trail empêche d'afficher la
/// liste des storys ») : la liste devenait inatteignable par DEUX verrous
/// simultanés.
///
///  1. `StoryUploadOverlay` se pose sur l'avatar avec
///     `.allowsHitTesting(isFailed)` — en échec, il avalait le tap.
///  2. La décision sous-jacente ne regardait que `hasMyStory`, c'est-à-dire les
///     stories PUBLIÉES. Quand tout a échoué à publier, il n'y en a aucune :
///     le tap ouvrait un composer vierge, jamais la liste.
///
/// Une story en échec est du travail, et du travail se gère depuis « Mes
/// stories » — la seule surface qui offre reprise, retry et suppression.
@MainActor
final class StoryTrayAvatarTapResolverTests: XCTestCase {

    // MARK: - Le défaut corrigé

    func test_failedItemsOnly_withoutAnyPublishedStory_opensTheList() {
        XCTAssertEqual(
            StoryTrayAvatarTapResolver.action(hasPublishedStory: false,
                                              hasActiveUpload: false,
                                              hasFailedItems: true),
            .manageStories,
            "Tout a échoué à publier : le tap doit mener au travail récupérable, pas à un composer vierge")
    }

    func test_activeUploadOnly_withoutAnyPublishedStory_opensTheList() {
        XCTAssertEqual(
            StoryTrayAvatarTapResolver.action(hasPublishedStory: false,
                                              hasActiveUpload: true,
                                              hasFailedItems: false),
            .manageStories,
            "Un envoi en cours est du travail en attente : il se suit depuis la liste")
    }

    // MARK: - Comportements conservés

    func test_publishedStory_opensTheList() {
        XCTAssertEqual(
            StoryTrayAvatarTapResolver.action(hasPublishedStory: true,
                                              hasActiveUpload: false,
                                              hasFailedItems: false),
            .manageStories)
    }

    func test_nothingAtAll_opensTheComposer() {
        XCTAssertEqual(
            StoryTrayAvatarTapResolver.action(hasPublishedStory: false,
                                              hasActiveUpload: false,
                                              hasFailedItems: false),
            .createStory,
            "Sans aucun travail existant, le tap crée — c'est le comportement d'origine")
    }

    func test_anySourceOfWork_isEnough() {
        for (published, uploading, failed) in [(true, true, true),
                                               (true, false, true),
                                               (false, true, true)] {
            XCTAssertEqual(
                StoryTrayAvatarTapResolver.action(hasPublishedStory: published,
                                                  hasActiveUpload: uploading,
                                                  hasFailedItems: failed),
                .manageStories,
                "publiée=\(published) envoi=\(uploading) échec=\(failed)")
        }
    }
}
