import SwiftUI
import MeeshySDK

// MARK: - La loi de la puce

/// Ce que dit la puce posée au début de la forme d'onde (#18421) : au repos la
/// durée totale ; une fois la lecture partie, cette durée DÉCOMPTE et le pourcentage lu la suit, séparé d'une
/// simple espace (« 0:07 21 % »). Aucun compteur de temps lu. Une loi pure : la
/// vue ne compose aucun texte elle-même.
nonisolated public enum AudioWaveformChipLaw {
    public static let separator = " "

    /// `nil` quand la durée est inconnue : la puce ne dit pas « 0:00 ».
    public static func durationLabel(total: TimeInterval, locale: Locale = .current) -> String? {
        guard total.isFinite, total > 0 else { return nil }
        return MediaFormat.duration(total, locale: locale)
    }

    /// Le temps qui RESTE, puis le pourcentage borné à 0…100 et formaté par la
    /// locale (« 45 % » en français, « 45% » en anglais), une espace entre eux.
    public static func countdownLabel(total: TimeInterval, elapsed: TimeInterval, fraction: Double, locale: Locale = .current) -> String {
        let percent = Double(percentage(fraction)) / 100
        let formatted = percent.formatted(.percent.precision(.fractionLength(0)).locale(locale))
        return MediaFormat.duration(remaining(total: total, elapsed: elapsed), locale: locale) + separator + formatted
    }

    /// Ce qui reste à lire, jamais négatif ; une durée inconnue rend zéro.
    public static func remaining(total: TimeInterval, elapsed: TimeInterval) -> TimeInterval {
        guard total.isFinite, elapsed.isFinite else { return 0 }
        return max(0, total - max(0, elapsed))
    }

    /// La lecture a commencé dès qu'un avancement existe : c'est là que la
    /// durée se met à décompter, et elle redevient la durée totale au retour à zéro.
    public static func isCountingDown(elapsed: TimeInterval, fraction: Double) -> Bool {
        (fraction.isFinite && fraction > 0) || (elapsed.isFinite && elapsed > 0)
    }

    /// Le libellé servi : la durée au repos, le décompte et le pourcentage en lecture.
    public static func label(total: TimeInterval, elapsed: TimeInterval, fraction: Double, locale: Locale = .current) -> String? {
        guard isCountingDown(elapsed: elapsed, fraction: fraction) else {
            return durationLabel(total: total, locale: locale)
        }
        return countdownLabel(total: total, elapsed: elapsed, fraction: fraction, locale: locale)
    }

    /// Le pourcentage entier que la puce affiche et que le lecteur d'écran dit :
    /// borné à 0…100 (un infini se borne comme le reste), NaN vaut zéro.
    public static func percentage(_ fraction: Double) -> Int {
        guard !fraction.isNaN else { return 0 }
        return Int((max(0, min(1, fraction)) * 100).rounded(.down))
    }
}

// MARK: - Une puce

/// Une puce de verre (K01) posée sur un média : un libellé court, chiffres à
/// chasse fixe, teintée à l'accent quand elle dit une lecture en cours.
struct AudioWaveformChip: View, Equatable {
    let text: String
    let isEmphasized: Bool
    let isCompact: Bool
    let accent: Color

    var body: some View {
        Text(text)
            .font(MeeshyFont.relative(isCompact ? MeeshyFont.microSize : MeeshyFont.captionSize, weight: .semibold, design: .monospaced))
            .monospacedDigit()
            .foregroundStyle(MeeshyColors.onMedia)
            .lineLimit(1)
            .fixedSize()
            .padding(.horizontal, MeeshySpacing.xsPlus)
            .padding(.vertical, MeeshySpacing.xxs)
            .meeshyGlass(in: Capsule(), tone: .deep, density: .dense, tint: isEmphasized ? accent : nil)
            .contentTransition(.numericText())
    }
}

// MARK: - La puce sur l'onde

/// La puce de la forme d'onde, au bord de début : la durée au repos, le
/// décompte suivi du pourcentage en lecture. Elle ouvre le plein écran quand
/// l'hôte le permet — la même affordance que l'ancienne pastille de
/// pourcentage ; sans hôte, elle ne prend aucun doigt (le scrub passe dessous).
struct AudioWaveformChipsOverlay: View, Equatable {
    let total: TimeInterval
    let elapsed: TimeInterval
    let fraction: Double
    let isLive: Bool
    let isCompact: Bool
    let accent: Color
    let onProgressTap: (() -> Void)?

    static func == (lhs: AudioWaveformChipsOverlay, rhs: AudioWaveformChipsOverlay) -> Bool {
        lhs.total == rhs.total && lhs.elapsed == rhs.elapsed && lhs.fraction == rhs.fraction
            && lhs.isLive == rhs.isLive && lhs.isCompact == rhs.isCompact && lhs.accent == rhs.accent
            && (lhs.onProgressTap == nil) == (rhs.onProgressTap == nil)
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.xs) {
            if let text = AudioWaveformChipLaw.label(total: total, elapsed: elapsed, fraction: fraction) {
                chip(text)
            }
            Spacer(minLength: 0)
        }
    }

    @ViewBuilder
    private func chip(_ text: String) -> some View {
        let chip = AudioWaveformChip(text: text, isEmphasized: isLive, isCompact: isCompact, accent: accent)
        if let onProgressTap {
            let percent = AudioWaveformChipLaw.percentage(fraction)
            Button(action: onProgressTap) { chip }
                .buttonStyle(.plain)
                .accessibilityLabel(String(localized: "media.audio.open.fullscreen",
                                           defaultValue: "Ouvrir en plein écran, lecture \(percent)%",
                                           bundle: .module))
                .accessibilityHint(String(localized: "media.audio.open.fullscreen.hint",
                                          defaultValue: "Affiche la vue plein écran avec les options de sauvegarde",
                                          bundle: .module))
        } else {
            chip
                .accessibilityLabel(text)
                .allowsHitTesting(false)
        }
    }
}
