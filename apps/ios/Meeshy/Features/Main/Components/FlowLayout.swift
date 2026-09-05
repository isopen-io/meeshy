import SwiftUI

/// Un `Layout` qui pose ses sous-vues côte à côte et passe à la ligne quand la
/// largeur manque — l'équivalent SwiftUI d'un `flex-wrap`.
///
/// **Extrait d'`OnboardingStepViews.swift` au retrait du wizard d'inscription
/// (#5218).** Il y était né pour une rangée de suggestions de pseudo, mais
/// quatre écrans sans rapport l'employaient déjà — `ComposerAudienceSheet`,
/// `EffectsPickerView`, `ConversationDashboardView`,
/// `MessageTranscriptionDetailView` — dont un doc-comment qui le CITAIT par son
/// fichier d'origine (« `FlowLayout` existe déjà dans l'app »). Supprimer le
/// wizard sans le sortir d'abord aurait cassé la compilation de quatre surfaces
/// qui n'ont rien à voir avec l'inscription.
///
/// MeeshyUI en porte une JUMELLE (`Media/MediaTranscriptionView.swift`), interne
/// à son module donc invisible d'ici : la duplication est celle d'une frontière
/// de module, pas d'une négligence.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let result = FlowResult(in: proposal.width ?? 0, subviews: subviews, spacing: spacing)
        return result.size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let result = FlowResult(in: bounds.width, subviews: subviews, spacing: spacing)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + result.positions[index].x, y: bounds.minY + result.positions[index].y), proposal: .unspecified)
        }
    }

    struct FlowResult {
        var size: CGSize = .zero
        var positions: [CGPoint] = []

        init(in width: CGFloat, subviews: Subviews, spacing: CGFloat) {
            var x: CGFloat = 0
            var y: CGFloat = 0
            var lineHeight: CGFloat = 0

            for subview in subviews {
                let size = subview.sizeThatFits(.unspecified)
                if x + size.width > width && x > 0 {
                    x = 0
                    y += lineHeight + spacing
                    lineHeight = 0
                }
                positions.append(CGPoint(x: x, y: y))
                lineHeight = max(lineHeight, size.height)
                x += size.width + spacing
            }
            self.size = CGSize(width: width, height: y + lineHeight)
        }
    }
}
