import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Ce que « Modifier » du fond ouvre EN BAS** (#13974, lot I-E2) : la bande
/// du Cadrage (la `ComposerFrameBand` existante), ou la feuille basse de
/// Recadrer, Couper, Filtres, Cadres, Description — et, sous Réglages ou
/// Effets, le curseur SEUL du réglage touché (N3), avec Comparer et
/// Réinitialiser. Chaque contenu est celui que l'édition en place montait
/// déjà : chaque geste écrit le modèle, la scène se repeint au fil du doigt.
struct ComposerBackgroundModifySheet: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let mediaId: String
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
        if path.adjustment == nil, path.entry == .framing {
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
        if let kind = path.adjustment {
            ComposerMediaAdjustPanel(viewModel: viewModel, mediaId: mediaId, onCompare: onCompare, only: kind)
        } else {
            entryContent
        }
    }

    @ViewBuilder
    private var entryContent: some View {
        switch path.entry {
        case .crop:
            if let media { ComposerMediaCropPads(viewModel: viewModel, media: media) }
        case .trim:
            if let source = viewModel.sourceTrim(id: mediaId) {
                ComposerMediaTrimBand(viewModel: viewModel, objectId: mediaId, source: source)
            }
        case .filters:
            if let media { ComposerMediaFilterGrid(viewModel: viewModel, media: media, isBackground: true) }
            ComposerMediaLookPanel(viewModel: viewModel, mediaId: mediaId, families: [.filters, .effects])
        case .frames:
            ComposerMediaLookPanel(viewModel: viewModel, mediaId: mediaId, families: [.frames])
        case .description:
            if let altText {
                MediaAltTextField(kind: .alt, text: altText.wrappedValue) { altText.wrappedValue = $0 }
            }
        case .framing, .adjust, .effects, .sound, .loop, .rotate, nil:
            EmptyView()
        }
    }

    private var media: StoryMediaObject? {
        viewModel.currentEffects.mediaObjects?.first { $0.id == mediaId }
    }
}
