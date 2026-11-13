import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// Ce que le bouton talkie de l'en-tête publie à la bande (#17310) : la voix en cours, ce qu'elle devient (direct ou
/// gardée pour plus tard) et les couleurs de la conversation, déjà résolues depuis son `accentColor`.
nonisolated struct TalkieHeaderLive: Equatable, Sendable {
    let voice: TalkieHeaderVoice
    let delivery: TalkieHeaderDelivery
    let accent: Color
    let secondary: Color

    static let rest = TalkieHeaderLive(voice: .none, delivery: .live, accent: .clear, secondary: .clear)

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

/// Le talkie élargi sur toute la barre d'en-tête (#17310), et ce qu'il dit AVANT la fin :
/// - **en direct**, un spectre miroir lumineux suit la voix à l'instant, sous une pastille « En direct » qui pulse ;
/// - **hors ligne** (réveil, ou repli en message vocal), une bande d'enregistrement défile vers une tête de lecture,
///   un point rouge clignote et le chrono tourne.
/// Il ne prend aucun toucher : le doigt qui tient le bouton dessous reste le sien, et le relâcher termine.
struct TalkieHeaderLiveBar: View {
    let live: TalkieHeaderLive

    @State private var startedAt = Date()

    private var meter: any TalkieLevelReading {
        live.voice == .incoming ? TalkieLevelMeter.incoming : TalkieLevelMeter.outgoing
    }

    private var realtime: Bool { live.delivery.isRealtime }

    var body: some View {
        HStack(spacing: MeeshySpacing.sm) {
            TalkieDeliveryBadge(delivery: live.delivery, voice: live.voice)
            ZStack {
                if realtime {
                    TalkieLiveSpectrum(meter: meter)
                        .transition(.opacity.combined(with: .scale(scale: 0.6)))
                } else {
                    TalkieRecordingTape(meter: meter)
                        .transition(.opacity.combined(with: .move(edge: .trailing)))
                }
            }
            .frame(maxWidth: .infinity)
            TimelineView(.periodic(from: startedAt, by: 1)) { context in
                Text(TalkieHeaderWording.elapsed(context.date.timeIntervalSince(startedAt)))
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(Color.white.opacity(0.92))
                    .lineLimit(1)
                    .fixedSize()
            }
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.xs)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TalkieBarBackground(accent: live.accent, secondary: live.secondary, realtime: realtime))
        .shadow(color: live.accent.opacity(realtime ? 0.55 : 0.2), radius: realtime ? 10 : 4)
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: live.delivery)
        .dynamicTypeSize(...DynamicTypeSize.accessibility1)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .onAppear { announce() }
        .adaptiveOnChange(of: live.delivery) { _, _ in announce() }
    }

    /// La voix qui arrive s'annonce déjà par l'indicateur de réception ; celle qui part dit ici ce qu'elle devient.
    private func announce() {
        guard live.voice == .outgoing else { return }
        UIAccessibility.post(notification: .announcement, argument: TalkieHeaderWording.announcement(live.delivery))
    }
}

/// Le fond de la barre : le dégradé de la conversation, un reflet en haut ; hors ligne, il s'assombrit et prend un
/// liseré pointillé — l'œil voit que la voix ne passe pas en direct.
private struct TalkieBarBackground: View {
    let accent: Color
    let secondary: Color
    let realtime: Bool

    var body: some View {
        ZStack {
            Capsule().fill(LinearGradient(colors: [accent, secondary], startPoint: .leading, endPoint: .trailing))
            Capsule().fill(Color.black.opacity(realtime ? 0 : 0.38))
            Capsule().fill(LinearGradient(colors: [Color.white.opacity(0.28), .clear], startPoint: .top, endPoint: .center))
            if realtime {
                Capsule().strokeBorder(Color.white.opacity(0.4), lineWidth: 1)
            } else {
                Capsule().strokeBorder(Color.white.opacity(0.45), style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            }
        }
    }
}

/// La pastille du mode : un point blanc qui pulse « En direct », un point rouge qui clignote hors ligne.
private struct TalkieDeliveryBadge: View {
    let delivery: TalkieHeaderDelivery
    let voice: TalkieHeaderVoice

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            TimelineView(.animation(minimumInterval: 1.0 / 30, paused: reduceMotion)) { context in
                dot(at: context.date.timeIntervalSinceReferenceDate)
            }
            .frame(width: 14, height: 14)
            Image(systemName: icon)
                .font(.caption2.weight(.bold))
            Text(TalkieHeaderWording.badge(delivery))
                .font(.caption2.weight(.heavy))
                .textCase(.uppercase)
                .tracking(0.6)
                .lineLimit(1)
                .fixedSize()
        }
        .foregroundStyle(Color.white)
        .padding(.horizontal, MeeshySpacing.sm)
        .padding(.vertical, 3)
        .background(Capsule().fill(Color.white.opacity(delivery.isRealtime ? 0.22 : 0.14)))
    }

    private var icon: String {
        switch delivery {
        case .live: voice == .incoming ? "speaker.wave.2.fill" : "mic.fill"
        case .relayed: "moon.zzz.fill"
        case .recorded: "waveform.badge.mic"
        }
    }

    @ViewBuilder
    private func dot(at time: TimeInterval) -> some View {
        if delivery.isRealtime {
            let pulse = reduceMotion ? 0.5 : (sin(time * 2 * .pi / 1.2) + 1) / 2
            ZStack {
                Circle().fill(Color.white.opacity(0.35 * (1 - pulse))).scaleEffect(1 + 0.8 * pulse)
                Circle().fill(Color.white).frame(width: 7, height: 7)
            }
        } else {
            let blink = reduceMotion ? 1 : 0.35 + 0.65 * (sin(time * 2 * .pi) + 1) / 2
            Circle().fill(MeeshyColors.errorStrong).frame(width: 8, height: 8).opacity(blink)
                .overlay(Circle().strokeBorder(Color.white.opacity(0.8), lineWidth: 1).frame(width: 10, height: 10))
        }
    }
}

