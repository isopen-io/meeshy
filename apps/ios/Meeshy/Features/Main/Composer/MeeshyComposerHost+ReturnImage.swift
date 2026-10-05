import SwiftUI
import MeeshySDK
import MeeshyUI

// **La retouche d'une pièce du fil, et la caméra de sa barre, rendues au
// message** (#8416, #9123).
//
// La même scène plein écran que toute composition ; seul le socle change :
// ni audience ni menu de formats — le média ne se publie pas —, une capsule
// « Terminé » qui rend le média à l'hôte, puis referme.
extension MeeshyComposerHost {

    var returnsToConversation: Bool { onReturnMedia != nil || onReturnSeries != nil }

    /// **La caméra de la barre ouvre le viseur ARMÉ** (#9123) — la seule porte
    /// qui le fasse : l'auteur a touché « caméra ». La règle lit l'ORIGINE.
    func armViewfinderIfTheDoorAsks() {
        guard ComposerConversationCapture.armsViewfinderOnOpen(origin: intent.origin) else { return }
        armSceneCamera()
    }

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
        guard returnsToConversation else { return utiles }
        return utiles.filter(ComposerReturnImage.paintingDoors.contains)
    }

    var returnImageButton: some View {
        Button {
            returnSceneMedia()
        } label: {
            Label(ComposerDescriptionCopy.doneShort, systemImage: "checkmark")
                .font(.body.weight(.semibold))
                .foregroundColor(.white)
                .padding(.horizontal, MeeshySpacing.xl)
                .frame(minHeight: 44)
                .contentShape(Capsule())
                .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.brandPrimary)
        }
        .buttonStyle(.plain)
        .disabled(sceneExport.isExporting)
    }

    /// **« Terminé » rend un MÉDIA** (#8416, #9123, #9124) — la loi
    /// (`ComposerReturnMedia.action`) dit lequel ; ce site l'exécute.
    func returnSceneMedia() {
        if retouchSeries != nil { returnRetouchSeries(); return }
        guard let onReturnMedia else { return }
        HapticFeedback.light()
        if viewModel.timelineIsOpen { viewModel.closeTimelinePanel() }
        let objets = viewModel.currentSlide.effects.mediaObjects ?? []
        // **Rien n'a changé ⇒ l'image d'origine reste** (#8524). Rendre la
        // scène d'une retouche vide remplaçait l'original par un rendu : une
        // perte de définition sans le moindre geste de l'auteur.
        switch ComposerReturnMedia.action(
            edited: viewModel.canUndoGlobal,
            returnsCapture: ComposerConversationCapture.returnsUntouchedMedia(origin: intent.origin),
            sceneHoldsMedia: !objets.isEmpty,
            sceneHasVideo: objets.contains { $0.kind == .video }
        ) {
        case .dismiss:
            onDismiss()
        case .returnCapture:
            guard let prise = sceneMediaAsTaken else { onDismiss(); return }
            onReturnMedia(prise)
            onDismiss()
        case .renderImage:
            let slide = viewModel.currentSlide
            guard let image = StorySlideRenderer.renderComposite(
                slide: slide,
                bgImage: viewModel.slideImages[slide.id],
                loadedImages: viewModel.loadedImages,
                size: ComposerRetouchSeries.imageRenderSize(slide: slide, canvasRatio: viewModel.currentCanvasRatio)
            ) else { return }
            onReturnMedia(.image(image))
            onDismiss()
        case .renderVideo:
            let slide = ComposerRetouchSeries.messageVideoSlide(viewModel.exportableCurrentSlide())
            sceneExport.bakeForMessage(slide: slide, inputs: viewModel.exportInputs(for: slide)) { url in
                onReturnMedia(.video(url))
                onDismiss()
            }
        }
    }

    /// Le média tel que le viseur ou la porte l'a rendu : son FICHIER, jamais un rendu.
    var sceneMediaAsTaken: ComposerReturnedMedia? {
        for media in documentContentMedia {
            switch media.kind {
            case .video:
                return .video(media.sourceURL)
            case .image:
                if let image = UIImage(contentsOfFile: media.sourceURL.path) { return .image(image) }
            case .audio:
                continue
            }
        }
        return nil
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
