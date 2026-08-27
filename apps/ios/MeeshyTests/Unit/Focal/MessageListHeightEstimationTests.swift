// apps/ios/MeeshyTests/Unit/Focal/MessageListHeightEstimationTests.swift

import XCTest
import UIKit
import GRDB
@testable import Meeshy
@testable import MeeshySDK

/// **Une rangée qui entre à l'écran arrive à sa hauteur, jamais étirée**
/// (issue #4041).
///
/// La liste sert au layout compositionnel UNE hauteur estimée
/// (`.estimated(h)`, une seule section `.main` : il n'y a pas de canal par
/// item). Tant que cette estimation valait la cote d'une TÊTE DE GROUPE
/// (150 pt) alors que la population dominante du fil est la rangée DE SUITE
/// (~51 pt mesurés), chaque cellule réalisée arrivait ~100 pt trop haute puis
/// se rétractait — mesuré sur capture le 2026-08-27 : 114 pt à l'entrée,
/// 51 pt une fois posée, résorption en ~150 ms.
///
/// La loi ci-dessous décide QUAND remplacer l'estimation servie par ce que
/// le fil mesure vraiment. Trois exigences, dans cet ordre :
///
/// 1. **Ne jamais osciller.** Adopter une estimation déclenche une
///    invalidation COMPLÈTE du layout ; s'y reprendre à chaque pose coûterait
///    plus cher que le défaut corrigé. La loi doit donc être un POINT FIXE :
///    ré-appliquée à ce qu'elle vient de rendre, elle ne propose plus rien.
/// 2. **Ne jamais adopter sur une poignée de cellules** — une conversation
///    ouverte sur trois messages n'enseigne rien sur le fil.
/// 3. **Rester bornée** : un fil de médias plein écran ne doit pas pousser
///    l'estimation à la hauteur d'un écran, sans quoi la liste réaliserait
///    une cellule par frame.
///
/// L'échantillon est l'état RÉEL du layout (hauteurs des items visibles), et
/// non les seules corrections de self-sizing : n'échantillonner que les
/// cellules qui INVALIDENT biaise vers celles dont l'estimation est déjà
/// fausse — la loi oscillerait entre la rangée de suite et la tête de groupe.
@MainActor
final class MessageListHeightEstimationTests: XCTestCase {

    // MARK: - Le défaut mesuré

