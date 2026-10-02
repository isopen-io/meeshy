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

    /// L'onde d'un SON, quand elle a été analysée ; une vidéo n'en porte pas
    /// sur le modèle — la bande montre alors ses vignettes seules.
    @MainActor
    static func waveform(viewModel: StoryComposerViewModel, objectId: String) -> [Float] {
        viewModel.currentEffects.audioPlayerObjects?
            .first(where: { $0.id == objectId })?
            .waveformSamples ?? []
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
        HStack(spacing: MeeshySpacing.smPlus) {
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
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: symbol).font(MeeshyFont.relative(13, weight: .semibold))
                Text(title).font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
            }
            .foregroundStyle(isOn ? Color.white : Color.white.opacity(0.85))
            .padding(.horizontal, MeeshySpacing.mdPlus)
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

/// **LA grille de filtres d'un média** — partagée par l'éditeur d'objet et
/// l'édition en place (#9138). La grille du SDK, telle quelle ; ce qui change
/// est la CIBLE (retour porteur 2026-09-28 : « les modifications impactent cet
/// objet-là et non toute la scène ») : le FOND garde le filtre de slide et son
/// aperçu, un média POSÉ règle son propre filtre sur sa propre image.
struct ComposerMediaFilterGrid: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let media: StoryMediaObject
    let isBackground: Bool

    var body: some View {
        StoryFilterGridView(viewModel: viewModel, previewImage: isBackground ? viewModel.currentSlideBackgroundImage : viewModel.loadedImages[media.id], objectId: isBackground ? nil : media.id)
    }
}
