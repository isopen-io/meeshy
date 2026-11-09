import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// Ce que le bouton talkie de l'en-tête publie à la bande (#17310) : la voix en cours et les couleurs de la
/// conversation, déjà résolues depuis son `accentColor`.
nonisolated struct TalkieHeaderLive: Equatable, Sendable {
    let voice: TalkieHeaderVoice
    let accent: Color
    let secondary: Color

    static let rest = TalkieHeaderLive(voice: .none, accent: .clear, secondary: .clear)

    var chrome: ConversationHeaderTalkieChrome { .resolve(voice: voice) }
}

/// Remonte la voix du talkie jusqu'à la bande d'en-tête ; une voix en cours l'emporte sur le repos.
nonisolated struct TalkieHeaderLiveKey: PreferenceKey {
    static let defaultValue = TalkieHeaderLive.rest

    static func reduce(value: inout TalkieHeaderLive, nextValue: () -> TalkieHeaderLive) {
        let next = nextValue()
        if next.voice != .none { value = next }
    }
}

/// Le talkie élargi sur toute la barre d'en-tête (#17310) : le dégradé de la conversation et une onde qui suit le
/// niveau de la voix en direct. Il ne prend aucun toucher : le doigt qui tient le bouton dessous reste le sien, et
/// le relâcher termine. VoiceOver garde le bouton, dont la valeur dit la voix en cours ; la barre s'annonce.
struct TalkieHeaderLiveBar: View {
    let live: TalkieHeaderLive

    private var meter: any TalkieLevelReading {
        live.voice == .incoming ? TalkieLevelMeter.incoming : TalkieLevelMeter.outgoing
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            Image(systemName: live.voice == .incoming ? "speaker.wave.2.fill" : "mic.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundStyle(Color.white)
                .accessibilityHidden(true)
            TalkieHeaderWave(meter: meter, color: .white)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xs)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(
            Capsule().fill(LinearGradient(colors: [live.accent, live.secondary], startPoint: .leading, endPoint: .trailing))
        )
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { announce(live.voice) }
        .adaptiveOnChange(of: live.voice) { _, voice in announce(voice) }
    }

    /// La voix qui arrive s'annonce déjà par l'indicateur de réception ; celle qui part s'annonce ici.
    private func announce(_ voice: TalkieHeaderVoice) {
        guard voice == .outgoing else { return }
        UIAccessibility.post(notification: .announcement, argument: TalkieHeaderWording.live)
    }
}

enum TalkieHeaderWording {
    static var live: String {
        String(localized: "talkie.header.live", defaultValue: "Talkie en cours", bundle: .main)
    }
}

/// L'onde seule se redessine à chaque image (60/120 Hz) : elle lit le compteur sans rien publier, l'en-tête ne se
/// re-rend pas. Avec Réduire les animations, elle suit la voix à 10 Hz.
struct TalkieHeaderWave: View {
    let meter: any TalkieLevelReading
    let color: Color

    @State private var trail = TalkieWaveTrailBox()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        TimelineView(.animation(minimumInterval: reduceMotion ? 0.1 : nil, paused: false)) { context in
            let levels = trail.advance(to: context.date, level: meter.level)
            Canvas { graphics, size in
                Self.draw(levels, color: color, in: &graphics, size: size)
            }
        }
        .accessibilityHidden(true)
    }

    nonisolated private static let barWidth: CGFloat = 3
    nonisolated private static let gap: CGFloat = 3

    nonisolated private static func draw(_ levels: [Float], color: Color, in graphics: inout GraphicsContext, size: CGSize) {
        let count = TalkieWaveLaw.barCount(width: size.width, barWidth: barWidth, gap: gap)
        let heights = TalkieWaveLaw.barHeights(levels: levels, barCount: count, minHeight: barWidth, maxHeight: size.height)
        let span = CGFloat(count) * barWidth + CGFloat(count - 1) * gap
        let origin = max(size.width - span, 0)
        for (index, height) in heights.enumerated() {
            let x = origin + CGFloat(index) * (barWidth + gap)
            let bar = CGRect(x: x, y: (size.height - height) / 2, width: barWidth, height: height)
            graphics.fill(Path(roundedRect: bar, cornerRadius: barWidth / 2), with: .color(color))
        }
    }
}

/// La traîne de l'onde, gardée hors de l'état observé : l'avancer à chaque image ne re-rend rien d'autre.
final class TalkieWaveTrailBox {
    private var trail = TalkieWaveTrail()

    nonisolated deinit {}

    func advance(to date: Date, level: Float) -> [Float] {
        trail.advance(to: date, level: level)
        return trail.levels
    }
}
