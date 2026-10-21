import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Le cadran d'un vocal : le spectre en cercle, et son curseur (#10568)

/// **Ce que le cadran décide, sans vue** : où le doigt vise, et comment le
/// curseur le suit.
nonisolated enum AudioFullscreenDialRule {

    /// L'épaisseur de l'anneau autour du portrait : l'écart, les barres, et la
    /// place du curseur. C'est aussi la bande où le doigt saisit le curseur.
    static let band: CGFloat = 40
    /// L'écart entre le portrait et le pied des barres.
    static let gap: CGFloat = 6
    /// La longueur d'une barre à pleine amplitude.
    static let barLength: CGFloat = 24
    static let barCount = 72

    /// La fraction de l'écoute que vise `point` : l'angle depuis le HAUT du
    /// cadran, dans le sens des aiguilles — midi vaut 0, trois heures 0,25.
    static func fraction(at point: CGPoint, in size: CGSize) -> Double {
        let dx = Double(point.x - size.width / 2)
        let dy = Double(point.y - size.height / 2)
        guard dx != 0 || dy != 0 else { return 0 }
        let turn = atan2(dx, -dy) / (2 * .pi)
        return turn < 0 ? turn + 1 : turn
    }

    /// **Le curseur ne saute pas par-dessus midi.** Passer de la fin au début
    /// en franchissant le haut du cadran relancerait le vocal sous le doigt :
    /// le curseur bute sur la fin (ou sur le début) tant qu'on ne revient pas.
    static func scrubbed(from previous: Double, to raw: Double) -> Double {
        if previous > 0.75, raw < 0.25 { return 1 }
        if previous < 0.25, raw > 0.75 { return 0 }
        return raw
    }

    /// Ramène `samples` à `count` barres : le PIC de chaque paquet, pour qu'une
    /// attaque brève reste visible. Moins d'échantillons que de barres ⇒ chaque
    /// barre lit l'échantillon qui la couvre.
    static func resample(_ samples: [Float], to count: Int) -> [Float] {
        guard !samples.isEmpty, count > 0 else { return [] }
        guard samples.count != count else { return samples }
        return (0..<count).map { bar in
            let start = bar * samples.count / count
            let end = max(start + 1, (bar + 1) * samples.count / count)
            return samples[start..<min(end, samples.count)].max() ?? 0
        }
    }

    /// Motif de repli quand l'analyse n'a rien rendu — déterministe par index,
    /// pour qu'une même piste peigne toujours la même silhouette.
    static func fallbackHeight(index: Int) -> CGFloat {
        let seed = Double(index * 7 + 3)
        let value = 0.2 + abs(sin(seed) * 0.4 + cos(seed * 0.5) * 0.3)
        return CGFloat(min(1.0, value))
    }

    /// Le souffle d'une barre pendant l'écoute : une onde qui tourne autour du
    /// cadran, plus ample près du curseur. `1` à l'arrêt.
    static func pulse(bar: Int, progress: Double, time: TimeInterval, isPlaying: Bool) -> CGFloat {
        guard isPlaying else { return 1 }
        let position = Double(bar) / Double(barCount)
        let distance = min(abs(position - progress), 1 - abs(position - progress))
        let nearCursor = max(0, 1 - distance * 8)
        let wave = sin(time * 5 + Double(bar) * 0.55)
        return CGFloat(1 + wave * (0.12 + 0.22 * nearCursor))
    }
}

/// **Le spectre du vocal, en cercle autour de celui qui parle** (directive
/// porteur du 2026-10-13).
///
/// La bande d'onde horizontale occupait le milieu de l'écran et disputait le
/// balayage des pages. Le spectre fait désormais le tour du portrait : les
/// barres franchies prennent l'accent, elles respirent pendant l'écoute, et un
/// point-curseur dit où l'on en est — on le saisit pour reculer ou avancer.
/// Les paroles prennent toute la partie basse.
///
/// Le geste est PROGRESSIF (directive du 2026-08-30) : `onChanged` déplace
/// réellement la lecture, relâcher ne fait que conclure. Seul l'ANNEAU capte le
/// doigt — le portrait, dessous, garde son toucher (le profil), et tout le
/// reste de l'écran tourne les pages.
struct AudioFullscreenDial: View {
    let samples: [Float]
    let progress: Double
    let isPlaying: Bool
    let portraitDiameter: CGFloat
    let accent: Color
    let trackColor: Color
    let cursorColor: Color
    let onSeek: (Double) -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var scrubbing: Double?

