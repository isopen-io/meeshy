import SwiftUI
import MeeshySDK
import MeeshyUI

/// LA FRAPPE (#9381) — conception, partie V : « Mee pose le flan, Meo frappe,
/// "tchak", la pièce se retourne et montre son numéro », en 1,2 s, avec l'onde
/// radiale et le reflet des shaders du SDK (iOS 17+ en Metal, repli en dégradé
/// sur iOS 16), et le choc net + léger rebond de `GameHapticPattern.strike`.
///
/// Une scène qui se REJOUE : `play` s'incrémente à chaque frappe confirmée.
/// Avant la première, la pièce montre son avers ; après, son revers numéroté.
/// Sous « réduire les animations », l'avers laisse place au revers par un fondu.
///
/// Mee et Meo sont les films du pack de stickers, en image fixe : un colibri
/// qui bat des ailes pendant que l'autre frappe détournerait l'œil de la pièce.
struct MintStrikeScene: View {
    let edition: MeeshEdition
    let number: Int
    let year: Int
    let play: Int
    /// Le côté de la pièce ; la scène s'étend de part et d'autre.
    var coinSide: CGFloat = 72
    /// Frappée, la pièce se pose sur son revers sans rejouer la scène (écran rouvert).
    var restsReversed = false

    private var figure: CGFloat { coinSide * 0.78 }

    var body: some View {
        ChoreographyClock(play: play, duration: GameTimeline.strikeDuration) { seconds, reduceMotion in
            scene(seconds: seconds, reduceMotion: reduceMotion)
        }
        .frame(width: coinSide + figure * 2 + 28, height: coinSide + 18)
        .accessibilityElement(children: .ignore)
    }

    @ViewBuilder
    private func scene(seconds: Double?, reduceMotion: Bool) -> some View {
        let strike = seconds.map { GameTimeline.strike(at: $0) }
        let reduced = reduceMotion && seconds != nil
        let fade = reduced ? min(1, (seconds ?? 0) / GameTimeline.reducedDuration) : 0
        ZStack {
            HStack(spacing: 14) {
                actor("mee-sourire", mirrored: false)
                    .offset(x: reduced ? 0 : -(1 - (strike?.plate ?? 1)) * 18, y: reduced ? 0 : -(strike?.plate ?? 0) * 2)
                Color.clear.frame(width: coinSide, height: coinSide)
                actor("meo-muscles", mirrored: true)
                    .rotationEffect(.degrees(reduced ? 0 : -(strike?.hammer ?? 0) * 18), anchor: .bottom)
                    .offset(x: reduced ? 0 : (strike?.hammer ?? 0) * -8, y: reduced ? 0 : (strike?.hammer ?? 0) * 6)
            }
            coin(strike: strike, reduced: reduced, fade: fade)
            if let strike, !reduced, strike.burst > 0.05 {
                Text(String(localized: "game.mint.tchak", defaultValue: "Tchak !", bundle: .main))
                    .font(.system(size: 15, weight: .heavy, design: .rounded))
                    .foregroundColor(MeeshyColors.warning)
                    .opacity(strike.burst)
                    .scaleEffect(0.8 + 0.4 * strike.burst)
                    .offset(y: -coinSide * 0.62)
                    .accessibilityHidden(true)
            }
        }
    }

    private func actor(_ id: String, mirrored: Bool) -> some View {
        MeeStickerFilmView(filmID: id, animated: false, side: figure, animates: false, pixelCap: 240)
            .scaleEffect(x: mirrored ? -1 : 1, y: 1)
            .frame(width: figure, height: figure)
            .allowsHitTesting(false)
    }

    @ViewBuilder
    private func coin(strike: GameTimeline.Strike?, reduced: Bool, fade: Double) -> some View {
        let obverse = MeeshCoinView(face: .obverse, edition: edition, figures: nil)
        let reverse = MeeshCoinView(face: .reverse(number: number, year: year), edition: edition, figures: nil)
        if reduced {
            ZStack {
                obverse.opacity(1 - fade)
                reverse.opacity(fade)
            }
            .frame(width: coinSide, height: coinSide)
        } else if let strike {
            let angle = strike.flip * 180
            ZStack {
                obverse
                    .opacity(angle < 90 ? 1 : 0)
                    .rotation3DEffect(.degrees(angle), axis: (x: 0, y: 1, z: 0))
                    .gameStrikeWave(progress: strike.wave, center: .center, amplitude: 4, wavelength: 14)
                reverse
                    .opacity(angle >= 90 ? 1 : 0)
                    .rotation3DEffect(.degrees(angle - 180), axis: (x: 0, y: 1, z: 0))
                    .gameSpecularSheen(progress: strike.sheen)
            }
            .frame(width: coinSide, height: coinSide)
            .scaleEffect(1 - strike.hammer * 0.06)
        } else if restsReversed {
            reverse.frame(width: coinSide, height: coinSide)
        } else {
            obverse.frame(width: coinSide, height: coinSide)
        }
    }
}
