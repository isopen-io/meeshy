import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Le plafond d'audience d'une republication ne peut plus tomber en
/// silence** (#5053).
///
/// C'était le troisième des trois manques que `ComposerIntent` énumérait pour
/// justifier de router `.repost` vers l'atelier nu : « il ne passe ni
/// `allowedVisibilities` ni `initialVisibilityUserIds` à l'atelier, si bien que
/// le plafond d'audience du repost (loi 10) tomberait EN SILENCE ».
///
/// Le mot qui compte est **silence**. Un plafond absent ne rougit nulle part :
/// le sélecteur offre simplement une audience de plus, l'auteur la choisit, et
/// c'est le serveur qui refuse — un 403 `REPOST_AUDIENCE_WIDENING` au moment de
/// publier, c'est-à-dire après que la composition est faite. D'où un témoin sur
/// la RÈGLE plutôt que sur le câblage : le câblage se vérifie en lisant, la
/// règle se vérifie en tombant.
@MainActor
final class ComposerHydrationTests: XCTestCase {

    private func story(visibility: String?, userIds: [String]? = nil) -> StoryItem {
        var item = StoryItem(id: "story-\(UUID().uuidString)", content: "Bonjour")
        item.visibility = visibility
        item.visibilityUserIds = userIds
        return item
    }

    // MARK: - Republication : le plafond

    func test_republierUneStoryPublique_offreToutesLesAudiences() {
        let hydratation = ComposerHydration.repostingStory(story(visibility: "PUBLIC"),
                                                          authorHandle: "@alice")
        XCTAssertEqual(hydratation.allowedVisibilities,
                       [.public, .community, .friends, .except, .only, .private],
                       "Une source publique ne restreint rien.")
    }

    func test_republierUneStoryAmis_neLaisseQueAmisEtPrive() {
        let hydratation = ComposerHydration.repostingStory(story(visibility: "FRIENDS"),
                                                           authorHandle: "@alice")
        XCTAssertEqual(hydratation.allowedVisibilities, [.friends, .private],
                       "Même audience ou plus restreinte, jamais plus large (loi 10).")
    }

    /// **Le cas qui prouve que le plafond n'est pas décoratif.** Une story
    /// privée republiée ne peut aller QUE vers le privé ; sans plafond, le
    /// sélecteur offrirait les six, et le refus n'arriverait qu'après la
    /// composition.
    func test_republierUneStoryPrivee_neLaisseQueLePrive() {
        let hydratation = ComposerHydration.repostingStory(story(visibility: "PRIVATE"),
                                                           authorHandle: "@alice")
        XCTAssertEqual(hydratation.allowedVisibilities, [.private])
    }

    /// Une visibilité ABSENTE retombe sur le plus restrictif — jamais sur
    /// `PUBLIC` « parce que c'est le défaut du backend ». Ouvrir grand sur une
    /// donnée qu'on n'a pas su lire est le sens d'erreur le plus cher à
    /// réparer : le contenu est déjà parti.
    func test_uneSourceSansVisibilite_plafonneAuPlusRestrictif() {
        let hydratation = ComposerHydration.repostingStory(story(visibility: nil),
                                                           authorHandle: "@alice")
        XCTAssertEqual(hydratation.allowedVisibilities, [.private])
        XCTAssertEqual(hydratation.initialVisibility, PostVisibility.private.rawValue,
                       "Et elle OUVRE dessus : proposer plus large que le plafond serait "
                           + "offrir une faute que le serveur refuserait ensuite.")
    }

    // MARK: - Republication : le départ

    func test_uneRepublicationPartDeLAudienceDeSaSource() {
        let hydratation = ComposerHydration.repostingStory(story(visibility: "COMMUNITY"),
                                                           authorHandle: "@alice")
        XCTAssertEqual(hydratation.initialVisibility, "COMMUNITY",
                       "Pas le dernier choix mémorisé de l'auteur — celui de la source.")
    }

    func test_lesDestinatairesNommesDeLaSourceVoyagent() {
        let hydratation = ComposerHydration.repostingStory(
            story(visibility: "ONLY", userIds: ["u1", "u2"]),
            authorHandle: "@alice")
        XCTAssertEqual(hydratation.initialVisibilityUserIds, ["u1", "u2"],
                       "`ONLY` sans sa liste est une audience vide : le repost ne serait "
                           + "visible de personne, sans que rien ne le dise.")
    }

    func test_uneSourceSansDestinatairesNommes_rendUneListeVide_jamaisNil() {
        let hydratation = ComposerHydration.repostingStory(story(visibility: "PUBLIC"),
                                                           authorHandle: "@alice")
        XCTAssertTrue(hydratation.initialVisibilityUserIds.isEmpty)
    }

    // MARK: - Édition : l'ABSENCE est une décision

    /// **L'édition ne plafonne rien**, et le dire est la moitié utile de ce
    /// fichier : sans ce témoin, quelqu'un « harmoniserait » un jour les deux
    /// cas et interdirait à un auteur d'élargir l'audience de sa PROPRE story.
    func test_editerSaPropreStory_neSubitAucunPlafond() {
        let hydratation = ComposerHydration.editingStory(
            StoryComposerViewModel(editing: story(visibility: "FRIENDS")))
        XCTAssertNil(hydratation.allowedVisibilities,
                     "On ne restreint pas un auteur sur son propre contenu.")
    }

    /// **Et elle n'impose aucune audience de départ non plus.** Le ViewModel
    /// hydraté porte `editingInitialVisibility`, que `StoryComposerView.init`
    /// réassigne en PRIORITÉ ABSOLUE, après le paramètre injecté. En poser une
    /// ici ferait deux sources pour une même valeur, dont la seconde gagne
    /// toujours — la première serait morte tout en ayant l'air de décider.
    func test_editer_nImposeAucuneAudienceDeDepart_leViewModelLaPorte() {
        let hydratation = ComposerHydration.editingStory(
            StoryComposerViewModel(editing: story(visibility: "ONLY", userIds: ["u1"])))
        XCTAssertNil(hydratation.initialVisibility)
        XCTAssertTrue(hydratation.initialVisibilityUserIds.isEmpty)
    }

    // MARK: - La story reste atteignable

    /// **L'asymétrie des deux cas est un FAIT du type, donc elle se garde.**
    /// Une republication expose sa source (le publieur en tire `repostOfId`) ;
    /// une édition n'en a pas — son contenu vit dans le ViewModel. Sans ce
    /// témoin, « harmoniser » les deux cas paraîtrait une amélioration.
    func test_seuleUneRepublication_exposeUneStorySource() {
        let source = story(visibility: "PUBLIC")
        XCTAssertEqual(ComposerHydration.repostingStory(source, authorHandle: "@a").repostSource?.id,
                       source.id)
        XCTAssertNil(ComposerHydration.editingStory(StoryComposerViewModel(editing: source)).repostSource)
    }
}
