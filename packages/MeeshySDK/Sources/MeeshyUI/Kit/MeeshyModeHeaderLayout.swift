import SwiftUI

/// Le rôle d'une capsule dans l'en-tête : sa place, et son rang quand la place manque.
enum MeeshyModeHeaderRole: Hashable {
    case exit
    case center
    case accessory
    case confirm
}

private struct MeeshyModeHeaderRoleKey: LayoutValueKey {
    static let defaultValue = MeeshyModeHeaderRole.exit
}

extension View {
    func meeshyModeRole(_ role: MeeshyModeHeaderRole) -> some View {
        layoutValue(key: MeeshyModeHeaderRoleKey.self, value: role)
    }
}

/// **La disposition de l'en-tête** : Quitter au bord de début, l'accessoire puis la validation au bord de
/// fin, le centre au milieu DU CADRE (pas de la place restante). Les largeurs viennent de
/// `MeeshyModeHeaderFit`, les positions sont miroitées en RTL ; la hauteur est celle de la plus haute
/// capsule. Sa largeur idéale est la largeur requise par la loi, ce que `ViewThatFits` compare à la place.
struct MeeshyModeHeaderLayout: Layout {
    let isRightToLeft: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let ideals = Self.ideals(subviews)
        let required = MeeshyModeHeaderFit.requiredWidth(
            exit: ideals[.exit] ?? 0, center: ideals[.center], accessory: ideals[.accessory], confirm: ideals[.confirm]
        )
        let height = subviews.map { $0.sizeThatFits(.unspecified).height }.max() ?? 0
        let offered = proposal.width.flatMap { $0.isFinite ? $0 : nil }
        return CGSize(width: offered ?? required, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let ideals = Self.ideals(subviews)
        let widths = MeeshyModeHeaderFit.allocate(
            available: bounds.width, exit: ideals[.exit] ?? 0, center: ideals[.center],
            accessory: ideals[.accessory], confirm: ideals[.confirm]
        )
        let gap = MeeshyModeChromeRecipe.itemGap
        var leading: [MeeshyModeHeaderRole: (offset: CGFloat, width: CGFloat)] = [:]
        leading[.exit] = (0, widths.exit)
        if let confirm = widths.confirm { leading[.confirm] = (bounds.width - confirm, confirm) }
        if let accessory = widths.accessory {
            let confirmSpan = widths.confirm.map { $0 + gap } ?? 0
            leading[.accessory] = (bounds.width - confirmSpan - accessory, accessory)
        }
        if let center = widths.center { leading[.center] = ((bounds.width - center) / 2, center) }
        for subview in subviews {
            guard let slot = leading[subview[MeeshyModeHeaderRoleKey.self]] else {
                subview.place(at: bounds.origin, proposal: ProposedViewSize(width: 0, height: 0))
                continue
            }
            let x = isRightToLeft ? bounds.maxX - slot.offset - slot.width : bounds.minX + slot.offset
            subview.place(
                at: CGPoint(x: x, y: bounds.midY), anchor: .leading,
                proposal: ProposedViewSize(width: slot.width, height: nil)
            )
        }
    }

    private static func ideals(_ subviews: Subviews) -> [MeeshyModeHeaderRole: CGFloat] {
        var result: [MeeshyModeHeaderRole: CGFloat] = [:]
        for subview in subviews {
            result[subview[MeeshyModeHeaderRoleKey.self]] = subview.sizeThatFits(.unspecified).width
        }
        return result
    }
}
