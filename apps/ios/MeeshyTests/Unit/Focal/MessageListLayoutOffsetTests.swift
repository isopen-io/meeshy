// apps/ios/MeeshyTests/Unit/Focal/MessageListLayoutOffsetTests.swift

import XCTest
import UIKit
import GRDB
@testable import Meeshy
@testable import MeeshySDK

/// Stabilité du champ visuel pendant le défilement (chasse Fable 2026-08-16,
/// causes n°1 et n°2 restantes) : dans la liste INVERSÉE, l'échelle Focal
/// d'une rangée est une fonction pure de `visualMidY = H − (center.y −
/// offset)`. Toute correction de layout qui déplace `center.y` des cellules
/// visibles SANS déplacer `contentOffset` du même delta fait donc sauter la
/// scène entière — position ET échelle — au lieu de suivre la courbe.
///
/// Deux écrivains de corrections existent :
/// 1. **Self-sizing** : une cellule SOUS la fenêtre visible (déjà défilée,
///    ou reconfigurée à la pose) se re-mesure — tous les items au-dessus
///    d'elle glissent de `Δh`. Correctif canonique du chat inversé :
///    `invalidationContext.contentOffsetAdjustment`.
/// 2. **Insertion/suppression en tête** (message entrant, typing indicator,
///    index 0 = bas visuel) : le `contentY` de TOUTES les cellules visibles
///    se décale de la hauteur insérée. Compensé au `targetContentOffset` de
///    la passe de batch update — SAUF près du bas, où la poussée naturelle
///    (+ auto-scroll existant) est le comportement voulu.
@MainActor
final class MessageListLayoutOffsetTests: XCTestCase {

    // MARK: - Loi pure — self-sizing

    func test_selfSizingAdjustment_itemBelowWindow_returnsHeightDelta() {
        XCTAssertEqual(
            MessageListOffsetCompensationLaw.selfSizingAdjustment(
                originalMinY: 50,
                heightDelta: 40,
                contentOffsetY: 400
            ),
            40,
            "une cellule sous la fenêtre (minY < offset) qui grandit décale toutes les cellules visibles — l'offset doit absorber le delta pour que la scène ne bouge pas."
        )
    }

    func test_selfSizingAdjustment_itemInsideWindow_returnsZero() {
        XCTAssertEqual(
            MessageListOffsetCompensationLaw.selfSizingAdjustment(
                originalMinY: 500,
                heightDelta: 40,
                contentOffsetY: 400
            ),
            0,
            "une cellule DANS la fenêtre (minY ≥ offset) s'ancre au bas visuel — compenser ferait sauter l'élu et les rangées récentes, le pire échange possible."
        )
    }

    func test_selfSizingAdjustment_itemShrinksBelowWindow_returnsNegativeDelta() {
        XCTAssertEqual(
            MessageListOffsetCompensationLaw.selfSizingAdjustment(
                originalMinY: 0,
                heightDelta: -114,
                contentOffsetY: 800
            ),
            -114,
            "un séparateur de jour estimé 150 qui se réalise à 36 sous la fenêtre doit tirer l'offset avec lui — sinon la scène recule de 114 pt d'un coup."
        )
    }

    func test_selfSizingAdjustment_straddlingItem_returnsHeightDelta() {
        XCTAssertEqual(
            MessageListOffsetCompensationLaw.selfSizingAdjustment(
                originalMinY: 380,
                heightDelta: 24,
                contentOffsetY: 400
            ),
            24,
            "une cellule à cheval sur le bord bas de la fenêtre (minY < offset < maxY) pousse quand même tout ce qui est au-dessus — même compensation."
        )
    }

    // MARK: - Loi pure — insertion/suppression en tête

    func test_batchUpdateAdjustment_awayFromBottom_returnsHeadDelta() {
        XCTAssertEqual(
            MessageListOffsetCompensationLaw.batchUpdateAdjustment(
                headDelta: 150,
                contentOffsetY: 600,
                nearBottomThreshold: 200
            ),
            150,
            "loin du bas (offset ≥ seuil), un message inséré en tête ne doit PAS déplacer la lecture — l'offset absorbe sa hauteur, le badge non-lu fait le reste."
        )
    }