    func test_proposal_flatRowsUnderHeadOfGroupEstimate_proposesTheMeasuredHeight() {
        let visible = Array(repeating: CGFloat(51), count: 8)

        XCTAssertEqual(
            MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: 150),
            51,
            "l'estimation servie (150, cote d'une tête de groupe) est franchement au-dessus de ce que le fil mesure (51) — c'est le défaut #4041 : chaque rangée entre étirée de ~100 pt puis se rétracte."
        )
    }

    // MARK: - Point fixe (exigence n°1 : jamais d'oscillation)

    func test_proposal_appliedToItsOwnResult_proposesNothing() {
        let visible = Array(repeating: CGFloat(51), count: 8)
        guard let adopted = MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: 150) else {
            return XCTFail("le premier passage doit proposer une estimation")
        }

        XCTAssertNil(
            MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: adopted),
            "ré-appliquée à ce qu'elle vient de rendre, la loi ne propose plus rien — sans quoi chaque pose déclencherait une invalidation complète du layout."
        )
    }

    func test_proposal_headsOfGroupMixedWithFollowRows_staysOnTheDominantPopulation() {
        // Deux têtes de groupe (69) pour six rangées de suite (51) : la
        // médiane suit la population dominante, la moyenne se laisserait
        // tirer par les têtes.
        let visible: [CGFloat] = [69, 51, 51, 51, 51, 51, 51, 69]

        XCTAssertEqual(
            MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: 150),
            51,
            "la médiane suit la population dominante du fil ; une minorité de têtes de groupe ne doit pas ramener l'estimation vers l'ancienne cote."
        )
    }

    // MARK: - Écart insuffisant (le remède plus cher que le mal)

    func test_proposal_estimateAlreadyCloseEnough_proposesNothing() {
        let visible = Array(repeating: CGFloat(56), count: 8)

        XCTAssertNil(
            MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: 51),
            "5 pt d'écart ne justifient pas une invalidation complète : sous le seuil d'adoption, la loi se tait."
        )
    }

    // MARK: - Échantillon insuffisant (exigence n°2)

    func test_proposal_tooFewVisibleRows_proposesNothing() {
        let visible = Array(repeating: CGFloat(51), count: 3)

        XCTAssertNil(
            MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: 150),
            "trois cellules visibles n'enseignent rien sur le fil — une conversation qui vient de s'ouvrir n'est pas un échantillon."
        )
    }

    func test_proposal_noVisibleRows_proposesNothing() {
        XCTAssertNil(
            MessageListHeightEstimationLaw.proposal(visibleHeights: [], current: 150),
            "aucune cellule visible : rien à apprendre, l'estimation de départ reste servie."
        )
    }

    // MARK: - Bornes (exigence n°3)

    func test_proposal_fullScreenMediaThread_isClampedToTheCeiling() {
        let visible = Array(repeating: CGFloat(900), count: 8)

        XCTAssertEqual(
            MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: 150),
            MessageListHeightEstimationLaw.maximumEstimate,
            "un fil de médias plein écran ne pousse pas l'estimation à la hauteur d'un écran — la liste ne réaliserait plus qu'une cellule par frame."
        )
    }

    func test_proposal_degenerateHeights_isClampedToTheFloor() {
        let visible = Array(repeating: CGFloat(2), count: 8)

        XCTAssertEqual(
            MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: 150),
            MessageListHeightEstimationLaw.minimumEstimate,
            "des hauteurs dégénérées (cellules jamais mesurées, layout en cours) ne doivent pas effondrer l'estimation : le plancher tient."
        )
    }

    // MARK: - Hôte — l'estimation servie est celle de la famille, et un fil
    //         vide n'enseigne rien

    private func makeEmptyStore() throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        return MessageStore(conversationId: "c1", persistence: persistence)
    }

    func test_rowHeightEstimate_followsTheRowFamily_andAnEmptyThreadTeachesNothing() throws {
        let vc = MessageListViewController(
            store: try makeEmptyStore(),
            currentUserId: "user_me",
            accentColor: "#6366F1",
            isDirect: false,
            isDark: false,
            router: Router(),
            storyViewModel: StoryViewModel(),
            statusViewModel: StatusViewModel(),
            conversationListViewModel: ConversationListViewModel()
        )
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        window.rootViewController = vc
        window.makeKeyAndVisible()
        vc.view.layoutIfNeeded()

        XCTAssertEqual(
            vc.rowHeightEstimateForTesting, 80,
            "en mode bulles, l'estimation de départ est celle de la bulle — la cote de la rangée plate ferait entrer chaque bulle bien trop haute."
        )

        vc.readingMode = .focal
        vc.view.layoutIfNeeded()

        XCTAssertEqual(
            vc.rowHeightEstimateForTesting, 150,
            "chaque famille de rangée part de SA cote : une bascule de mode ne doit jamais servir l'estimation apprise de l'autre famille."
        )

        vc.adoptRowHeightEstimateIfWorthwhile()

        XCTAssertEqual(
            vc.rowHeightEstimateForTesting, 150,
            "un fil vide n'enseigne rien : sans échantillon, l'adoption ne se déclenche pas et l'estimation de départ reste servie."
        )
    }

    func test_proposal_neverProposesAValueItWouldImmediatelyRevise() {
        // Balaie des populations plausibles : chaque proposition doit être un
        // point fixe, sinon la pose suivante ré-invalide.
        for height in stride(from: CGFloat(30), through: 300, by: 10) {
            let visible = Array(repeating: height, count: 8)
            guard let adopted = MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: 150) else {
                continue
            }
            XCTAssertNil(
                MessageListHeightEstimationLaw.proposal(visibleHeights: visible, current: adopted),
                "hauteur \(height) : la valeur adoptée doit être un point fixe de la loi."
            )
        }
    }
}
