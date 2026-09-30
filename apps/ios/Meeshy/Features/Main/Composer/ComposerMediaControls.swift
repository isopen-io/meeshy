import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Les contrôles d'un MÉDIA, partagés par l'éditeur d'objet et la scène
//
// Extraits de `ComposerObjectEditorView+Media.swift` pour #8847 : le FOND
// s'édite désormais sous la scène, avec les MÊMES contrôles que l'éditeur
// plein écran sert à un média posé. Deux copies divergeraient au premier
// réglage — la faute que le composer a déjà payée sur les légendes.

/// **La bande de rognage d'une source qui a une durée** (#4082) — vidéo ou
/// son, sur les bornes que le modèle porte.
struct ComposerMediaTrimBand: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let objectId: String
    let source: (url: URL, bounds: MediaTrimBounds, sourceDuration: Double, isVideo: Bool)
    var waveform: [Float] = []

    /// **La durée du FICHIER**, mesurée à l'ouverture. Le modèle ne la porte pas
    /// de façon fiable ; sans elle, chaque réouverture montrerait une source
    /// rétrécie à la fenêtre précédente — un rognage qui se referme sur
    /// lui-même à chaque visite.
    @State private var measuredDuration: Double = 0

    var body: some View {
        // La PLUS GRANDE des deux : tant que la mesure n'est pas revenue, la
        // bande travaille sur ce que le modèle sait — prendre la mesure seule
        // ferait clignoter la bande à zéro le temps du chargement.
        let duree = max(measuredDuration, source.sourceDuration)
        MediaTrimStrip(
            content: source.isVideo ? .video(source.url) : .audio,
            sourceDuration: duree,
            bounds: MediaTrimRule.resolved(start: source.bounds.start,
                                           end: source.bounds.end,
                                           sourceDuration: duree),
            waveform: waveform,
            accent: MeeshyColors.brandPrimary,
            onChange: { bornes in
                viewModel.setSourceTrim(id: objectId, bounds: bornes, sourceDuration: duree)
            }
        )
        .task(id: source.url) { await measure(url: source.url) }
    }

    private func measure(url: URL) async {
        let asset = AVURLAsset(url: url)
        guard let duree = try? await asset.load(.duration) else { return }
        let secondes = CMTimeGetSeconds(duree)
        guard secondes.isFinite, secondes > 0 else { return }
        measuredDuration = secondes
    }
}

/// **`◍ MUET` n'est servi que pour une VIDÉO ; `⟲ PIVOTER` pour les deux.**
///
/// Ce n'est pas une symétrie ratée : une image n'a pas de son à couper, et un
/// bouton muet posé dessus serait un contrôle sans effet. Une photo prise de
/// travers, en revanche, est le cas nominal du pivotement.
struct ComposerMediaActionRow: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let media: StoryMediaObject

    var body: some View {
        HStack(spacing: 10) {
            if media.kind == .video {
                action(symbol: media.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                       title: ComposerObjectEditorCopy.mute,
                       isOn: media.isMuted) {
                    viewModel.toggleMediaMute(id: media.id)
                }
            }
            action(symbol: "rotate.left", title: ComposerObjectEditorCopy.rotate, isOn: false) {
                viewModel.rotateMedia(id: media.id)
            }
            Spacer(minLength: 0)
        }
    }

    private func action(symbol: String,
                        title: String,
                        isOn: Bool,
                        perform: @escaping () -> Void) -> some View {
        Button {
            perform()
            HapticFeedback.light()
        } label: {
            // **Tailles RELATIVES** (`FixedFontSizeGuardTests`) : la capsule
            // s'étire avec son contenu quand le corps de texte grandit.
            HStack(spacing: 6) {
                Image(systemName: symbol).font(MeeshyFont.relative(13, weight: .semibold))
                Text(title).font(MeeshyFont.relative(12, weight: .semibold))
            }
            .foregroundStyle(isOn ? Color.white : Color.white.opacity(0.85))
            .padding(.horizontal, 14)
            .frame(height: 40)
            .background {
                if isOn {
                    Capsule().fill(MeeshyColors.brandGradient)
                } else {
                    Capsule().fill(Color.white.opacity(0.12))
                }
            }
            .contentShape(Capsule().inset(by: -2))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isOn ? [.isButton, .isSelected] : .isButton)
    }
}

/// **Les contrôles de l'outil du FOND, sous la scène** (#8847) — à la place de
/// ce qui y était (barre des mentions et hashtags, socle), que le mode outil
/// masque. La plaque de verre est celle de la surface (`toolOptions`) : cette
/// vue ne porte que le contenu de l'outil ouvert.
struct ComposerBackgroundToolPanel: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let section: ComposerObjectEditorSection
    let media: StoryMediaObject
    let altText: Binding<String>

    var body: some View {
        content
            .frame(maxWidth: .infinity, alignment: .leading)
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerObjectEditorCopy.entry(section)))
    }

    @ViewBuilder
    private var content: some View {
        switch section {
        case .media(.filter):
            // Le filtre d'un FOND est celui de la slide, prévisualisé sur le
            // fond — la même portée que l'éditeur d'objet lui donne.
            StoryFilterGridView(viewModel: viewModel,
                                previewImage: viewModel.currentSlideBackgroundImage,
                                objectId: nil)
        case .media(.trim):
            if let source = viewModel.sourceTrim(id: media.id) {
                ComposerMediaTrimBand(viewModel: viewModel, objectId: media.id, source: source)
            }
        case .media(.actions):
            ComposerMediaActionRow(viewModel: viewModel, media: media)
        case .media(.altText):
            MediaAltTextField(kind: .alt, text: altText.wrappedValue) { saisi in
                altText.wrappedValue = saisi
            }
        case .media(.crop), .media(.split), .tool, .timing, .plan:
            // Hors de `ComposerBackgroundTools.servedInline` : le rail ne les
            // offre jamais pour un fond.
            EmptyView()
        }
    }
}