    func test_batchUpdateAdjustment_nearBottom_returnsZero() {
        XCTAssertEqual(
            MessageListOffsetCompensationLaw.batchUpdateAdjustment(
                headDelta: 150,
                contentOffsetY: 40,
                nearBottomThreshold: 200
            ),
            0,
            "près du bas, la poussée naturelle est le comportement historique voulu (le message entrant apparaît et l'auto-scroll suit) — aucune compensation."
        )
    }

    func test_batchUpdateAdjustment_typingRemovedAwayFromBottom_returnsNegativeDelta() {
        XCTAssertEqual(
            MessageListOffsetCompensationLaw.batchUpdateAdjustment(
                headDelta: -52,
                contentOffsetY: 600,
                nearBottomThreshold: 200
            ),
            -52,
            "le typing indicator qui disparaît (delta négatif) tire les cellules visibles vers le bas — l'offset doit suivre pour que la scène reste immobile."
        )
    }

    // MARK: - Layout — le point d'entrée UIKit du self-sizing compense

    private func attributes(y: CGFloat, height: CGFloat) -> UICollectionViewLayoutAttributes {
        let attrs = UICollectionViewLayoutAttributes(forCellWith: IndexPath(item: 0, section: 0))
        attrs.frame = CGRect(x: 0, y: y, width: 390, height: height)
        return attrs
    }

    /// Le harnais batch (data source réel, 10 × 100 pt) sert aussi ici : sans
    /// contenu défilable, UIKit reclampe tout offset posé à 0 et la fenêtre
    /// visible perdrait son sens.
    func test_invalidationContext_growthBelowWindow_setsContentOffsetAdjustment() {
        let (collectionView, _, _) = makeBatchHarness(nearBottomThreshold: 200, estimated: true)
        let layout = collectionView.collectionViewLayout as! MessageListLayout
        collectionView.contentOffset = CGPoint(x: 0, y: 400)

        let context = layout.invalidationContext(
            forPreferredLayoutAttributes: attributes(y: 50, height: 120),
            withOriginalAttributes: attributes(y: 50, height: 80)
        )

        XCTAssertEqual(
            context.contentOffsetAdjustment.y, 40, accuracy: 0.5,
            "la correction self-sizing d'une cellule sous la fenêtre doit être absorbée par contentOffsetAdjustment DANS la même transaction de layout — c'est le seul chemin sans frame intermédiaire visible."
        )
    }

    /// La compensation self-sizing N'EST PLUS plafonnée ICI : le plafond vit
    /// sur l'entonnoir `invalidateLayout(with:)` (un contexte avalé emporte
    /// sa compensation avec lui). Ce témoin fige la position du garde-fou —
    /// des compensations successives dans une même transaction restent
    /// toutes intégrales à CE niveau.
    func test_invalidationContext_successiveAdjustments_stayIntegralAtThisLevel() {
        let (collectionView, _, _) = makeBatchHarness(nearBottomThreshold: 200, estimated: true)
        let layout = collectionView.collectionViewLayout as! MessageListLayout
        collectionView.contentOffset = CGPoint(x: 0, y: 400)

        for i in 0..<5 {
            let context = layout.invalidationContext(
                forPreferredLayoutAttributes: attributes(y: 50, height: 120),
                withOriginalAttributes: attributes(y: 50, height: 80)
            )
            XCTAssertEqual(
                context.contentOffsetAdjustment.y, 40, accuracy: 0.5,
                "compensation n°\(i + 1) : intégrale — le plafond anti-récursion vit sur invalidateLayout(with:), jamais ici"
            )
        }
    }

    func test_invalidationContext_growthInsideWindow_leavesOffsetUntouched() {
        let (collectionView, _, _) = makeBatchHarness(nearBottomThreshold: 200, estimated: true)
        let layout = collectionView.collectionViewLayout as! MessageListLayout
        collectionView.contentOffset = CGPoint(x: 0, y: 400)

        let context = layout.invalidationContext(
            forPreferredLayoutAttributes: attributes(y: 500, height: 120),
            withOriginalAttributes: attributes(y: 500, height: 80)
        )

        XCTAssertEqual(
            context.contentOffsetAdjustment.y, 0, accuracy: 0.5,
            "une cellule dans la fenêtre s'ancre au bas visuel — le layout ne doit poser AUCUNE compensation."
        )
    }

