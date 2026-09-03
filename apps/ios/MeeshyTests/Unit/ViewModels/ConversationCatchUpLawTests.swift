import XCTest
@testable import Meeshy

/// **#3902 — le rattrapage cesse d'exiger une coïncidence de lot.**
///
/// > « Le rattrapage doit réussir dès que l'utilisateur est réellement au bas
/// > du fil chargé et stabilisé, indépendamment du lot précis dans lequel le
/// > message le plus récent a franchi son délai de présence. »
///
/// La loi est pure : ces témoins l'interrogent sans construire de modèle, sans
/// liste et sans horloge — ce qui est exactement ce qui manquait pour éprouver
/// le scénario de l'issue, qui est un scénario de COURSE.
final class ConversationCatchUpLawTests: XCTestCase {

    private static let m1 = "aaaaaaaaaaaaaaaaaaaaaaa1"
    private static let m2 = "aaaaaaaaaaaaaaaaaaaaaaa2"
    private static let m3 = "aaaaaaaaaaaaaaaaaaaaaaa3"

    private func law(newest: String?, atTip: Bool = true, seen: [String]?,
                     visible: [String] = [], memo: String? = nil) -> String? {
        ConversationCatchUpLaw.caughtUpId(
            newestServerId: newest, windowIsAtTip: atTip,
            seen: seen, visible: visible, memoized: memo
        )
    }

    // MARK: - 1. Le scénario de l'issue : un flux que le lot ne rattrape jamais

    /// **Le témoin qui était ROUGE avant ce lot.**
    ///
    /// On simule ce que produit une conversation à fort débit : à chaque
    /// vidange, le lot porte le message précédent — celui qui vient de finir
    /// son délai de présence — pendant qu'un message plus récent est DÉJÀ
    /// arrivé et affiché. La coïncidence `seen.contains(newest)` n'a lieu à
    /// aucun tour.
    ///
    /// Avant : rien ne se déclenchait, et `memoized` ne pouvait pas s'amorcer
    /// — elle ne retient un identifiant qu'après un premier succès qui n'a
    /// jamais lieu. Mesuré en production : curseur figé 27 jours.
    func test_aContinuousFlow_catchesUp_withoutASingleBatchCoincidence() {
        var memo: String? = nil
        var fired: [String] = []

        // Cinq tours : le lot est toujours EN RETARD d'un message.
        let flow = [(seen: "m0", newest: Self.m1),
                    (seen: Self.m1, newest: Self.m2),
                    (seen: Self.m2, newest: Self.m3)]

        for tour in flow {
            // Le plus récent est à l'écran — il n'a simplement pas fini son
            // délai de présence. C'est LA différence que `seen` ne peut pas dire.
            let id = law(newest: tour.newest, seen: [tour.seen],
                         visible: [tour.seen, tour.newest], memo: memo)
            if let id { fired.append(id); memo = id }
        }

        XCTAssertEqual(fired, [Self.m1, Self.m2, Self.m3],
                       "Chaque tour doit rattraper le message le plus récent AFFICHÉ.")
    }

    /// Et le même flux SANS le fait « visible » ne rattrape rien — c'est le
    /// comportement d'avant #3902, conservé à l'identique. Sans ce témoin, le
    /// précédent ne prouverait pas que c'est bien `visible` qui l'a débloqué.
    func test_theSameFlow_withoutTheVisibleFact_neverCatchesUp() {
        var memo: String? = nil
        for tour in [(seen: "m0", newest: Self.m1),
                     (seen: Self.m1, newest: Self.m2),
                     (seen: Self.m2, newest: Self.m3)] {
            let id = law(newest: tour.newest, seen: [tour.seen], visible: [], memo: memo)
            XCTAssertNil(id, "sans le fait « visible », la coïncidence de lot reste exigée")
            if let id { memo = id }
        }
    }

    // MARK: - 2. Ce que la loi REFUSE — et pourquoi ce n'est pas un oubli

    /// **Elle ne propose JAMAIS autre chose que le plus récent.**
    ///
    /// Côté passerelle, `caughtUpToMessageId` part avec
    /// `resetUnreadCount: true` : il ne fait pas avancer un curseur, il VIDE
    /// le badge. Proposer un message confirmé lu mais plus ancien effacerait
    /// du badge, sur tous les appareils, tout ce qui est arrivé APRÈS lui.
    ///
    /// C'est ce qui écarte la piste `hasNoGapBetween` : le trou dangereux
    /// n'est pas entre le curseur et le candidat, il est après le candidat.
    func test_itNeverProposesAnythingButTheNewest() {
        XCTAssertNil(law(newest: Self.m3, seen: [Self.m1, Self.m2], visible: [Self.m1, Self.m2]),
                     "deux messages confirmés ET affichés, mais pas le plus récent ⇒ rien")
    }

