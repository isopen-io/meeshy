import XCTest
@testable import MeeshyUI

/// S5 — arbitrage du bandeau de reprise dé-modalisé : QUI possède le slot unique
/// de `StoryDraftStore` entre le brouillon PROPOSÉ et le travail VIVANT ?
///
/// Première tentative (rejetée en revue) : deux bits, `isBannerVisible` pour la
/// visibilité et `isUndecided` pour la décision, ce dernier ne retombant que sur
/// « Reprendre » / « Recommencer ». Ranger le bandeau — le geste que S5 promeut
/// comme affordance PRINCIPALE de la page blanche — laissait donc `isUndecided`
/// levé POUR TOUTE LA SESSION : ni l'autosave débouncé ni celui du passage en
/// background n'écrivaient plus. Écrire un texte, poser une photo, ajouter une
/// slide, puis se faire tuer en arrière-plan = tout perdu, et c'est l'ANCIEN
/// brouillon qui revenait. C'était échanger l'invariant D1 (« une story en cours
/// d'édition survit au kill de l'app ») contre la protection d'un brouillon que
/// plus aucune surface ne permettait de reprendre.
///
/// Arbitrage retenu : **le brouillon en magasin n'est protégé que tant que
/// l'offre est POSÉE à l'écran.** Une fois le bandeau rangé, le composer
/// redevient un composer ordinaire — et c'est `composerHasContent` (déjà un
/// terme du gate) qui décide : rien de créé ⇒ rien n'est écrit, donc le
/// brouillon proposé survit intact jusqu'à l'ouverture suivante ; du contenu
/// RÉEL créé ⇒ il supplante l'offre que l'utilisateur a visiblement ignorée, et
/// il est protégé du kill. Ranger n'est toujours PAS jeter : seul
/// « Recommencer » efface le magasin sans rien mettre à la place.
final class DraftResumeStateTests: XCTestCase {

    // MARK: - Transitions du bandeau

    func test_offer_postsTheBanner() {
        var state = DraftResumeState()
        state.offer()

        XCTAssertTrue(state.isBannerVisible)
    }

    func test_hideBanner_afterAnAuthoringInteraction_ranksTheBannerAway() {
        var state = DraftResumeState()
        state.offer()
        state.hideBanner()

        XCTAssertFalse(
            state.isBannerVisible,
            "Le tap sur le canvas — et toute autre interaction d'authoring — range le bandeau."
        )
    }

    func test_decide_afterResumeOrDiscard_takesTheBannerDown() {
        var state = DraftResumeState()
        state.offer()
        state.decide()

        XCTAssertFalse(state.isBannerVisible)
    }

    // MARK: - Gate d'écrasement du brouillon en magasin

    // INVERSION CONSCIENTE (directive user 2026-08-02, point c) : l'ancien
    // terme `isEditingExistingStory` fermait l'autosave en édition — « un
    // brouillon semé depuis une session d'édition serait restauré comme une
    // NOUVELLE story ». Cette prémisse est caduque : le brouillon porte
    // désormais `editingPostId` (persisté par `persistDraft`/l'autosave), et
    // sa réouverture rouvre le mode ÉDITION. Une story mise en édition
    // revient donc en brouillon, comme tout travail en cours. Le terme a été
    // RETIRÉ de la signature — la garde de source
    // `StoryComposerPublishGateTests.test_theAutosaveGateNoLongerShutsOffForEditSessions`
    // interdit sa réintroduction.

}