    private var side: CGFloat { portraitDiameter + AudioFullscreenDialRule.band * 2 }
    private var shown: Double { scrubbing ?? progress }

    var body: some View {
        let heights = AudioFullscreenDialRule.resample(samples, to: AudioFullscreenDialRule.barCount)
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !isPlaying || reduceMotion)) { timeline in
            Canvas { context, size in
                draw(in: &context, size: size, heights: heights,
                     time: timeline.date.timeIntervalSinceReferenceDate)
            }
        }
        .frame(width: side, height: side)
        .contentShape(Ring(inner: portraitDiameter / 2), eoFill: true)
        .gesture(scrubGesture)
        .accessibilityElement()
        .accessibilityLabel(String(localized: "audio.fullscreen.dial", defaultValue: "Position dans le vocal", bundle: .main))
        .accessibilityValue(Text(shown, format: .percent.precision(.fractionLength(0))))
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: onSeek(min(1, progress + 0.05))
            case .decrement: onSeek(max(0, progress - 0.05))
            @unknown default: break
            }
        }
    }

    private func draw(in context: inout GraphicsContext, size: CGSize, heights: [Float], time: TimeInterval) {
        let center = CGPoint(x: size.width / 2, y: size.height / 2)
        let foot = portraitDiameter / 2 + AudioFullscreenDialRule.gap
        let count = AudioFullscreenDialRule.barCount
        let animated = isPlaying && !reduceMotion
        for bar in 0..<count {
            let sample = heights.isEmpty ? AudioFullscreenDialRule.fallbackHeight(index: bar) : CGFloat(heights[bar])
            let pulse = AudioFullscreenDialRule.pulse(bar: bar, progress: shown, time: time, isPlaying: animated)
            let length = max(3, min(AudioFullscreenDialRule.barLength * 1.25,
                                    sample * AudioFullscreenDialRule.barLength * pulse))
            var turned = context
            turned.translateBy(x: center.x, y: center.y)
            turned.rotate(by: .radians(Double(bar) / Double(count) * 2 * .pi))
            let rect = CGRect(x: -1.5, y: -(foot + length), width: 3, height: length)
            let played = shown > 0 && Double(bar) / Double(count) <= shown
            turned.fill(Path(roundedRect: rect, cornerRadius: 1.5), with: .color(played ? accent : trackColor))
        }
        let orbit = foot + AudioFullscreenDialRule.barLength / 2
        let angle = shown * 2 * .pi
        let cursor = CGPoint(x: center.x + CGFloat(sin(angle)) * orbit, y: center.y - CGFloat(cos(angle)) * orbit)
        let radius: CGFloat = scrubbing == nil ? 8 : 11
        let disc = CGRect(x: cursor.x - radius, y: cursor.y - radius, width: radius * 2, height: radius * 2)
        context.fill(Path(ellipseIn: disc.insetBy(dx: -3, dy: -3)), with: .color(accent))
        context.fill(Path(ellipseIn: disc), with: .color(cursorColor))
    }

    private var scrubGesture: some Gesture {
        DragGesture(minimumDistance: 0)
            .onChanged { value in
                let raw = AudioFullscreenDialRule.fraction(at: value.location, in: CGSize(width: side, height: side))
                let next = AudioFullscreenDialRule.scrubbed(from: scrubbing ?? raw, to: raw)
                scrubbing = next
                onSeek(next)
            }
            .onEnded { _ in
                scrubbing = nil
                HapticFeedback.light()
            }
    }

    /// L'anneau, seul à capter le doigt : le disque du portrait reste à lui.
    nonisolated private struct Ring: Shape {
        let inner: CGFloat

        func path(in rect: CGRect) -> Path {
            var path = Path(ellipseIn: rect)
            let hole = CGRect(x: rect.midX - inner, y: rect.midY - inner, width: inner * 2, height: inner * 2)
            path.addEllipse(in: hole)
            return path
        }
    }
}
