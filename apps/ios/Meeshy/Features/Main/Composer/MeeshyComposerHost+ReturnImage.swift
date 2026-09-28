import SwiftUI
import MeeshySDK
import MeeshyUI

// **La retouche d'une image du fil, rendue au message** (#8416).
//
// La même scène plein écran que toute composition ; seul le socle change :
// ni audience ni menu de formats — l'image ne se publie pas —, une capsule
// « Terminé » qui rend le composite de la scène à l'hôte, puis referme.
extension MeeshyComposerHost {

    var returnsImageToConversation: Bool { onReturnImage != nil }

    /// **Les portes servies sur la scène** — toutes, sauf en retouche d'une
    /// image du fil, où ne restent que celles qui PEIGNENT l'image : ce qui
    /// qualifie une publication (mention, hashtag, lieu, description, corps)
    /// ou ce qui ne survit pas à une image fixe (le son) n'y a pas d'objet.
    var sceneDoors: [ComposerRailDoor] {
        let offertes = ComposerRailDoor.offered(served: ComposerSceneCapabilities.doors,
                                                format: selectedFormat,
                                                allowsCapture: profile.allowsCapture)
        // La porte « Fond » peint une COULEUR : sous un média de fond, elle
        // n'a plus d'objet — le Cadre du rail droit prend le relais.
        let utiles = sceneHasBackgroundMedia ? offertes.filter { $0 != .background } : offertes
        guard returnsImageToConversation else { return utiles }
        return utiles.filter(ComposerReturnImage.paintingDoors.contains)
    }

    var returnImageButton: some View {
        Button {
            returnSceneImage()
        } label: {
            Label(ComposerDescriptionCopy.doneShort, systemImage: "checkmark")
                .font(.body.weight(.semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .frame(minHeight: 44)
                .contentShape(Capsule())
                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.brandPrimary)
        }
        .buttonStyle(.plain)
    }

    func returnSceneImage() {
        guard let onReturnImage else { return }
        HapticFeedback.light()
        if viewModel.timelineIsOpen { viewModel.closeTimelinePanel() }
        let slide = viewModel.currentSlide
        guard let image = StorySlideRenderer.renderComposite(
            slide: slide,
            bgImage: viewModel.slideImages[slide.id],
            loadedImages: viewModel.loadedImages,
            size: ComposerReturnImage.renderSize(ratio: viewModel.currentCanvasRatio)
        ) else { return }
        onReturnImage(image)
        onDismiss()
    }
}

/// La taille du composite rendu au message — le RATIO de la scène (une photo
/// paysage repart paysage), et un grand côté de 640 pt, soit 1 920 px à ×3.
nonisolated enum ComposerReturnImage {
    static let longEdgePoints: CGFloat = 640

    /// Les portes qui PEIGNENT une image fixe — les seules qu'une retouche sert.
    static let paintingDoors: Set<ComposerRailDoor> = [.media, .text, .sticker, .drawing, .background]

    static func renderSize(ratio: CGFloat) -> CGSize {
        guard ratio > 0 else { return CGSize(width: longEdgePoints * SceneShape.aspect, height: longEdgePoints) }
        return ratio >= 1
            ? CGSize(width: longEdgePoints, height: longEdgePoints / ratio)
            : CGSize(width: longEdgePoints * ratio, height: longEdgePoints)
    }
}
