import SwiftUI
import MeeshySDK
import MeeshyUI

// **Éditer une pièce en attente ouvre toutes les pièces du message, une scène
// chacune** (#9126) — posées par le chemin de la SÉRIE (une scène par média),
// ouvertes sur la pièce touchée ; « Terminé » rend chaque scène retouchée à sa
// pièce, et laisse les autres telles quelles (aucun ré-encodage, #9131).
extension MeeshyComposerHost {

    func ingestRetouchSeriesIfNeeded() {
        guard let serie = retouchSeries, !retouchSeriesIngested else { return }
        retouchSeriesIngested = true
        let medias = serie.pieces.map {
            ComposerDocumentMediaFactory.media(url: $0.fileURL, declaredMimeType: $0.mimeType)
        }
        sceneSeriesMediaURLs.formUnion(medias.map(\.url))
        ecrireDansLaListeDuDocument(medias, rail: .abandonne)
    }

    /// **L'état de départ se prend APRÈS les mesures vidéo** (#9131) : la
    /// mesure écrit ratio et durée une fois la scène posée, et ce qui arrive
    /// après le départ se lisait comme une retouche — « Annuler » s'allumait à
    /// l'ouverture, et une vidéo intacte repartait ré-encodée.
    func settleReturnedScenes() {
        guard returnsToConversation else { return }
        if let serie = retouchSeries {
            guard retouchBaselines == nil,
                  serie.pieces.allSatisfy({ slideIdByMediaURL[$0.fileURL] != nil }) else { return }
            retouchBaselines = [:]
            if let focus = serie.focus, let slideId = slideIdByMediaURL[focus.fileURL],
               let index = viewModel.slides.firstIndex(where: { $0.id == slideId }) {
                viewModel.selectSlide(at: index)
            }
        }
        Task { @MainActor in
            await viewModel.videoMeasurementsSettled()
            if retouchSeries != nil {
                retouchBaselines = viewModel.slides.reduce(into: [:]) { departs, slide in
                    departs[slide.id] = ComposerRetouchSeries.fingerprint(slide)
                }
            }
            viewModel.seedHistory()
        }
    }

    func returnRetouchSeries() {
        guard let serie = retouchSeries, let onReturnSeries else { return }
        HapticFeedback.light()
        if viewModel.timelineIsOpen { viewModel.closeTimelinePanel() }
        let retouchees = ComposerRetouchSeries.retouchedScenes(pieces: serie.pieces,
                                                               slideIdByURL: slideIdByMediaURL,
                                                               baselines: retouchBaselines ?? [:],
                                                               slides: viewModel.slides)
        guard !retouchees.isEmpty else { onDismiss(); return }
        renderRetouched(retouchees[...], rendues: []) { rendues in
            onReturnSeries(rendues)
            onDismiss()
        }
    }

    /// Une scène après l'autre : un bake vidéo est asynchrone, et le
    /// contrôleur n'en mène qu'un à la fois.
    private func renderRetouched(_ restantes: ArraySlice<ComposerRetouchedScene>,
                                 rendues: [ComposerRetouchedPiece],
                                 done: @escaping ([ComposerRetouchedPiece]) -> Void) {
        guard let scene = restantes.first else { done(rendues); return }
        let suite = restantes.dropFirst()
        guard let index = viewModel.slides.firstIndex(where: { $0.id == scene.slideId }) else {
            renderRetouched(suite, rendues: rendues, done: done)
            return
        }
        viewModel.selectSlide(at: index)
        let id = scene.piece.attachmentId
        if (viewModel.currentSlide.effects.mediaObjects ?? []).contains(where: { $0.kind == .video }) {
            let slide = ComposerRetouchSeries.messageVideoSlide(viewModel.exportableCurrentSlide())
            sceneExport.bakeForMessage(slide: slide, inputs: viewModel.exportInputs(for: slide)) { url in
                renderRetouched(suite, rendues: rendues + [ComposerRetouchedPiece(attachmentId: id, media: .video(url))],
                                done: done)
            }
            return
        }
        let slide = viewModel.currentSlide
        let image = StorySlideRenderer.renderComposite(
            slide: slide,
            bgImage: viewModel.slideImages[slide.id],
            loadedImages: viewModel.loadedImages,
            size: ComposerRetouchSeries.imageRenderSize(slide: slide, canvasRatio: viewModel.currentCanvasRatio)
        )
        let suivantes = image.map { rendues + [ComposerRetouchedPiece(attachmentId: id, media: .image($0))] } ?? rendues
        renderRetouched(suite, rendues: suivantes, done: done)
    }
}
