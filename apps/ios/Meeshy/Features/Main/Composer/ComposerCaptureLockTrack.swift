import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La clé du verrou** (#8671, directive porteur 2026-09-29 : « ajouter une clé
/// pour la vidéo permettant de lock la vidéo »). Elle paraît dès que le doigt
/// tient pour filmer, à DROITE, et se remplit pendant qu'il y glisse ; à 1, la
/// prise continue sans lui.
///
/// Le glissé qui verrouille se lit sur la translation PHYSIQUE vers la droite
/// (`ComposerShutterGesture.locks`) : la piste ne se retourne donc pas en arabe,
/// sans quoi son chevron montrerait l'opposé du geste — `forward`, posé en
/// gauche-à-droite, pointe toujours à droite.
struct ComposerCaptureLockTrack: View {
    let progress: Double
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Image(systemName: "chevron.forward")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .bold))
                .foregroundStyle(.white.opacity(0.45 + 0.55 * progress))
            Image(systemName: progress >= 1 ? "lock.fill" : "lock.open.fill")
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundStyle(.white)
                .scaleEffect(reduceMotion ? 1 : 1 + 0.15 * progress)
        }
        .padding(.horizontal, MeeshySpacing.mdPlus)
        .frame(height: MeeshyControlSize.tapTarget)
        .adaptiveLiquidGlass(in: Capsule())
        .overlay(Capsule().strokeBorder(.white.opacity(0.3 + 0.5 * progress), lineWidth: MeeshyBorder.strong))
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityHidden(true)
        .transition(.opacity.combined(with: .scale(scale: 0.8, anchor: .leading)))
    }
}
