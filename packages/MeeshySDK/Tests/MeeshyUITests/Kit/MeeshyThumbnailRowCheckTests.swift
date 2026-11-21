import Testing
import Foundation
import SwiftUI
@testable import MeeshyUI

/// K20 — la vignette COCHÉE (#19609, planche `Signaler`, « Joindre des messages · 2 joints ») : une rangée de
/// sélection MULTIPLE, où chaque vignette dit si elle est cochée. La coche de coin et le trait « sélectionné » suivent
/// la valeur de l'hôte, et une vignette qui n'est pas cochable n'en montre aucune.
@Suite("MeeshyThumbnailRow — vignette cochée")
struct MeeshyThumbnailRowCheckTests {

    @Test("une vignette cochée montre sa coche et se dit sélectionnée, sans être la courante")
    func checked_showsTheCheckAndAnnouncesSelected() {
        let specs = Self.specs([true, false])

        #expect(specs[0].showsCheck)
        #expect(specs[0].isAnnouncedSelected)
        #expect(!specs[0].isCurrent)
        #expect(!specs[1].showsCheck)
        #expect(!specs[1].isAnnouncedSelected)
    }

    @Test("une vignette qui n'est pas cochable ne montre aucune coche ; la courante reste dite sélectionnée")
    func notCheckable_showsNoCheck() {
        let specs = Self.specs([nil, nil], current: "t1")

        #expect(!specs[0].showsCheck)
        #expect(specs[0].isAnnouncedSelected)
        #expect(!specs[1].isAnnouncedSelected)
    }

    @Test("cocher une vignette ne redessine qu'elle")
    func checking_redrawsOnlyThatCell() {
        let before = Self.specs([false, false, false])
        let after = Self.specs([false, true, false])

        let changed = zip(before, after).filter { $0 != $1 }.count
        #expect(changed == 1)
    }

    @Test("un toucher sur une vignette cochée appelle encore le rappel de l'hôte, qui la décoche")
    func tap_onACheckedThumbnail_selects() {
        let effect = MeeshyThumbnailRowRule.tap(
            "t1", current: nil, armed: nil, isDouble: false, isEnabled: true, canSelect: true, canDuplicate: false
        )
        #expect(effect == .select("t1"))
    }

    @Test("la coche déborde du coin, au diamètre de la planche, et sa cible reste celle de la vignette")
    func check_measures() {
        #expect(MeeshyThumbnailRowRecipe.checkDisc == 24)
        #expect(MeeshyThumbnailRowRecipe.checkOverhang == 6)
    }

    private static func specs(_ checks: [Bool?], current: String? = nil) -> [MeeshyThumbnailCellSpec<String>] {
        let items = checks.enumerated().map { index, isChecked in
            MeeshyThumbnail(id: "t\(index + 1)", accessibilityLabel: "Message \(index + 1)", isChecked: isChecked)
        }
        return MeeshyThumbnailRowSpecs.cells(
            MeeshyThumbnailRowSpecs.Inputs(
                items: items, current: current, armed: nil, drag: nil, size: CGSize(width: 120, height: 100),
                spacing: 12, tone: .deep, isEnabled: true, isRightToLeft: false,
                capabilities: MeeshyThumbnailCapabilities(canSelect: true, canDuplicate: false, canMove: false, canRemove: false),
                pressedPreview: nil
            )
        )
    }
}
