import SwiftUI
import MeeshySDK
import MeeshyUI

/// Ce qui fait d'un badge d'accumulation une médaille : la famille de l'axe (la couleur de l'émail),
/// son pictogramme et l'arc vers le palier suivant.
struct BadgeMedal: Equatable {
    let family: GameMedalFamily
    let glyph: GameMedalGlyph
    let progress: Double
}

/// LE BADGE QUI S'ALLUME OU S'ÉTEINT (#9381) — conception, partie V : « la
/// matière remonte du bas, ou se retire en pointillé », en 0,7 s, « reflet à
/// l'allumage », « tape légère à l'allumage ». L'empreinte (le badge éteint) reste
/// dessous ; la matière la recouvre par le bas, ou s'en retire.
///
/// Sous « réduire les animations » : un fondu entre l'empreinte et la matière.
///
/// Un badge d'accumulation se dessine en MÉDAILLE (#9466) dès que l'hôte donne sa famille, son
/// pictogramme d'axe et sa progression (`BadgeMedal`) ; sans eux, l'hexagone d'avant.
struct BadgeStage: View {
    let shape: GameBadgeView.Shape
    let material: GameMaterial
    let label: String?
    /// L'état à atteindre ; le badge y va en jouant `play`.
    let lit: Bool
    let play: Int
    var accessibilityLabel: String?
    var medal: BadgeMedal?

    var body: some View {
        ChoreographyClock(play: play, duration: GameTimeline.badgeDuration) { seconds, reduceMotion in
            stage(seconds: seconds, reduceMotion: reduceMotion)
        }
    }

    @ViewBuilder
    private func badge(_ state: GameBadgeView.State) -> some View {
        if let medal, shape == .accumulation {
            GameMedalView(
                family: medal.family, glyph: medal.glyph, material: material,
                state: state == .lit ? .lit : .imprint, progress: medal.progress, label: label,
                surface: ThemeManager.shared.backgroundPrimary, muted: ThemeManager.shared.textMuted,
                accessibilityLabel: accessibilityLabel
            )
            // L'émail du Prisme s'irise avec l'inclinaison du téléphone ; toute autre matière n'en reçoit aucune.
            .gamePrismTilt(active: material == .prism)
        } else {
            GameBadgeView(shape: shape, material: material, state: state, label: label, accessibilityLabel: accessibilityLabel)
        }
    }

    @ViewBuilder
    private func stage(seconds: Double?, reduceMotion: Bool) -> some View {
        if let seconds {
            let fill = reduceMotion
                ? min(1, seconds / GameTimeline.reducedDuration)
                : GameTimeline.badgeFill(lighting: lit, at: seconds)
            let shown = reduceMotion ? (lit ? fill : 1 - fill) : fill
            ZStack {
                badge(.imprint)
                if reduceMotion {
                    badge(.lit).opacity(shown)
                } else {
                    badge(.lit)
                        .mask(alignment: .bottom) {
                            GeometryReader { proxy in
                                Rectangle()
                                    .frame(height: proxy.size.height * shown)
                                    .frame(maxHeight: .infinity, alignment: .bottom)
                            }
                        }
                        .gameSpecularSheen(progress: lit ? GameTimeline.window(seconds, from: 0.3, to: GameTimeline.badgeDuration) : 0)
                }
            }
        } else {
            badge(lit ? .lit : .imprint)
        }
    }
}
