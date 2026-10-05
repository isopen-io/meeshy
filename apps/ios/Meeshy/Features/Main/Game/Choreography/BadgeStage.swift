import SwiftUI
import MeeshySDK
import MeeshyUI

/// LE BADGE QUI S'ALLUME OU S'ÉTEINT (#9381) — conception, partie V : « la
/// matière remonte du bas, ou se retire en pointillé », en 0,7 s, « reflet à
/// l'allumage », « tape légère à l'allumage ». L'empreinte (le badge éteint) reste
/// dessous ; la matière la recouvre par le bas, ou s'en retire.
///
/// Sous « réduire les animations » : un fondu entre l'empreinte et la matière.
struct BadgeStage: View {
    let shape: GameBadgeView.Shape
    let material: GameMaterial
    let label: String?
    /// L'état à atteindre ; le badge y va en jouant `play`.
    let lit: Bool
    let play: Int
    var accessibilityLabel: String?

    var body: some View {
        ChoreographyClock(play: play, duration: GameTimeline.badgeDuration) { seconds, reduceMotion in
            stage(seconds: seconds, reduceMotion: reduceMotion)
        }
    }

    private func badge(_ state: GameBadgeView.State) -> some View {
        GameBadgeView(shape: shape, material: material, state: state, label: label, accessibilityLabel: accessibilityLabel)
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
