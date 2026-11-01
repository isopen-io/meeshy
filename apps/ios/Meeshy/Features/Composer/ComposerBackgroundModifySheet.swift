import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que « Modifier » du fond ou d'une image posée ouvre EN BAS** (#13974,
/// lots I-E2 et I-E3) : la bande du Cadrage du fond (la `ComposerFrameBand`
/// existante), ou la feuille basse de
/// Recadrer, Couper, Filtres, Cadres, Description — et, sous Réglages ou
/// Effets, le curseur SEUL du réglage touché (N3), avec Comparer et
/// Réinitialiser — et, sous Son, le curseur seul du Volume (I-E4). Chaque contenu est celui que l'édition en place montait
/// déjà : chaque geste écrit le modèle, la scène se repeint au fil du doigt.
struct ComposerBackgroundModifySheet: View {

    /// **Ce que la feuille montre, lu du seul chemin** : le curseur d'un
    /// réglage (N3), le curseur du Volume, la bande du Cadrage d'un fond, ou
    /// le contenu de l'entrée ouverte.
    nonisolated enum Content: Equatable, Sendable {
        case adjustment(AdjustmentKind)
        case volume
        case framingBand
        case entry(ComposerBackgroundModifyEntry?)

        static func of(_ path: ComposerBackgroundModifyPath, isBackground: Bool) -> Content {
            if let kind = path.adjustment { return .adjustment(kind) }
            if path.volume { return .volume }
            return path.entry == .framing && isBackground ? .framingBand : .entry(path.entry)
        }
    }

    @ObservedObject var viewModel: StoryComposerViewModel
    let mediaId: String
    var isBackground = true
    let path: ComposerBackgroundModifyPath
    let plateauTint: Color
    let header: ComposerPropertiesHeader
    var altText: Binding<String>?
    let framing: Framing
    var onCompare: ((Bool) -> Void)?

    /// Le cadrage du fond et ce qui l'écrit (`MeeshyComposerHost+Frame`).
    struct Framing {
        let fitMode: String
        let backdrop: StoryBackdrop
        let onPickFitMode: (String) -> Void
        let onPickBackdrop: (StoryBackdrop) -> Void
    }

    var body: some View {
        if Content.of(path, isBackground: isBackground) == .framingBand {
            ComposerFrameBand(fitMode: framing.fitMode, backdrop: framing.backdrop, plateauTint: plateauTint,
                              onPickFitMode: framing.onPickFitMode, onPickBackdrop: framing.onPickBackdrop)
                .accessibilityIdentifier("composer.background.modify.framing")
        } else {
            ComposerPropertiesSheetPlate(plateauTint: plateauTint) {
                VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                    header
                    content
                }
            }
            .environment(\.colorScheme, .dark)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("composer.background.modify.sheet")
        }
    }

    @ViewBuilder
    private var content: some View {
        switch Content.of(path, isBackground: isBackground) {
        case .adjustment(let kind):
            ComposerMediaAdjustPanel(viewModel: viewModel, mediaId: mediaId, onCompare: onCompare, only: kind)
        case .volume: ComposerMediaVolumeDial(viewModel: viewModel, mediaId: mediaId)
        case .framingBand, .entry: entryContent
        }
    }

    @ViewBuilder
    private var entryContent: some View {
        switch path.entry {
        case .crop:
            if let media { ComposerMediaCropPads(viewModel: viewModel, media: media) }
        case .trim:
            if let source = viewModel.sourceTrim(id: mediaId) {
                ComposerMediaTrimBand(viewModel: viewModel, objectId: mediaId, source: source,
                                      waveform: ComposerMediaTrimBand.waveform(viewModel: viewModel,
                                                                               objectId: mediaId))
            }
        case .filters:
            if let media { ComposerMediaFilterGrid(viewModel: viewModel, media: media, isBackground: isBackground) }
            ComposerMediaLookPanel(viewModel: viewModel, mediaId: mediaId, families: [.filters, .effects])
        case .frames:
            ComposerMediaLookPanel(viewModel: viewModel, mediaId: mediaId, families: [.frames])
        case .description:
            if let altText {
                MediaAltTextField(kind: .alt, text: altText.wrappedValue) { altText.wrappedValue = $0 }
            }
        case .framing, .adjust, .effects, .sound, .loop, .rotate, .setAsBackground, .replaceBackground,
             .makeSticker, nil:
            EmptyView()
        }
    }

    private var media: StoryMediaObject? {
        viewModel.currentEffects.mediaObjects?.first { $0.id == mediaId }
    }
}
