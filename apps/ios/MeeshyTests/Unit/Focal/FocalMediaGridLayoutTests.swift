import XCTest
@testable import Meeshy

/// F-082 (WS-3) — critère §7 « Grilles 1/2/3/4+ conservées (gridMaxWidth 300,
/// spacing 2, radius 16) » : la table de slots de `FocalMediaGridLayout` est
/// identique aux valeurs de `BubbleStandardLayout+Media.swift` (lu, jamais
/// modifié — §1.3) pour `n ∈ {1,2,3,4,7}`.
///
/// Les valeurs attendues sont RECALCULÉES ici depuis les MÊMES littéraux que
/// la source réelle (`gridMaxWidth: CGFloat = 300`, `gridSpacing: CGFloat = 2`,
/// `BubbleStandardLayout.swift:169-170`) — pas recopiées depuis
/// `FocalMediaGridLayout` lui-même (ça ne prouverait rien) : un témoin qui
/// rougit signale une dérive arithmétique dans `FocalMediaGridLayout`, pas
/// une redéfinition circulaire de la même valeur.
final class FocalMediaGridLayoutTests: XCTestCase {

    private let gridMaxWidth: CGFloat = 300
    private let gridSpacing: CGFloat = 2

    func test_count0_isEmpty() {
        XCTAssertEqual(FocalMediaGridLayout.slots(for: 0), [])
    }

    func test_count1_soloFullWidth() {
        let slots = FocalMediaGridLayout.slots(for: 1)
        XCTAssertEqual(slots, [FocalMediaSlot(width: gridMaxWidth, height: 240)])
    }

    func test_count2_halfWidthPair() {
        let halfW = (gridMaxWidth - gridSpacing) / 2
        let slots = FocalMediaGridLayout.slots(for: 2)
        XCTAssertEqual(slots, [
            FocalMediaSlot(width: halfW, height: 180),
            FocalMediaSlot(width: halfW, height: 180)
        ])
    }

    func test_count3_sixtyFortySplit() {
        let leftW = (gridMaxWidth - gridSpacing) * 0.6
        let rightW = (gridMaxWidth - gridSpacing) * 0.4
        let slots = FocalMediaGridLayout.slots(for: 3)
        XCTAssertEqual(slots.count, 3)
        XCTAssertEqual(slots[0].width, leftW, accuracy: 0.001)
        XCTAssertEqual(slots[1].width, rightW, accuracy: 0.001)
        XCTAssertEqual(slots[2].width, rightW, accuracy: 0.001)
        // Contrat : largeurs 300/149/178,8/119,2.
        XCTAssertEqual(leftW, 178.8, accuracy: 0.001)
        XCTAssertEqual(rightW, 119.2, accuracy: 0.001)
    }

    func test_count4_fourUpNoOverflow() {
        let halfW = (gridMaxWidth - gridSpacing) / 2
        let slots = FocalMediaGridLayout.slots(for: 4)
        XCTAssertEqual(slots.count, 4)
        slots.forEach { XCTAssertEqual($0.width, halfW, accuracy: 0.001) }
        XCTAssertEqual(slots.map(\.overflowCount), [0, 0, 0, 0])
    }

    /// n=7 : même géométrie que n=4 (4 cellules visibles), overflow = 3 sur
    /// la DERNIÈRE cellule seulement (`BubbleStandardLayout+Media.swift`
    /// `default` branch : `overflow = items.count - 4`).
    func test_count7_fourUpWithOverflowOnLastSlot() {
        let halfW = (gridMaxWidth - gridSpacing) / 2
        let slots = FocalMediaGridLayout.slots(for: 7)
        XCTAssertEqual(slots.count, 4)
        slots.forEach { XCTAssertEqual($0.width, halfW, accuracy: 0.001) }
        XCTAssertEqual(slots.map(\.overflowCount), [0, 0, 0, 3])
    }

    /// Toutes les cellules > 1 partagent le MÊME `gridSpacing` (2) — pas de
    /// valeur ad hoc par arité.
    func test_gridConstants_matchRealSource() {
        XCTAssertEqual(FocalMediaGridLayout.gridMaxWidth, 300)
        XCTAssertEqual(FocalMediaGridLayout.gridSpacing, 2)
    }
}