/// Le spectre du direct : ce qui se dit, maintenant, centré et en miroir. Lit le compteur à chaque image sans rien
/// publier ; avec Réduire les animations, il suit la voix à 10 Hz sans houle.
private struct TalkieLiveSpectrum: View {
    let meter: any TalkieLevelReading

    @State private var smoother = TalkieLevelSmootherBox()
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    nonisolated private static let barWidth: CGFloat = 3.5
    nonisolated private static let gap: CGFloat = 3

    var body: some View {
        TimelineView(.animation(minimumInterval: reduceMotion ? 0.1 : nil, paused: false)) { context in
            let level = smoother.advance(level: meter.level)
            let time = reduceMotion ? 0 : context.date.timeIntervalSinceReferenceDate
            Canvas { graphics, size in
                Self.draw(level: level, time: time, in: &graphics, size: size)
            }
        }
        .accessibilityHidden(true)
    }

    nonisolated private static func draw(level: Float, time: TimeInterval, in graphics: inout GraphicsContext, size: CGSize) {
        let count = TalkieWaveLaw.barCount(width: size.width, barWidth: barWidth, gap: gap)
        let heights = TalkieWaveLaw.mirroredBarHeights(level: level, barCount: count, time: time, minHeight: barWidth, maxHeight: size.height)
        let span = CGFloat(count) * barWidth + CGFloat(max(count - 1, 0)) * gap
        let origin = max((size.width - span) / 2, 0)
        for (index, height) in heights.enumerated() {
            let x = origin + CGFloat(index) * (barWidth + gap)
            let bar = CGRect(x: x, y: (size.height - height) / 2, width: barWidth, height: height)
            let strength = size.height > barWidth ? (height - barWidth) / (size.height - barWidth) : 0
            graphics.fill(Path(roundedRect: bar, cornerRadius: barWidth / 2), with: .color(.white.opacity(0.6 + 0.4 * strength)))
        }
    }
}

/// La bande d'enregistrement hors ligne : la voix défile vers une tête de lecture rouge, l'histoire s'estompe à gauche.
private struct TalkieRecordingTape: View {
    let meter: any TalkieLevelReading

    var body: some View {
        TalkieHeaderWave(meter: meter, color: .white)
            .mask(LinearGradient(colors: [.clear, .white, .white], startPoint: .leading, endPoint: .trailing))
            .padding(.trailing, MeeshySpacing.xs)
            .overlay(alignment: .trailing) {
                Capsule().fill(MeeshyColors.errorStrong).frame(width: 2).padding(.vertical, 4)
            }
    }
}

/// Le niveau lissé du spectre, gardé hors de l'état observé.
final class TalkieLevelSmootherBox {
    private var value: Float = 0

    nonisolated deinit {}

    func advance(level: Float) -> Float {
        value = TalkieWaveLaw.smoothed(previous: value, target: level)
        return value
    }
}

nonisolated enum TalkieHeaderWording {
    static var live: String {
        String(localized: "talkie.header.live", defaultValue: "Talkie en cours", bundle: .main)
    }

    static func badge(_ delivery: TalkieHeaderDelivery) -> String {
        switch delivery {
        case .live: String(localized: "talkie.header.badge.live", defaultValue: "En direct", bundle: .main)
        case .relayed: String(localized: "talkie.header.badge.relayed", defaultValue: "Hors ligne", bundle: .main)
        case .recorded: String(localized: "talkie.header.badge.recorded", defaultValue: "Enregistré", bundle: .main)
        }
    }

    static func announcement(_ delivery: TalkieHeaderDelivery) -> String {
        switch delivery {
        case .live:
            String(localized: "talkie.header.announce.live", defaultValue: "Talkie en direct : votre voix est entendue maintenant", bundle: .main)
        case .relayed:
            String(localized: "talkie.header.announce.relayed", defaultValue: "Hors ligne : votre voix lui sera rejouée à son retour", bundle: .main)
        case .recorded:
            String(localized: "talkie.header.announce.recorded", defaultValue: "Le talkie ne passe pas : votre voix part en message vocal", bundle: .main)
        }
    }

    static func elapsed(_ seconds: TimeInterval) -> String {
        MediaFormat.duration(seconds, style: .clock)
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
