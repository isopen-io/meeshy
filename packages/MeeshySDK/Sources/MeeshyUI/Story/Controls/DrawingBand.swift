import SwiftUI
import MeeshySDK

/// Bande inférieure **redimensionnable** du mode dessin : poignée (grabber) que
/// l'utilisateur tire vers le haut pour agrandir (plus de traits visibles, canvas
/// re-scalé plus petit) ou vers le bas pour réduire. Réutilise le chrome standard
/// du composer : `ComposerToolSwitcherHeader` (retour `‹ Dessin` + accès rapide aux
/// autres outils) et `DrawingStrokeList` (liste éditable par-trait). Le style de
/// fond reprend celui de `ComposerBottomBand` pour rester « comme les autres ».
///
/// N'est présentée par `StoryComposerView` que lorsqu'il existe au moins un trait
/// (sinon le canvas reste plein et l'utilisateur dessine immédiatement).
struct DrawingBand: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    /// Hauteur courante de la bande (pilotée par le drag du grabber). Le parent
    /// l'utilise aussi pour scaler le canvas au-dessus.
    @Binding var height: CGFloat
    let minHeight: CGFloat
    let maxHeight: CGFloat
    let onBack: () -> Void
    let onSwitch: (StoryToolMode) -> Void

    @Environment(\.colorScheme) private var colorScheme
    @State private var dragStartHeight: CGFloat?

    private var dragHandleColor: Color {
        colorScheme == .dark ? Color.white.opacity(0.55) : MeeshyColors.indigo950.opacity(0.35)
    }

    var body: some View {
        VStack(spacing: 8) {
            grabber
            ComposerToolSwitcherHeader(currentTool: .drawing, onBack: onBack, onSwitch: onSwitch)
                .padding(.horizontal, 16)
            DrawingStrokeList(viewModel: viewModel, maxListHeight: .infinity)
                .padding(.horizontal, 16)
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .background(bandBackground)
        .shadow(color: .black.opacity(0.25), radius: 14, y: -6)
    }

    private var grabber: some View {
        RoundedRectangle(cornerRadius: 2.5)
            .fill(dragHandleColor)
            .frame(width: 42, height: 5)
            .padding(.top, 10)
            .padding(.bottom, 4)
            .frame(maxWidth: .infinity)        // étend la hit-area sur toute la largeur
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 2)
                    .onChanged { value in
                        if dragStartHeight == nil { dragStartHeight = height }
                        let base = dragStartHeight ?? height
                        // Tirer vers le HAUT (translation.height négative) agrandit.
                        height = max(minHeight, min(maxHeight, base - value.translation.height))
                    }
                    .onEnded { _ in dragStartHeight = nil }
            )
            .accessibilityLabel(String(localized: "story.composer.drawing.resize", defaultValue: "Redimensionner la liste des traits", bundle: .module))
            .accessibilityHint(String(localized: "story.composer.drawing.resize.hint", defaultValue: "Faites glisser vers le haut pour agrandir, vers le bas pour réduire.", bundle: .module))
            .accessibilityAddTraits(.isButton)
    }

    private var bandBackground: some View {
        UnevenRoundedRectangle(
            topLeadingRadius: 24, bottomLeadingRadius: 0,
            bottomTrailingRadius: 0, topTrailingRadius: 24, style: .continuous
        )
        .fill(colorScheme == .dark ? MeeshyColors.indigo950.opacity(0.92) : Color.white.opacity(0.92))
        .overlay(
            UnevenRoundedRectangle(
                topLeadingRadius: 24, bottomLeadingRadius: 0,
                bottomTrailingRadius: 0, topTrailingRadius: 24, style: .continuous
            )
            .stroke((colorScheme == .dark ? Color.white : MeeshyColors.indigo950).opacity(0.08), lineWidth: 0.5)
        )
        .ignoresSafeArea(edges: .bottom)
    }
}
