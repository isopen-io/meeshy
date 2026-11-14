import SwiftUI
import MeeshySDK

// MARK: - La loi des puces

/// Ce que disent les deux puces posées sur la forme d'onde (#18421) : au début
/// la durée totale, à la fin « temps lu · pourcentage ». Une loi pure : la vue
/// ne compose aucun texte elle-même.
nonisolated public enum AudioWaveformChipLaw {
    public static let separator = " · "

    /// `nil` quand la durée est inconnue : la puce ne dit pas « 0:00 ».
    public static func durationLabel(total: TimeInterval, locale: Locale = .current) -> String? {
        guard total.isFinite, total > 0 else { return nil }
        return MediaFormat.duration(total, locale: locale)
    }

    /// Le pourcentage est borné à 0…100 et formaté par la locale (« 45 % » en
    /// français, « 45% » en anglais) ; le temps lu garde la forme d'horloge.
    public static func progressLabel(elapsed: TimeInterval, fraction: Double, locale: Locale = .current) -> String {
        let percent = Double(percentage(fraction)) / 100
        let formatted = percent.formatted(.percent.precision(.fractionLength(0)).locale(locale))
        return MediaFormat.duration(elapsed, locale: locale) + separator + formatted
    }

    /// Le pourcentage entier que la puce affiche et que le lecteur d'écran dit.
    public static func percentage(_ fraction: Double) -> Int {
        guard fraction.isFinite else { return 0 }
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

// MARK: - Les deux puces sur l'onde

/// Les deux puces de la forme d'onde : la durée au bord de début, l'avancement
/// au bord de fin. La durée ne prend aucun doigt (le scrub passe dessous) ;
/// l'avancement ouvre le plein écran quand l'hôte le permet — c'est la même
/// affordance que l'ancienne pastille de pourcentage, à sa nouvelle place.
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
            if let durationText = AudioWaveformChipLaw.durationLabel(total: total) {
                AudioWaveformChip(text: durationText, isEmphasized: false, isCompact: isCompact, accent: accent)
                    .accessibilityLabel(durationText)
                    .allowsHitTesting(false)
            }
            Spacer(minLength: 0)
            progressChip
        }
    }

    private var progressText: String {
        AudioWaveformChipLaw.progressLabel(elapsed: elapsed, fraction: fraction)
    }

    @ViewBuilder
    private var progressChip: some View {
        let chip = AudioWaveformChip(text: progressText, isEmphasized: isLive, isCompact: isCompact, accent: accent)
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
                .accessibilityLabel(progressText)
                .allowsHitTesting(false)
        }
    }
}
