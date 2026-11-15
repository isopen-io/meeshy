import SwiftUI

/// Un `Layout` qui pose ses sous-vues côte à côte et passe à la ligne quand la
/// largeur manque — l'équivalent SwiftUI d'un `flex-wrap`.
///
/// **Le seul du dépôt.** Trois jumelles vivaient côte à côte : celle de l'app
/// (`Features/Main/Components`), une copie interne à MeeshyUI (née pour le
/// texte d'une transcription) et `TagFlowLayout`. Elles différaient par deux
/// réglages, qui sont devenus des options plutôt que des copies :
/// - `itemSpacing`, l'écart ENTRE deux éléments d'une rangée — nul pour un
///   texte découpé en mots, qui porte ses propres espaces ;
/// - `lineSpacing`, l'écart entre deux rangées.
///
/// Un élément plus long que sa rangée y est mesuré À LA LARGEUR de la rangée
/// (#9564) : il rétrécit ou se coupe, jamais la page ne glisse de côté. Sans
/// largeur proposée (taille idéale), tout tient sur une rangée.
public struct FlowLayout: Layout {
    public var itemSpacing: CGFloat
    public var lineSpacing: CGFloat

    public init(spacing: CGFloat = 8) {
        self.itemSpacing = spacing
        self.lineSpacing = spacing
    }

    public init(itemSpacing: CGFloat, lineSpacing: CGFloat) {
        self.itemSpacing = itemSpacing
        self.lineSpacing = lineSpacing
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        arrangement(rowWidth: proposal.width ?? .infinity, subviews: subviews).size
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = arrangement(rowWidth: bounds.width, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            subview.place(
                at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y),
                proposal: result.proposals[index]
            )
        }
    }

    /// Ce qu'on propose à un élément : sa taille idéale tant qu'elle tient dans la rangée ; sinon la LARGEUR DE LA
    /// RANGÉE, et rien de plus (#9564). Sans cette borne, un élément plus long que sa rangée (une pastille en
    /// allemand, une valeur servie longue, un texte agrandi) sortait du cadre et élargissait la page : c'est à lui
    /// de rétrécir ou de se couper, jamais à l'écran de glisser de côté.
    public static func proposal(ideal: CGSize, rowWidth: CGFloat) -> ProposedViewSize {
        rowWidth > 0 && rowWidth.isFinite && ideal.width > rowWidth ? ProposedViewSize(width: rowWidth, height: nil) : .unspecified
    }

    private struct Arrangement {
        var size: CGSize
        var positions: [CGPoint]
        var proposals: [ProposedViewSize]
    }

    private func arrangement(rowWidth: CGFloat, subviews: Subviews) -> Arrangement {
        var positions: [CGPoint] = []
        var proposals: [ProposedViewSize] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0
        var widest: CGFloat = 0

        for subview in subviews {
            let ideal = subview.sizeThatFits(.unspecified)
            let proposal = Self.proposal(ideal: ideal, rowWidth: rowWidth)
            proposals.append(proposal)
            var size = proposal == .unspecified ? ideal : subview.sizeThatFits(proposal)
            if rowWidth > 0, rowWidth.isFinite { size.width = min(size.width, rowWidth) }
            if x + size.width > rowWidth && x > 0 {
                x = 0
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            positions.append(CGPoint(x: x, y: y))
            lineHeight = max(lineHeight, size.height)
            widest = max(widest, x + size.width)
            x += size.width + itemSpacing
        }
        let width = rowWidth.isFinite ? rowWidth : widest
        return Arrangement(size: CGSize(width: width, height: y + lineHeight), positions: positions, proposals: proposals)
    }
}
