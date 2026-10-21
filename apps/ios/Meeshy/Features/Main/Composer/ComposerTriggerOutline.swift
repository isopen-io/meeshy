import SwiftUI
import MeeshyUI

/// **Le cadre de la case choisie se pose AUTOUR du flux, jamais dessus**
/// (#10309, directive porteur 2026-10-12).
///
/// Le contour était tracé à l'INTÉRIEUR de la miniature (`strokeBorder`) : trois
/// points du direct passaient sous le trait, et la miniature qui déclenche
/// montrait moins que ce qu'elle filme. Il se pose désormais à l'extérieur, à
/// `gap` du bord, ses coins suivant ceux de la case.
///
/// **La prise a commencé ⇒ le cadre rougit et bat** : son opacité monte et
/// descend en fondu, sans jamais s'éteindre — un cadre qui disparaît ne dirait
/// plus « ça enregistre ». Réduire les animations le garde rouge et plein.
nonisolated enum ComposerTriggerOutline {

    static let lineWidth: CGFloat = 3
    /// L'écart entre le bord du flux et le trait.
    static let gap: CGFloat = 2
    /// Ce que le cadre déborde de la case, de chaque côté.
    static var outset: CGFloat { lineWidth + gap }
    /// La durée d'un battement complet — rouge plein, fondu, rouge plein.
    static let period: TimeInterval = 1.2
    /// L'opacité la plus faible du battement.
    static let faintest: Double = 0.25

    enum Tint: Equatable, Sendable {
        case idle
        case recording
    }

    static func tint(recording: Bool) -> Tint {
        recording ? .recording : .idle
    }

    /// Le rayon du cadre : celui de la case, agrandi de ce qu'il déborde — les
    /// deux courbes restent parallèles.
    static func cornerRadius(inner: CGFloat) -> CGFloat {
        inner + outset
    }

    static func pulses(recording: Bool, reduceMotion: Bool) -> Bool {
        recording && !reduceMotion
    }

    /// L'opacité à `elapsed` secondes du début de la prise : pleine au départ,
    /// au plus faible à mi-période, jamais nulle.
    static func opacity(elapsed: TimeInterval, pulses: Bool) -> Double {
        guard pulses else { return 1 }
        let phase = (1 + cos(2 * Double.pi * elapsed / period)) / 2
        return faintest + (1 - faintest) * phase
    }
}

/// Le cadre, posé hors de la case qu'il entoure.
struct ComposerTriggerOutlineStyle: ViewModifier {
    let recording: Bool
    var shown = true
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var startedAt = Date()

    func body(content: Content) -> some View {
        content.overlay {
            if shown { outline }
        }
    }

    private var outline: some View {
        let bat = ComposerTriggerOutline.pulses(recording: recording, reduceMotion: reduceMotion)
        return TimelineView(.animation(paused: !bat)) { horloge in
            RoundedRectangle(cornerRadius: ComposerTriggerOutline.cornerRadius(inner: MeeshyRadius.sm),
                             style: .continuous)
                .strokeBorder(color, lineWidth: ComposerTriggerOutline.lineWidth)
                .opacity(ComposerTriggerOutline.opacity(elapsed: horloge.date.timeIntervalSince(startedAt),
                                                         pulses: bat))
        }
        .padding(-ComposerTriggerOutline.outset)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
        .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: recording)
        .adaptiveOnChange(of: recording) { _, enregistre in
            if enregistre { startedAt = Date() }
        }
    }

    private var color: Color {
        switch ComposerTriggerOutline.tint(recording: recording) {
        case .idle: return .white
        case .recording: return MeeshyColors.error
        }
    }
}
