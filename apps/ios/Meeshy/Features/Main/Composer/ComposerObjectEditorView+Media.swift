import AVFoundation
import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Les trois gestes d'un MÉDIA, dans le même écran que ceux d'un texte**
/// (#4082, vue `2d`).
///
/// > « Un seul écran pour les trois gestes. Le cadre porte le recadrage, la
/// > bande porte le rognage, la coupe scinde à la tête de lecture — l'ordre des
/// > rangées suit l'ordre des décisions, pas trois écrans successifs. »
///
/// ## Ce que ce lot sert, et ce qu'il ne sert PAS
///
/// La planche en dessine cinq. Trois existent de bout en bout et sont ici :
///
/// | geste | où il vit |
/// |---|---|
/// | ✂ ROGNER | `MediaTrimStrip` (SDK) + `viewModel.setSourceTrim` |
/// | ◍ MUET | `viewModel.toggleMediaMute` — no-op sur une image, rien à couper |
/// | ⟲ PIVOTER | `viewModel.rotateMedia` — vaut pour une image AUSSI |
///
/// **⌗ RECADRER et ✂ COUPER manquent au CONTRAT** (#5085) : aucun champ du
/// modèle ne les porte, et les ajouter demande `packages/shared`, les trois
/// décodeurs et les trois moteurs de rendu. Les monter inertes ferait pire que
/// leur absence — la loi 4 bannit un contrôle sans effet, et ici l'auteur
/// croirait avoir recadré.
///
/// L'écran ne sera donc pas déclaré conforme sur ce lot : trois gestes sur cinq
/// est un Status, pas un livrable.
extension ComposerObjectEditorView {

    var mediaObject: StoryMediaObject? {
        viewModel.currentEffects.mediaObjects?.first { $0.id == objectId }
    }

    /// **Demander au FICHIER sa durée**, comme le fait le meuble pour sa bande
    /// (`mesurerLaSource`). Le modèle ne la porte pas de façon fiable, et c'est
    /// la seule mesure qui laisse un rognage se DÉFAIRE : sans elle, chaque
    /// réouverture montrerait une source rétrécie à la fenêtre précédente —
    /// un rognage qui se referme sur lui-même à chaque visite.
    func measureMediaSource(url: URL) async {
        let asset = AVURLAsset(url: url)
        guard let duree = try? await asset.load(.duration) else { return }
        let secondes = CMTimeGetSeconds(duree)
        guard secondes.isFinite, secondes > 0 else { return }
        mediaSourceDuration = secondes
    }

    @ViewBuilder
    var mediaOptions: some View {
        if let media = mediaObject {
            VStack(alignment: .leading, spacing: 18) {
                if let source = viewModel.sourceTrim(id: objectId) {
                    section(ComposerObjectEditorCopy.trim, .media(.trim)) {
                        trimBand(source)
                    }
                }
                section(ComposerObjectEditorCopy.mediaActions, .media(.actions)) {
                    mediaActionRow(media)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 28)
        }
    }

    private func trimBand(_ source: (url: URL, bounds: MediaTrimBounds,
                                     sourceDuration: Double, isVideo: Bool)) -> some View {
        // La durée servie est la PLUS GRANDE des deux — celle du modèle et
        // celle mesurée sur le fichier. Tant que la mesure n'est pas revenue,
        // la bande travaille sur ce que le modèle sait ; dès qu'elle arrive,
        // la source reprend sa vraie longueur. Prendre la mesure seule ferait
        // clignoter la bande à zéro le temps du chargement.
        let duree = max(mediaSourceDuration, source.sourceDuration)
        return MediaTrimStrip(
            content: source.isVideo ? .video(source.url) : .audio,
            sourceDuration: duree,
            bounds: MediaTrimRule.resolved(start: source.bounds.start,
                                           end: source.bounds.end,
                                           sourceDuration: duree),
            waveform: [],
            accent: MeeshyColors.brandPrimary,
            onChange: { bornes in
                viewModel.setSourceTrim(id: objectId, bounds: bornes, sourceDuration: duree)
            }
        )
        .task(id: source.url) { await measureMediaSource(url: source.url) }
    }

    /// **`◍ MUET` n'est servi que pour une VIDÉO ; `⟲ PIVOTER` pour les deux.**
    ///
    /// Ce n'est pas une symétrie ratée : une image n'a pas de son à couper, et
    /// un bouton muet posé dessus serait un contrôle sans effet. Une photo
    /// prise de travers, en revanche, est le cas nominal du pivotement.
    private func mediaActionRow(_ media: StoryMediaObject) -> some View {
        HStack(spacing: 10) {
            if media.kind == .video {
                mediaAction(symbol: media.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill",
                            title: ComposerObjectEditorCopy.mute,
                            isOn: media.isMuted) {
                    viewModel.toggleMediaMute(id: objectId)
                }
            }
            mediaAction(symbol: "rotate.left",
                        title: ComposerObjectEditorCopy.rotate,
                        isOn: false) {
                viewModel.rotateMedia(id: objectId)
            }
            Spacer(minLength: 0)
        }
    }

    private func mediaAction(symbol: String,
                             title: String,
                             isOn: Bool,
                             action: @escaping () -> Void) -> some View {
        Button {
            action()
            HapticFeedback.light()
        } label: {
            HStack(spacing: 6) {
                Image(systemName: symbol).font(.system(size: 13, weight: .semibold))
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
