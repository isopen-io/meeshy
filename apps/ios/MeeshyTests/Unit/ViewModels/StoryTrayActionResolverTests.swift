import XCTest
@testable import Meeshy

/// S5 — sémantique du tap sur l'avatar « Moi » et chaînage de la sheet
/// « Mes stories ».
///
/// AVANT : la même cible visuelle menait à DEUX destinations selon un état
/// invisible (`hasMyStory ? liste de gestion : composer`), et la destination
/// « avec story » était une LISTE, pas la story — soit 2 taps et un écran
/// interposé pour voir sa propre story. Le libellé VoiceOver, lui, annonçait
/// « Changer mon mood » alors que le tap ouvrait le composer.
///
/// SUPERSESSION 2026-07-14 → 2026-07-31 : la directive de juillet 14 (« taper
/// l'avatar Ma story ouvre TOUJOURS la liste de gestion ») était épinglée par
/// `StoryTrayMyStoryTapGuardTests`, supprimé avec ce lot. La directive du
/// 31 juillet l'inverse — le tap ouvre la story (alignement Instagram), la
/// gestion passe en appui long. Ce fichier hérite de l'invariant « avatar » ;
/// `StoryTraySheetChainingTests` hérite de celui de la mini-trail épinglée,
/// dont l'anneau « ma story » suivait la même règle.
final class StoryTrayActionResolverTests: XCTestCase {

    // MARK: - Tap sur l'avatar

    func test_avatarTap_withActiveStory_opensMyStoryViewer() {
        XCTAssertEqual(
            StoryTrayActionResolver.avatarTap(hasMyStory: true), .viewMyStory,
            "Le tap ouvre SA story, pas une liste de gestion (alignement Instagram)."
        )
    }

    func test_avatarTap_withoutStory_opensTheComposer() {
        XCTAssertEqual(StoryTrayActionResolver.avatarTap(hasMyStory: false), .createStory)
    }

    // MARK: - Libellé VoiceOver

    func test_avatarAccessibilityLabel_withoutStory_announcesCreateStory() {
        let label = StoryTrayActionResolver.avatarAccessibilityLabel(hasMyStory: false)
        XCTAssertEqual(
            label,
            StoryTrayCopy.createStory,
            "Régression directe : le libellé annonçait le mood alors que le tap ouvre le composer."
        )
    }

    func test_avatarAccessibilityLabel_withActiveStory_announcesViewMyStory() {
        XCTAssertEqual(
            StoryTrayActionResolver.avatarAccessibilityLabel(hasMyStory: true),
            StoryTrayCopy.viewMyStory
        )
    }

    func test_avatarAccessibilityLabel_describesTwoDistinctDestinations() {
        XCTAssertNotEqual(
            StoryTrayActionResolver.avatarAccessibilityLabel(hasMyStory: true),
            StoryTrayActionResolver.avatarAccessibilityLabel(hasMyStory: false),
            "Deux destinations différentes ne peuvent pas partager une seule annonce."
        )
    }

    // MARK: - Libellés de menu contextuel : localisés, jamais des littéraux

    func test_storyTrayCopy_isResolvedThroughTheCatalog_notHardcodedFrench() {
        // Les cinq libellés viennent du catalogue `.main`. Le test ne vérifie
        // pas une langue (le simulateur CI tourne en anglais) mais que chaque
        // entrée est NON VIDE et DISTINCTE — un littéral oublié ou une clé
        // absente produirait une chaîne vide ou un doublon.
        let labels = [
            StoryTrayCopy.viewMyStory,
            StoryTrayCopy.manageStories,
            StoryTrayCopy.addStory,
            StoryTrayCopy.changeMood,
            StoryTrayCopy.viewStories,
            StoryTrayCopy.viewProfile
        ]
        XCTAssertFalse(labels.contains(where: \.isEmpty))
        XCTAssertEqual(Set(labels).count, labels.count)
    }

    // MARK: - Chaînage de sheet

    func test_consume_afterSchedule_returnsTheActionExactlyOnce() {
        var followUp = DeferredSheetFollowUp<MyStoriesFollowUp>()
        followUp.schedule(.createStory)

        guard case .createStory = followUp.consume() else {
            return XCTFail("La première consommation doit rendre l'intention posée")
        }
        XCTAssertNil(followUp.consume(), "Une intention ne s'exécute jamais deux fois.")
    }

    func test_consume_withoutSchedule_returnsNil() {
        var followUp = DeferredSheetFollowUp<MyStoriesFollowUp>()
        XCTAssertNil(
            followUp.consume(),
            "Fermer la sheet sans intention (swipe-down) ne déclenche rien."
        )
    }

    func test_schedule_twice_keepsTheLatestAction() {
        var followUp = DeferredSheetFollowUp<MyStoriesFollowUp>()
        followUp.schedule(.createStory)
        followUp.schedule(.openViewer(postId: "p-9"))

        guard case .openViewer(let postId) = followUp.consume() else {
            return XCTFail("La dernière intention gagne")
        }
        XCTAssertEqual(postId, "p-9")
    }
}
