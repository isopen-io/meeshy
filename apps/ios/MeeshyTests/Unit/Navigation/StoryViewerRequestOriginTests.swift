import XCTest
@testable import Meeshy

/// **Un lien vers UNE story ouvre CETTE story** (#4903).
///
/// `StoryViewerRequest` portait déjà les deux champs nécessaires, et son
/// doc-comment énonçait la règle : « Les deep links / notifications ciblant un
/// contenu précis gardent `false` », et `postId` = « id exact du post story
/// quand le producteur le connaît (notification, deep link) ».
///
/// Le producteur du deep link faisait pourtant l'inverse — `startAtFirstUnviewed:
/// true`, aucun `postId` : le `postId` servait à TROUVER le groupe puis était
/// jeté. Mesuré au simulateur sur staging : le lecteur s'ouvrait sur le bon
/// groupe, à une autre story. Toute la machinerie d'aval existait déjà et
/// fonctionnait (`StoryViewerContainer` transmet `postId`, `StoryIndexResolver`
/// en calcule l'index) — **seul le site d'appel ne la nourrissait pas.**
///
/// La règle vit désormais dans une FABRIQUE plutôt que dans un doc-comment :
/// une intention se nomme, et un appelant qui se trompe de champ n'a plus
/// l'occasion de le faire.
@MainActor
final class StoryViewerRequestOriginTests: XCTestCase {

    /// **Le cas qui a mordu.** L'entrée nomme un contenu précis : elle le
    /// transporte, et n'invoque pas la première non vue.
    func test_lienVersUneStory_ciblleCetteStory_etNInvoquePasLaPremièreNonVue() {
        let requête = StoryViewerRequest.targetingStory(postId: "story-42", inGroup: "user-7")

        XCTAssertEqual(requête.postId, "story-42",
                       "Le postId doit VOYAGER : il est ce que le lien désigne.")
        XCTAssertFalse(requête.startAtFirstUnviewed,
                       "Cibler un contenu et démarrer à la première non vue s'excluent.")
        XCTAssertEqual(requête.id, "user-7")
    }

    /// **Le cas qui allait bien, et qui doit continuer.** Toucher un avatar ne
    /// nomme personne d'autre que l'auteur : là, la première non vue EST la
    /// bonne réponse. Sans ce témoin, un correctif du premier cas pourrait
    /// éteindre le second sans que rien ne rougisse.
    func test_toucherLeGroupe_démarreÀLaPremièreNonVue_sansCibler() {
        let requête = StoryViewerRequest.openingGroup(userId: "user-7")

        XCTAssertNil(requête.postId, "Aucun contenu n'est nommé par ce geste.")
        XCTAssertTrue(requête.startAtFirstUnviewed)
        XCTAssertEqual(requête.id, "user-7")
    }

    /// **Les deux intentions ne se confondent pas.** Le témoin porte sur la
    /// PAIRE de champs, parce que c'est leur combinaison qui décide — et que
    /// `StoryIndexResolver` documente précisément la zone où elles se marchent
    /// dessus (un index résolu à 0 retomberait sur la branche « non vue »).
    func test_lesDeuxIntentions_neProduisentJamaisLaMêmeCombinaison() {
        let ciblée = StoryViewerRequest.targetingStory(postId: "s1", inGroup: "u1")
        let groupe = StoryViewerRequest.openingGroup(userId: "u1")

        XCTAssertNotEqual(ciblée.startAtFirstUnviewed, groupe.startAtFirstUnviewed)
        XCTAssertNotNil(ciblée.postId)
        XCTAssertNil(groupe.postId)
    }
}

/// **La conversation demande le lecteur par une REQUÊTE** (#11197), comme les
/// racines : ses deux états (l'avatar de l'en-tête, l'anneau ou la citation
/// d'une bulle) se projettent en une `StoryViewerRequest` que monte le
/// couvercle unique.
@MainActor
final class ConversationStoryReaderRequestTests: XCTestCase {

    private func overlay(userId: String?, postId: String? = nil, slide: Int = 0,
                         firstUnviewed: Bool = false) -> ConversationOverlayState {
        var state = ConversationOverlayState()
        state.showStoryViewer = true
        state.storyViewerUserId = userId
        state.storyViewerPostId = postId
        state.storyViewerSlideIndex = slide
        state.storyViewerStartAtFirstUnviewed = firstUnviewed
        return state
    }

    private func header(userId: String?) -> ConversationHeaderState {
        var state = ConversationHeaderState()
        state.showStoryViewerFromHeader = true
        state.storyUserIdForHeader = userId
        return state
    }

    func test_rienDemandé_aucunLecteur() {
        XCTAssertNil(ConversationStoryReaderRequest.resolve(header: ConversationHeaderState(),
                                                            overlay: ConversationOverlayState()))
    }

    /// La citation d'une réponse à une story nomme une slide précise : elle
    /// VOYAGE jusqu'au lecteur, avec le post.
    func test_citationDUneStory_transporteLePostEtLaSlide() throws {
        let request = try XCTUnwrap(ConversationStoryReaderRequest.resolve(
            header: ConversationHeaderState(),
            overlay: overlay(userId: "u1", postId: "p9", slide: 2)
        ))
        XCTAssertEqual(request.id, "u1")
        XCTAssertEqual(request.postId, "p9")
        XCTAssertEqual(request.initialStoryIndex, 2)
        XCTAssertTrue(request.singleGroup, "depuis une conversation, on lit UNE personne")
        XCTAssertFalse(request.startAtFirstUnviewed)
    }

    func test_avatarDeLEnTête_litLaPersonneÀSaPremièreNonVue() throws {
        let request = try XCTUnwrap(ConversationStoryReaderRequest.resolve(
            header: header(userId: "u2"), overlay: ConversationOverlayState()
        ))
        XCTAssertEqual(request.id, "u2")
        XCTAssertTrue(request.singleGroup)
        XCTAssertTrue(request.startAtFirstUnviewed)
    }

    /// Sans auteur, l'ancien couvercle s'ouvrait sur « Story introuvable ».
    func test_sansAuteur_aucunLecteur() {
        XCTAssertNil(ConversationStoryReaderRequest.resolve(header: header(userId: nil),
                                                            overlay: overlay(userId: nil)))
    }
}