    func test_invalidationContext_unchangedHeight_leavesOffsetUntouched() {
        let (collectionView, _, _) = makeBatchHarness(nearBottomThreshold: 200, estimated: true)
        let layout = collectionView.collectionViewLayout as! MessageListLayout
        collectionView.contentOffset = CGPoint(x: 0, y: 400)

        let context = layout.invalidationContext(
            forPreferredLayoutAttributes: attributes(y: 50, height: 80),
            withOriginalAttributes: attributes(y: 50, height: 80)
        )

        XCTAssertEqual(
            context.contentOffsetAdjustment.y, 0, accuracy: 0.5,
            "hauteur inchangée ⇒ aucune compensation — le pass doit rester strictement neutre hors correction."
        )
    }

    // MARK: - Batch updates — insertion en tête à travers la vraie passe UIKit

    /// Harnais réel : `UICollectionView` + data source diffable minimal,
    /// 10 items de 100 pt, fenêtre de 300 pt. `estimated: false` (hauteurs
    /// absolues) pour les tests d'insertion — déterministe, aucune correction
    /// de self-sizing parasite ; `estimated: true` pour les tests
    /// d'invalidation — le chemin `invalidationContext(forPreferred…)` du
    /// layout compositionnel EXIGE un solveur estimé (assertion UIKit sinon),
    /// exactement le régime de production. La contrainte de hauteur 100 rend
    /// la mesure déterministe.
    private func makeBatchHarness(
        nearBottomThreshold: CGFloat,
        estimated: Bool = false
    ) -> (collectionView: UICollectionView, dataSource: UICollectionViewDiffableDataSource<Int, String>, window: UIWindow) {
        let layout = MessageListLayout { _, _ in
            let size = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: estimated ? .estimated(100) : .absolute(100)
            )
            let item = NSCollectionLayoutItem(layoutSize: size)
            let group = NSCollectionLayoutGroup.vertical(layoutSize: size, subitems: [item])
            return NSCollectionLayoutSection(group: group)
        }
        layout.nearBottomThreshold = nearBottomThreshold
        let collectionView = UICollectionView(
            frame: CGRect(x: 0, y: 0, width: 390, height: 300),
            collectionViewLayout: layout
        )
        let registration = UICollectionView.CellRegistration<UICollectionViewCell, String> { cell, _, _ in
            guard estimated, cell.contentView.constraints.isEmpty else { return }
            let height = cell.contentView.heightAnchor.constraint(equalToConstant: 100)
            height.priority = .init(999)
            height.isActive = true
        }
        let dataSource = UICollectionViewDiffableDataSource<Int, String>(
            collectionView: collectionView
        ) { collectionView, indexPath, item in
            collectionView.dequeueConfiguredReusableCell(using: registration, for: indexPath, item: item)
        }
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 300))
        window.addSubview(collectionView)
        window.makeKeyAndVisible()

        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0])
        snapshot.appendItems((0..<10).map { "m\($0)" })
        dataSource.apply(snapshot, animatingDifferences: false)
        collectionView.layoutIfNeeded()
        return (collectionView, dataSource, window)
    }

    private func prependItem(
        _ dataSource: UICollectionViewDiffableDataSource<Int, String>,
        in collectionView: UICollectionView
    ) {
        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0])
        snapshot.appendItems(["new"] + (0..<10).map { "m\($0)" })
        let done = expectation(description: "apply")
        dataSource.apply(snapshot, animatingDifferences: false) { done.fulfill() }
        wait(for: [done], timeout: 2)
        collectionView.layoutIfNeeded()
    }

    func test_headInsertion_awayFromBottom_keepsVisibleFieldStill() {
        let (collectionView, dataSource, _) = makeBatchHarness(nearBottomThreshold: 200)
        collectionView.contentOffset = CGPoint(x: 0, y: 600)

        prependItem(dataSource, in: collectionView)

        XCTAssertEqual(
            collectionView.contentOffset.y, 700, accuracy: 1,
            "un item de 100 pt inséré en tête (index 0, sous la fenêtre) doit être absorbé par l'offset — la scène visible ne bouge pas d'un point."
        )
    }

    func test_headInsertion_nearBottom_keepsNaturalPush() {
        let (collectionView, dataSource, _) = makeBatchHarness(nearBottomThreshold: 200)
        collectionView.contentOffset = CGPoint(x: 0, y: 40)

        prependItem(dataSource, in: collectionView)

        XCTAssertEqual(
            collectionView.contentOffset.y, 40, accuracy: 1,
            "près du bas, aucune compensation — la poussée naturelle du message entrant est le comportement historique."
        )
    }

    /// Contrôle de causalité : SANS seuil posé par l'hôte (défaut infini), le
    /// même scénario ne compense PAS — prouve que c'est bien la compensation
    /// du layout qui immobilise la scène dans le test nominal, pas un
    /// comportement UIKit préexistant.
    func test_headInsertion_withoutHostThreshold_isNotCompensated() {
        let (collectionView, dataSource, _) = makeBatchHarness(
            nearBottomThreshold: .greatestFiniteMagnitude
        )
        collectionView.contentOffset = CGPoint(x: 0, y: 600)

        prependItem(dataSource, in: collectionView)

        XCTAssertEqual(
            collectionView.contentOffset.y, 600, accuracy: 1,
            "seuil non posé ⇒ compensation désactivée — l'offset reste, le champ visuel saute (comportement UIKit nu)."
        )
    }

    // MARK: - Invalidation de RÉCUPÉRATION (budget dépassé) — l'ancre de lecture

    private final class HeightBox {
        var heights: [Int: CGFloat] = [:]
        func height(for item: Int) -> CGFloat { heights[item] ?? 100 }
    }

    /// Groupe `.custom` : positions DÉTERMINISTES lues dans `heights` à
    /// chaque `prepare()` — contourne toute incertitude sur le cache de
    /// mesure self-sizing d'UIKit (hors-écran, invalidation complète…) pour
    /// isoler exactement ce que le test veut prouver : la préservation de
    /// l'ancre de lecture, quelle que soit la cause du changement de hauteur.
    private func makeDeterministicHeightHarness(
        itemCount: Int,
        heights: HeightBox
    ) -> (collectionView: UICollectionView, dataSource: UICollectionViewDiffableDataSource<Int, String>, window: UIWindow) {
        let layout = MessageListLayout { _, _ in
            let totalHeight = (0..<itemCount).reduce(CGFloat(0)) { $0 + heights.height(for: $1) }
            let groupSize = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .absolute(totalHeight)
            )
            let group = NSCollectionLayoutGroup.custom(layoutSize: groupSize) { environment in
                var y: CGFloat = 0
                var items: [NSCollectionLayoutGroupCustomItem] = []
                for i in 0..<itemCount {
                    let h = heights.height(for: i)
                    items.append(NSCollectionLayoutGroupCustomItem(
                        frame: CGRect(x: 0, y: y, width: environment.container.contentSize.width, height: h)
                    ))
                    y += h
                }
                return items
            }
            return NSCollectionLayoutSection(group: group)
        }
        let collectionView = UICollectionView(
            frame: CGRect(x: 0, y: 0, width: 390, height: 300),
            collectionViewLayout: layout
        )
        let registration = UICollectionView.CellRegistration<UICollectionViewCell, String> { _, _, _ in }
        let dataSource = UICollectionViewDiffableDataSource<Int, String>(
            collectionView: collectionView
        ) { collectionView, indexPath, item in
            collectionView.dequeueConfiguredReusableCell(using: registration, for: indexPath, item: item)
        }
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 300))
        window.addSubview(collectionView)
        window.makeKeyAndVisible()

        var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
        snapshot.appendSections([0])
        snapshot.appendItems((0..<itemCount).map { "m\($0)" })
        dataSource.apply(snapshot, animatingDifferences: false)
        collectionView.layoutIfNeeded()
        return (collectionView, dataSource, window)
    }

    /// Reproduit le mécanisme mesuré en repro live (2026-08-26) : une
    /// cellule AU-DESSUS de la fenêtre visible (`m0`) change de hauteur
    /// (-150 pt — le cas « séparateur de jour estimé 150 réalisé à ~36 » de
    /// la doc de la loi) pendant que le budget de compensations partielles
    /// est dépassé dans la MÊME transaction : le chemin de rattrapage
    /// (invalidation COMPLÈTE, anti-SIGTRAP) prend le relais et — sans
    /// ancre — ne porte AUCUNE des deux compensations. `contentOffset` doit
    /// pourtant rester posé sur la rangée que le lecteur regardait :
    /// mesuré en repro live, `contentOffset` a sauté de 968 à 842 en moins
    /// de 20 ms sans doigt ni décélération.
    func test_recoveryInvalidation_budgetExceeded_preservesReadingAnchor() {
        let heights = HeightBox()
        // `dataSource` doit rester VIVANT : `UICollectionView.dataSource`
        // est faible, et sans référence forte ici ARC le libère avant que
        // le rattrapage ne re-questionne le nombre d'items.
        let (collectionView, dataSource, _) = makeDeterministicHeightHarness(itemCount: 10, heights: heights)
        _ = dataSource
        let layout = collectionView.collectionViewLayout as! MessageListLayout

        // Géométrie initiale (tout à 100 pt) : la fenêtre [400, 700) couvre
        // m4 (400-500) en tête — l'ancre de lecture, l'utilisateur ayant
        // défilé loin dans l'historique, `m0` hors champ au-dessus.
        collectionView.contentOffset = CGPoint(x: 0, y: 400)
        collectionView.layoutIfNeeded()
        let anchorIndexPath = IndexPath(item: 4, section: 0)
        guard let anchorMinYBefore = layout.layoutAttributesForItem(at: anchorIndexPath)?.frame.minY else {
            return XCTFail("ancre absente du layout")
        }
        let distanceFromOffsetBefore = anchorMinYBefore - collectionView.contentOffset.y

        // `m0` (hors champ, minY=0 < offset=400) rétrécit de 100 pt — tout
        // ce qui suit, ancre comprise, glisse de 100 pt vers le haut au
        // prochain `prepare()`.
        heights.heights[0] = 0

        // Appel DIRECT du chemin de rattrapage (invalidation COMPLÈTE, celui
        // que `scheduleRecoveryInvalidation()` planifie en asynchrone quand
        // le budget de compensations partielles est dépassé DANS LA MÊME
        // transaction) — le mécanisme d'ancrage ne dépend d'aucun timing,
        // seul son déclenchement réel l'est ; l'appeler directement isole le
        // test de cette asynchronie sans en changer la sémantique.
        layout.fireOrDeferRecoveryInvalidation()

        guard let anchorMinYAfter = layout.layoutAttributesForItem(at: anchorIndexPath)?.frame.minY else {
            return XCTFail("ancre disparue après le rattrapage")
        }
        let distanceFromOffsetAfter = anchorMinYAfter - collectionView.contentOffset.y

        XCTAssertEqual(
            distanceFromOffsetAfter, distanceFromOffsetBefore, accuracy: 1,
            "l'invalidation de récupération (budget dépassé) doit préserver la position visuelle de la rangée lue par l'utilisateur — jamais la faire sauter au repos."
        )
    }

    // MARK: - Hôte — le contrôleur monte bien la sous-classe

    private func makeEmptyStore() throws -> MessageStore {
        let pool = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: pool)
        let persistence = MessagePersistenceActor(dbWriter: pool)
        return MessageStore(conversationId: "c1", persistence: persistence)
    }

    func test_messageListViewController_usesMessageListLayout() throws {
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

        XCTAssertTrue(
            vc.focalCollectionViewForTesting?.collectionViewLayout is MessageListLayout,
            "le contrôleur doit monter MessageListLayout — un UICollectionViewCompositionalLayout nu laisse les corrections de self-sizing et les insertions en tête faire sauter la scène (et donc l'échelle Focal) pendant le défilement."
        )
    }
}
