import SwiftUI

/// **L'onde seule (K35)** : les barres, rien d'autre. Un seul `Canvas` : une passe de
/// dessin, pas une vue par barre. Les barres jouées ont la pleine teinte, celles à venir
/// 30 % ; pendant la lecture elles battent par tiers, entre 62 et 100 % de leur hauteur.
///
/// Agnostique : des niveaux de 0 à 1, une fraction jouée, une teinte. Elle ne joue rien,
/// ne charge rien, ne connaît ni message ni pièce jointe. Le remplissage part du bord
/// de début (de la droite en arabe).
public struct MeeshyWaveBars: View {
    private let samples: [Float]
    private let progress: Double
    private let isLive: Bool
    private let tint: Color?
    private let height: Double

    @Environment(\.layoutDirection) private var layoutDirection
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    public init(samples: [Float] = [], progress: Double, isLive: Bool = false, tint: Color? = nil, height: Double = 40) {
        self.samples = samples
        self.progress = progress
        self.isLive = isLive
        self.tint = tint
        self.height = height
    }

    public var body: some View {
        let live = isLive && !reduceMotion
        let color = tint ?? .accentColor
        let flip = layoutDirection == .rightToLeft
        Group {
            if live {
                TimelineView(.animation(minimumInterval: 1.0 / 30.0)) { context in
                    canvas(color: color, phase: context.date.timeIntervalSinceReferenceDate)
                }
            } else {
                canvas(color: color, phase: nil)
            }
        }
        .frame(height: height)
        .scaleEffect(x: flip ? -1 : 1, y: 1)
        .accessibilityHidden(true)
    }

    private func canvas(color: Color, phase: Double?) -> some View {
        Canvas { context, size in
            let bars = MeeshyWaveBarsLaw.resample(samples: samples, width: size.width)
            let filled = MeeshyWaveBarsLaw.filledBars(count: bars.count, progress: progress)
            let slot = size.width / Double(bars.count)
            for (index, level) in bars.enumerated() {
                let beat = phase.map { Self.beat(index: index, time: $0) } ?? 1
                let barHeight = MeeshyWaveBarsLaw.height(normalized: level, maxHeight: size.height) * beat
                let rect = CGRect(x: slot * Double(index) + (slot - MeeshyWaveBarsLaw.barWidth) / 2,
                                  y: (size.height - barHeight) / 2,
                                  width: MeeshyWaveBarsLaw.barWidth, height: max(barHeight, MeeshyWaveBarsLaw.minimumBarHeight))
                let opacity = index < filled ? 1 : MeeshyWaveBarsLaw.upcomingOpacity
                context.fill(Path(roundedRect: rect, cornerRadius: MeeshyWaveBarsLaw.barWidth / 2), with: .color(color.opacity(opacity)))
            }
        }
    }

    /// Le battement d'une barre : 62 à 100 % de sa hauteur, trois phases décalées de 0,4 s.
    static func beat(index: Int, time: Double) -> Double {
        let period = 1.1
        let offset = Double(index % 3) * 0.4
        let wave = 0.5 + 0.5 * sin(2 * .pi * (time - offset) / period)
        return 0.62 + 0.38 * wave
    }
}
