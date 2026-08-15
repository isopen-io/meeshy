// apps/ios/MeeshyTests/Performance/FocalScrollPassPerfTests.swift
//
// F-084 (WS-5) — budget de performance du pass de perspective du fil
// (contrat Focal §WS-5, critères §7 « Fluidité ») :
//   • « le pass de scroll n'alloue pas » — XCTMemoryMetric sur 200 passes
//     consécutives, delta ≤ 8 Ko ;
//   • « < 1 ms/frame » — 12 cellules visibles, moyenne sous la milliseconde.
//
// Comme ses sœurs (`MessageListPerformanceTests`, `BubbleSimpleMessagePerfTests`,
// `SearchPerformanceTests`), cette suite est un OPT-IN : elle est exclue des
// phases 1/2 du gate par la liste `NON_PHASE_SUITES` de `apps/ios/meeshy.sh`
// et lancée à la main / sur `dev`.
//
// ⚠️ HANDOFF WS-11 (F-090) : `meeshy.sh` appartient à WS-11 (contrat §1.2 —
// « Ajout de FocalScrollPassPerfTests à NON_PHASE_SUITES, rien d'autre »).
// F-084 ne l'édite pas. Tant que l'ajout n'est pas fait, cette suite tourne en
// phase 1 : sans baseline enregistrée, `measure` ne peut pas rougir (il
// enregistre), mais elle coûte quelques secondes au gate. Les seuils chiffrés
// ci-dessus se valident par baseline Xcode / device (iPhone 12), jamais depuis
// un simulateur CI — d'où l'absence d'assertion numérique en dur ici : un
// chiffre asserté sur simulateur serait un faux verdict, pas une garantie.

import XCTest
import UIKit
@testable import Meeshy

@MainActor
final class FocalScrollPassPerfTests: XCTestCase {

    private static let rowHeight: CGFloat = 64
    private static let viewport = CGSize(width: 390, height: 800)
    private static let itemCount = 60

    override class func setUp() {
        super.setUp()
        PerfEnvironment.logAndWarn()
    }

    // MARK: - « le pass de scroll n'alloue pas »

    /// 200 passes consécutives sur ~12 cellules visibles. Les tampons du pass
    /// (`candidates`, `pending`) sont réutilisés d'une passe à l'autre et les
    /// `CGColor` de la décoration sont mémoïsés : le delta mémoire doit rester
    /// plat, pas croître linéairement avec le nombre de passes.
    func test_pass_doesNotAllocateAcrossTwoHundredPasses() {
        let harness = makeHarness()
        let pass = FocalScrollPass()
        pass.rendering = .perspective
        pass.accentHex = "#6366F1"

        // Une passe de chauffe : création des layers de carte et des tampons,
        // hors mesure (ce sont des coûts uniques, pas des coûts par frame).
        pass.apply(to: harness.collectionView, describe: Self.describe)

        measure(metrics: [XCTMemoryMetric()]) {
            for _ in 0..<200 {
                pass.apply(to: harness.collectionView, describe: Self.describe)
            }
        }
    }

    // MARK: - « < 1 ms/frame »

    func test_pass_isFasterThanAFrameBudget() {
        let harness = makeHarness()
        let pass = FocalScrollPass()
        pass.rendering = .perspective
        pass.accentHex = "#6366F1"
        pass.apply(to: harness.collectionView, describe: Self.describe)

        measure {
            for _ in 0..<1000 {
                pass.apply(to: harness.collectionView, describe: Self.describe)
            }
        }
    }

    /// Le pass rejoué pendant que l'offset bouge — le cas réel du fling, où
    /// l'élection change et la carte se déplace de cellule en cellule.
    func test_pass_underScrollingOffset_isFasterThanAFrameBudget() {
        let harness = makeHarness()
        let pass = FocalScrollPass()
        pass.rendering = .perspective
        pass.accentHex = "#6366F1"

        measure {
            for step in 0..<200 {
                harness.collectionView.contentOffset.y = CGFloat(step) * 8
                harness.collectionView.layoutIfNeeded()
                pass.apply(to: harness.collectionView, describe: Self.describe)
            }
        }
    }

    // MARK: - Harnais

    private static func describe(_ indexPath: IndexPath) -> FocalScrollPass.CellDescriptor {
        FocalScrollPass.CellDescriptor(localId: "m\(indexPath.item)")
    }

    private struct Harness {
        let window: UIWindow
        let collectionView: UICollectionView
        let source: PerfStubSource
    }

    private func makeHarness() -> Harness {
        let layout = UICollectionViewCompositionalLayout { _, _ in
            let size = NSCollectionLayoutSize(
                widthDimension: .fractionalWidth(1),
                heightDimension: .absolute(FocalScrollPassPerfTests.rowHeight)
            )
            let item = NSCollectionLayoutItem(layoutSize: size)
            let group = NSCollectionLayoutGroup.vertical(layoutSize: size, subitems: [item])
            let section = NSCollectionLayoutSection(group: group)
            section.interGroupSpacing = 0
            return section
        }

        let collectionView = UICollectionView(
            frame: CGRect(origin: .zero, size: Self.viewport),
            collectionViewLayout: layout
        )
        collectionView.contentInsetAdjustmentBehavior = .never
        // Même géométrie que la vraie liste (`MessageListViewController:484`).
        collectionView.transform = CGAffineTransform(scaleX: 1, y: -1)
        collectionView.register(UICollectionViewCell.self, forCellWithReuseIdentifier: PerfStubSource.reuseId)

        let source = PerfStubSource(count: Self.itemCount)
        collectionView.dataSource = source

        let window = UIWindow(frame: CGRect(origin: .zero, size: Self.viewport))
        window.rootViewController = UIViewController()
        window.rootViewController?.view.addSubview(collectionView)
        window.makeKeyAndVisible()
        collectionView.layoutIfNeeded()

        return Harness(window: window, collectionView: collectionView, source: source)
    }

    @MainActor
    final class PerfStubSource: NSObject, UICollectionViewDataSource {
        static let reuseId = "focal.perf.cell"
        private let count: Int

        init(count: Int) {
            self.count = count
            super.init()
        }

        func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int { count }

        func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
            collectionView.dequeueReusableCell(withReuseIdentifier: Self.reuseId, for: indexPath)
        }
    }
}
