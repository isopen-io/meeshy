import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - N2 « Son » d'une vidéo, et son N3 « Volume » (#13974, lot I-E4)

/// **Une entrée de N2 « Son »**, identifiée comme dans l'arbre partagé
/// (`media.sound`) : Volume · Muet.
nonisolated enum ComposerMediaSoundEntry: String, CaseIterable, Hashable, Sendable {
    case volume
    case mute
}

/// **La loi de N2 « Son »** : ce que l'arbre déclare, dans SON ordre. Rien
/// n'est écrit en dur ici, l'ordre changé dans le fichier se lit à l'écran.
nonisolated enum ComposerMediaSound {

    static func served(tree: ComposerEditTree = .shared) -> [ComposerMediaSoundEntry] {
        (tree.level(.mediaSound)?.entries ?? []).compactMap { ComposerMediaSoundEntry(rawValue: $0.id) }
    }

    static func entry(_ son: ComposerMediaSoundEntry,
                      tree: ComposerEditTree = .shared) -> ComposerEditTree.Entry? {
        tree.entry(son.rawValue, in: .mediaSound)
    }
}

/// **Le volume d'une vidéo, de 0 à 200 %** — la plage du `StoryVolume` que
/// lisent la scène, le lecteur, l'export et la passerelle. 100 % est le niveau
/// du fichier, 0 % vaut Muet.
nonisolated enum ComposerMediaVolume {

    static let range: ClosedRange<Double> = 0...Double(StoryVolume.maxGain)
    static let neutral: Double = 1

    static func percent(_ volume: Double) -> Int {
        Int((volume * 100).rounded())
    }

    /// **Le curseur écrit le modèle à chaque valeur** (`setMediaVolume`) : la
    /// couche de la vidéo reprend ce niveau à sa configuration suivante, le
    /// lecteur joue au fil du doigt.
    @MainActor
    static func sliderBinding(viewModel: StoryComposerViewModel, mediaId: String) -> Binding<Double> {
        Binding(
            get: { Double(viewModel.currentEffects.mediaObjects?.first { $0.id == mediaId }?.volume ?? 1) },
            set: { viewModel.setMediaVolume(id: mediaId, volume: Float($0)) })
    }

    @MainActor
    static func valueText(_ volume: Double) -> String {
        (Double(percent(volume)) / 100).formatted(.percent.precision(.fractionLength(0)))
    }
}

/// **N3 « Volume » : le curseur SEUL, dans la feuille basse**, avec
/// Réinitialiser (100 %) dès que le niveau s'en écarte. Toucher deux fois la
/// valeur la remet aussi à 100 %, le geste des réglages.
struct ComposerMediaVolumeDial: View {
    @ObservedObject var viewModel: StoryComposerViewModel
    let mediaId: String

    var body: some View {
        let curseur = ComposerMediaVolume.sliderBinding(viewModel: viewModel, mediaId: mediaId)
        let ecart = ComposerMediaVolume.percent(curseur.wrappedValue) != ComposerMediaVolume.percent(ComposerMediaVolume.neutral)
        VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
            if ecart { resetControl }
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: "speaker.fill")
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundStyle(Color.white.opacity(0.7))
                    .accessibilityHidden(true)
                Slider(value: curseur, in: ComposerMediaVolume.range)
                    .tint(Color.white)
                    .frame(minHeight: 44)
                    .accessibilityLabel(Text(ComposerCaptureCopy.volume))
                    .accessibilityValue(Text(ComposerMediaVolume.valueText(curseur.wrappedValue)))
                    .accessibilityAction(named: Text(ComposerAdjustCopy.reset)) { reset() }
                Text(ComposerMediaVolume.valueText(curseur.wrappedValue))
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold).monospacedDigit())
                    .foregroundStyle(Color.white.opacity(ecart ? 0.92 : 0.55))
                    .lineLimit(1)
                    .fixedSize()
                    .frame(minWidth: 48, minHeight: 44, alignment: .trailing)
                    .contentShape(Rectangle())
                    .onTapGesture(count: 2) { reset() }
                    .accessibilityHidden(true)
            }
        }
        .accessibilityIdentifier("composer.media.volume.dial")
    }

    private var resetControl: some View {
        Button(action: reset) {
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: "arrow.uturn.backward").font(MeeshyFont.relative(13, weight: .semibold))
                Text(ComposerAdjustCopy.reset)
                    .font(MeeshyFont.relative(MeeshyFont.smallSize, weight: .semibold))
                    .lineLimit(1)
                    .fixedSize()
            }
            .foregroundStyle(Color.white.opacity(0.85))
            .padding(.horizontal, MeeshySpacing.mdPlus)
            .frame(minHeight: 44)
            .background(Capsule().fill(Color.white.opacity(0.12)))
            .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(Text(ComposerAdjustCopy.reset))
    }

    private func reset() {
        viewModel.setMediaVolume(id: mediaId, volume: Float(ComposerMediaVolume.neutral))
        HapticFeedback.light()
    }
}