    /// Le scénario du test de régression volontaire — « rapporter dix messages
    /// sur deux cents ne veut pas dire que la conversation est lue ». Il reste
    /// vert par CONSTRUCTION : le plus récent n'y est ni vu ni affiché.
    func test_reportingOldMessages_leavesTheBadgeAlone() {
        XCTAssertNil(law(newest: Self.m2, seen: [Self.m1], visible: [Self.m1]))
    }

    /// Après un saut vers un message cité, le bas de l'écran n'est pas le bas
    /// de la conversation. Le fait « visible » ne doit pas contourner ça.
    func test_aWindowBelowTheTip_neverCatchesUp_evenWhenTheNewestIsOnScreen() {
        XCTAssertNil(law(newest: Self.m2, atTip: false, seen: [Self.m2], visible: [Self.m2]))
    }

    /// Appelant NON INFORMÉ (`seen == nil`) : la passerelle reste sur son repli
    /// par fenêtre temporelle, qui vide déjà le compteur. Annoncer un
    /// rattrapage par-dessus doublerait la décision.
    func test_anUninformedCaller_proposesNothing() {
        XCTAssertNil(law(newest: Self.m2, seen: nil, visible: [Self.m2]))
        XCTAssertNil(law(newest: Self.m2, seen: nil, visible: [Self.m2], memo: Self.m2))
    }

    /// Aucun message serveur (fenêtre vide, ou bulle optimiste sans ObjectId) :
    /// l'annoncer ferait rejeter le corps entier par la passerelle.
    func test_noServerMessage_proposesNothing() {
        XCTAssertNil(law(newest: nil, seen: [Self.m1], visible: [Self.m1]))
    }

    // MARK: - 3. Le rattrapage reste COLLANT

    /// Remonter dans l'historique après avoir touché le bas ne remet pas la
    /// conversation en retard tant qu'aucun message plus récent n'est arrivé.
    /// Sans ce repli, un lot ultérieur portant des messages anciens
    /// supplanterait dans l'outbox celui qui portait le rattrapage.
    func test_theCatchUpStaysSticky_whileNoNewerMessageArrives() {
        XCTAssertEqual(law(newest: Self.m2, seen: [Self.m1], visible: [Self.m1], memo: Self.m2),
                       Self.m2)
    }

    /// …mais elle cesse de coller dès qu'un message plus récent arrive.
    func test_theStickinessDies_assoonAsANewerMessageArrives() {
        XCTAssertNil(law(newest: Self.m3, seen: [Self.m1], visible: [Self.m1], memo: Self.m2))
    }

    // MARK: - 4. Le fait « visible » arrive VRAIMENT jusqu'à la loi

    /// La loi la plus juste ne sert à rien si personne ne lui donne le fait
    /// qu'elle attend. Trois maillons, trois assertions — c'est la leçon du
    /// dépôt sur les correctifs dont la valeur n'atteint aucun lecteur.
    func test_theVisibleFactTravelsFromTheListToTheLaw() throws {
        // L'UNITÉ du type : `visibleServerMessageIds()` et son site d'appel
        // vivent dans l'extension de suivi de lecture depuis #3947, sortie de
        // l'hôte pour le ramener sous le budget de taille.
        let controller = try [
            "Meeshy/Features/Main/Views/MessageListViewController.swift",
            "Meeshy/Features/Main/Views/MessageListViewController+SeenTracking.swift",
        ].map { try MyStoriesSourceCorpus.text(of: $0) }.joined(separator: "\n")
        let view = try MyStoriesSourceCorpus.text(
            of: "Meeshy/Features/Main/Views/ConversationView.swift")
        // Depuis #4942 le ViewModel est une FAMILLE (hôte + extensions par
        // responsabilité) : l'ancre vit dans l'hôte, mais une garde qui ne lit
        // qu'un fichier de la famille passerait à vide à la prochaine extraction.
        let model = try [
            "Meeshy/Features/Main/ViewModels/ConversationViewModel.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+Lifecycle.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+StoreObservation.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+InitialLoad.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+Send.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+ReplyReference.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+MessageActions.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+Translations.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+Projections.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+Search.swift",
            "Meeshy/Features/Main/ViewModels/ConversationViewModel+SocketDelegate.swift",
        ].map { try MyStoriesSourceCorpus.text(of: $0) }.joined(separator: "\n")
        XCTAssertGreaterThan(controller.count, 40_000)
        XCTAssertGreaterThan(view.count, 40_000)
        XCTAssertGreaterThan(model.count, 40_000)

        XCTAssertTrue(
            controller.contains("onMessagesSeen?(seen, visibleServerMessageIds())"),
            "La liste doit servir ce qu'elle MONTRE à chaque drain, en regard du lot."
        )
        XCTAssertTrue(
            view.contains("markAsRead(messageIds: seenIds, visibleIds: visibleIds)"),
            "L'hôte doit relayer le fait — un maillon muet le perd sans que rien ne rougisse."
        )
        XCTAssertTrue(
            model.contains("ConversationCatchUpLaw.caughtUpId("),
            "Le modèle doit CONSULTER la loi, jamais rejouer sa cascade."
        )
    }
}
