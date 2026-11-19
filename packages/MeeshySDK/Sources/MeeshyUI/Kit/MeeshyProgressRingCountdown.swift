import SwiftUI

/// **K09 en mode DÉCOMPTE** : le temps qui reste d'une opération à échéance (un
/// partage de position), en VALEURS. L'arc dessine la part qui RESTE, il se vide
/// donc à mesure que l'échéance approche ; un décompte sans échéance (partage
/// continu) reste plein, et l'anneau ne se retire jamais de lui-même.
///
/// - `remaining` absent : continu, plein, sans minutes.
/// - `remaining` borné à 0…`total` ; un non-nombre vaut 0 (échu).
/// - `total` absent, nul ou non-nombre : plein tant qu'il reste du temps.
/// - Les minutes s'arrondissent au-dessus : « reste 1 min » tant qu'une seconde reste.
public nonisolated struct MeeshyProgressRingCountdown: Sendable, Equatable {
    /// Le diamètre d'un décompte : 34, au bout d'une rangée de personne.
    public static let diameter: Double = 34

    /// La part qui reste, de 1 (vient de commencer, ou continu) à 0 (échu).
    public let fraction: Double
    /// Les minutes qui restent, arrondies au-dessus ; `nil` pour un partage continu.
    public let remainingMinutes: Int?
    public let isContinuous: Bool
    public let isOver: Bool

    public init(fraction: Double, remainingMinutes: Int?, isContinuous: Bool, isOver: Bool) {
        self.fraction = fraction
        self.remainingMinutes = remainingMinutes
        self.isContinuous = isContinuous
        self.isOver = isOver
    }

    public static func resolve(remaining: TimeInterval?, total: TimeInterval?) -> MeeshyProgressRingCountdown {
        guard let remaining else {
            return MeeshyProgressRingCountdown(fraction: 1, remainingMinutes: nil, isContinuous: true, isOver: false)
        }
        let knownTotal = total.flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
        let positive = remaining.isFinite ? max(remaining, 0) : 0
        let bounded = knownTotal.map { min(positive, $0) } ?? positive
        let fraction = knownTotal.map { bounded / $0 } ?? (bounded > 0 ? 1 : 0)
        return MeeshyProgressRingCountdown(
            fraction: fraction,
            remainingMinutes: Int((bounded / 60).rounded(.up)),
            isContinuous: false,
            isOver: bounded <= 0
        )
    }
}

extension MeeshyProgressRingWords {

    /// La valeur dite d'un décompte : « reste 42 min », « reste 7 h 05 »,
    /// « en continu », « terminé ».
    public static func countdownValue(_ countdown: MeeshyProgressRingCountdown,
                                      bundle: Bundle? = nil,
                                      locale: Locale = .current) -> String {
        guard let minutes = countdown.remainingMinutes else {
            return String(localized: "kit.progress_ring.countdown.continuous", defaultValue: "en continu",
                          bundle: bundle ?? .module, locale: locale)
        }
        guard minutes > 0 else {
            return String(localized: "kit.progress_ring.countdown.over", defaultValue: "terminé",
                          bundle: bundle ?? .module, locale: locale)
        }
        guard minutes >= 60 else {
            let format = String(localized: "kit.progress_ring.countdown.minutes", defaultValue: "reste %lld min",
                                bundle: bundle ?? .module, locale: locale)
            return String(format: format, locale: locale, minutes)
        }
        let format = String(localized: "kit.progress_ring.countdown.hours", defaultValue: "reste %1$lld h %2$02lld",
                            bundle: bundle ?? .module, locale: locale)
        return String(format: format, locale: locale, minutes / 60, minutes % 60)
    }
}

extension MeeshyProgressRing {

    /// Le décompte : diamètre 34, aucun chiffre, la part qui reste en arc, un
    /// glyphe au centre si l'hôte en pose un. La valeur dite est le temps qui
    /// reste, sauf si l'hôte la remplace.
    public init(countdown: MeeshyProgressRingCountdown,
                label: String?,
                valueText: String? = nil,
                tint: MeeshyProgressRingTint = .ink,
                tone: MeeshyGlassTone? = nil,
                @ViewBuilder center: () -> Center) {
        self.init(progress: countdown.fraction,
                  label: label,
                  valueText: valueText ?? MeeshyProgressRingWords.countdownValue(countdown),
                  diameter: CGFloat(MeeshyProgressRingCountdown.diameter),
                  tint: tint,
                  showsPercent: false,
                  tone: tone,
                  center: center)
    }
}

extension MeeshyProgressRing where Center == EmptyView {

    public init(countdown: MeeshyProgressRingCountdown,
                label: String?,
                valueText: String? = nil,
                tint: MeeshyProgressRingTint = .ink,
                tone: MeeshyGlassTone? = nil) {
        self.init(countdown: countdown, label: label, valueText: valueText, tint: tint, tone: tone,
                  center: { EmptyView() })
    }
}
