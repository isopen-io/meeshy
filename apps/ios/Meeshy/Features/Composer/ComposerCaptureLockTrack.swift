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
///
/// **Le verrou activé se SCELLE avant de partir** (#9753) : le cadenas se ferme
/// et rebondit, élastique (`ComposerLockSeal`), son liseré passe au vert de la
/// réussite, puis il quitte l'écran.
struct ComposerCaptureLockTrack: View {
    let progress: Double
    var sealed = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// La longueur de la flèche pointillée qui mène du déclencheur au cadenas (A9).
    static let arrowLength: CGFloat = 36

    var body: some View {
        HStack(alignment: .top, spacing: MeeshySpacing.xs) {
            ComposerLockArrow(progress: progress)
                .frame(width: Self.arrowLength, height: MeeshyControlSize.tapTarget)
            VStack(spacing: MeeshySpacing.xs) {
                Image(systemName: sealed || progress >= 1 ? "lock.fill" : "lock.open.fill")
                    .font(MeeshyFont.relative(17, weight: .semibold))
                    .foregroundStyle(sealed ? MeeshyColors.success : .white)
                    .scaleEffect(ComposerLockSeal.glyphScale(progress: progress, sealed: sealed, reduceMotion: reduceMotion))
                    .animation(ComposerLockSeal.animation(reduceMotion: reduceMotion), value: sealed)
                    .frame(width: MeeshyControlSize.tapTarget, height: MeeshyControlSize.tapTarget)
                    .adaptiveLiquidGlass(in: Circle())
                    .overlay(Circle().strokeBorder(sealed ? MeeshyColors.success : .white.opacity(0.3 + 0.5 * progress),
                                                   lineWidth: MeeshyBorder.strong))
                // « mains libres » : ce que le glissé vers le cadenas DONNE (A9).
                Text(ComposerCameraCopy.handsFree)
                    .font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
                    .foregroundStyle(.white)
                    .shadow(color: .black.opacity(0.6), radius: 3, y: 1)
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .environment(\.layoutDirection, .leftToRight)
        .accessibilityHidden(true)
        .transition(.opacity.combined(with: .scale(scale: 0.8, anchor: .leading)))
    }
}

/// La flèche pointillée qui va du déclencheur au cadenas : elle s'éclaire à
/// mesure que le doigt glisse vers lui.
private struct ComposerLockArrow: View {
    let progress: Double

    var body: some View {
        Canvas { context, size in
            let milieu = size.height / 2
            let trait = Path { path in
                path.move(to: CGPoint(x: 0, y: milieu))
                path.addLine(to: CGPoint(x: size.width - 4, y: milieu))
            }
            let pointe = Path { path in
                path.move(to: CGPoint(x: size.width - 9, y: milieu - 5))
                path.addLine(to: CGPoint(x: size.width - 3, y: milieu))
                path.addLine(to: CGPoint(x: size.width - 9, y: milieu + 5))
            }
            let teinte = Color.white.opacity(0.45 + 0.55 * progress)
            context.stroke(trait, with: .color(teinte), style: StrokeStyle(lineWidth: 2, lineCap: .round, dash: [4, 4]))
            context.stroke(pointe, with: .color(teinte), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
        }
    }
}
