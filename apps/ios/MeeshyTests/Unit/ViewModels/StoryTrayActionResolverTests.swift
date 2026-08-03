import XCTest
@testable import Meeshy

/// Sémantique du tap sur l'avatar « Moi » et chaînage de la sheet
/// « Mes stories ».
///
/// Historique des directives, chacune supersédant la précédente :
/// - 2026-07-14 : le tap ouvre TOUJOURS la liste de gestion
///   (`StoryTrayMyStoryTapGuardTests`, supprimé au lot du 31/07) ;
/// - 2026-07-31 : inversion « alignement Instagram » — le tap ouvre la story,
///   la gestion passe en appui long ;
/// - 2026-08-02 (directive user, EN VIGUEUR) : retour à la LISTE — c'est elle
///   qui porte les onglets Publiées / Brouillons, invisibles tant que le tap
///   lançait la lecture directe. « Voir ma story » retourne au menu contextuel.
final class StoryTrayActionResolverTests: XCTestCase {

    // MARK: - Tap sur l'avatar

    func test_avatarTap_withActiveStory_opensTheManageSheet() {
        XCTAssertEqual(
            StoryTrayActionResolver.avatarTap(hasMyStory: true), .manageStories,
            "Le tap ouvre la liste « Mes stories » (Publiées / Brouillons), pas la lecture directe."
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

    func test_avatarAccessibilityLabel_withActiveStory_announcesManageStories() {
        XCTAssertEqual(
            StoryTrayActionResolver.avatarAccessibilityLabel(hasMyStory: true),
            StoryTrayCopy.manageStories,
            "Le libellé décrit la destination réelle : la liste de gestion."
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
