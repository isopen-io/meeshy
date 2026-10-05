import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'ÉCU QUI MONTE (#9381) — conception, partie V : « nouveau rang ou division :
/// l'écu monte, la Signature se grave trait par trait, les tenants se posent »,
/// en 1,6 s, avec « reflet sur la matière, irisation pour Mythe » et « trois
/// tapes, une par trait ».
///
/// Au repos (jamais joué, ou fini) c'est `RankBlasonView` tel quel. Pendant la
/// chorégraphie : l'écu monte en ressort, chacun des trois traits de la Signature
/// s'allume à son tour (la tape haptique tombe sur le même instant,
/// `GameHapticPattern.rank`), puis Mee et Meo se posent de part et d'autre.
/// Sous « réduire les animations » : un fondu de l'écu posé.
struct RankBlasonStage: View {
    let rank: GloryRank
    let division: GloryDivision?
    let title: String?
    let play: Int
    var accessibilityLabel: String?

    /// Où la Signature gravée tombe dans le dessin de l'écu (200 × 184).
    private static let signatureCenter = CGPoint(x: 100.0 / 200.0, y: 81.0 / 184.0)
    private static let signatureSide: CGFloat = 60.0 / 200.0

    var body: some View {
        ChoreographyClock(play: play, duration: GameTimeline.rankDuration) { seconds, reduceMotion in
            stage(seconds: seconds, reduceMotion: reduceMotion)
        }
    }

    @ViewBuilder
    private func stage(seconds: Double?, reduceMotion: Bool) -> some View {
        if let seconds, reduceMotion {
            blason(tenants: true)
                .opacity(min(1, seconds / GameTimeline.reducedDuration))
        } else if let seconds {
            let phase = GameTimeline.rank(at: seconds)
            blason(tenants: phase.tenants > 0.5)
                .overlay(strokes(phase.strokes))
                .offset(y: (1 - phase.rise) * 18)
                .scaleEffect(0.88 + 0.12 * phase.rise)
                .opacity(0.25 + 0.75 * phase.rise)
                .gameSpecularSheen(progress: phase.sheen)
        } else {
            blason(tenants: true)
        }
    }

    @ViewBuilder
    private func blason(tenants: Bool) -> some View {
        let view = RankBlasonView(
            rank: rank, division: division, title: title,
            figures: tenants ? .standard : nil, accessibilityLabel: accessibilityLabel
        )
        if rank == .mythe {
            view.gamePrismTilt()
        } else {
            view
        }
    }

    /// Les trois traits de la Signature, un éclat chacun, posés sur la gravure.
    private func strokes(_ glows: [Double]) -> some View {
        GeometryReader { proxy in
            let side = proxy.size.width * Self.signatureSide
            ZStack {
                ForEach(0..<3, id: \.self) { index in
                    MeeshyDashesShape(dashIndex: index)
                        .stroke(Color.white, style: StrokeStyle(lineWidth: side * 96 / 1024, lineCap: .round))
                        .frame(width: side, height: side)
                        .opacity(0.9 * (glows.indices.contains(index) ? glows[index] : 0))
                        .blur(radius: 0.6)
                }
            }
            .frame(width: side, height: side)
            .position(x: proxy.size.width * Self.signatureCenter.x, y: proxy.size.height * Self.signatureCenter.y)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}
