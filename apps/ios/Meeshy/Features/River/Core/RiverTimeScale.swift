import Foundation

/// R-3 — **l'axe des ordonnées est le temps.** Cette règle PURE traduit les
/// rangs servis par la loi (`RiverBubble.rank` + `createdAtMs`) en une
/// échelle lisible : une UNITÉ choisie d'après l'amplitude RÉELLE du fil
/// (heures, jours, semaines, mois, années), des GRADUATIONS aux frontières
/// de cette unité, et la correspondance dans les deux sens entre une
/// position sur la piste (fraction 0…1 du TEMPS) et un rang.
///
/// Zéro pixel, zéro horloge : le calendrier (fuseau, locale) entre en
/// paramètre — `RiverTimeScaleTests` le fixe. La peau (`RiverTimeHandle`)
/// ne calcule rien, elle pose la poignée et lit ici.
nonisolated struct RiverTimeScale: Equatable {

    enum Unit: Equatable {
        case hour
        case day
        case week
        case month
        case year
    }

    struct Tick: Equatable {
        /// Premier rang qui tombe dans la période (ou après sa frontière).
        let rank: Int
        /// Position sur la piste — fraction du TEMPS, pas des rangs.
        let fraction: Double
        let label: String
    }

    /// Un rang et son instant — ce que la loi sert, rien de plus.
    struct RankTime: Equatable {
        let rank: Int
        let timeMs: Double
    }

    let unit: Unit
    let ticks: [Tick]
    let startMs: Double
    let endMs: Double
    /// Les rangs dans l'ordre — pour projeter une fraction sur un rang.
    private let ranks: [RankTime]
    private let calendar: Calendar
    private let locale: Locale

    // MARK: - Unité selon l'amplitude

    static let hourMs: Double = 60 * 60 * 1000
    static let dayMs: Double = 24 * hourMs

    /// L'unité qui GRADUE l'amplitude sans la noyer : jusqu'à un jour et
    /// demi on lit des heures ; jusqu'à trois semaines des jours ; jusqu'à
    /// quatre mois des semaines ; jusqu'à deux ans des mois ; au-delà des
    /// années.
    static func unit(forSpanMs span: Double) -> Unit {
        switch span {
        case ..<(36 * hourMs): return .hour
        case ..<(21 * dayMs): return .day
        case ..<(120 * dayMs): return .week
        case ..<(730 * dayMs): return .month
        default: return .year
        }
    }

    // MARK: - Résolution

    /// `nil` quand il n'y a rien à graduer : moins de deux rangs, ou un fil
    /// écrit au même instant.
    static func resolve(ranks input: [RankTime], calendar: Calendar, locale: Locale = .current) -> RiverTimeScale? {
        let ranks = input.sorted { $0.rank < $1.rank }
        guard let first = ranks.first, let last = ranks.last, last.timeMs > first.timeMs else { return nil }
        let unit = unit(forSpanMs: last.timeMs - first.timeMs)
        let scale = RiverTimeScale(
            unit: unit, ticks: [], startMs: first.timeMs, endMs: last.timeMs,
            ranks: ranks, calendar: calendar, locale: locale
        )
        return RiverTimeScale(
            unit: unit, ticks: scale.boundaryTicks(), startMs: first.timeMs, endMs: last.timeMs,
            ranks: ranks, calendar: calendar, locale: locale
        )
    }

    private var spanMs: Double { endMs - startMs }

    /// Fraction (0…1) de la piste où vit un rang — linéaire dans le TEMPS.
    func fraction(ofRank rank: Int) -> Double {
        guard spanMs > 0, let entry = ranks.first(where: { $0.rank == rank }) ?? nearest(rank) else { return 0 }
        return min(1, max(0, (entry.timeMs - startMs) / spanMs))
    }

    /// Le rang qu'on rejoint en posant la poignée à `fraction` : le premier
    /// rang dont l'instant atteint celui de la piste — le dernier si la
    /// poignée dépasse tout.
    func rank(atFraction fraction: Double) -> Int {
        let target = startMs + min(1, max(0, fraction)) * spanMs
        return ranks.first(where: { $0.timeMs >= target })?.rank ?? ranks.last?.rank ?? 0
    }

    /// Le libellé de l'instant sous la poignée, dans l'unité de l'échelle.
    func label(atFraction fraction: Double) -> String {
        label(forMs: startMs + min(1, max(0, fraction)) * spanMs)
    }

    // MARK: - Graduations aux frontières d'unité

    /// Jamais plus de `maxTicks` : au-delà, une graduation sur N — la piste
    /// reste lisible, la poignée garde toute la finesse du temps.
    static let maxTicks = 8

    private func boundaryTicks() -> [Tick] {
        var ticks: [Tick] = []
        var cursorMs = startMs
        let calendarComponent = component
        let stepLimit = 10_000
        var steps = 0
        while cursorMs <= endMs, steps < stepLimit {
            steps += 1
            let date = Date(timeIntervalSince1970: cursorMs / 1000)
            guard let interval = calendar.dateInterval(of: calendarComponent, for: date) else { break }
            let boundaryMs = interval.end.timeIntervalSince1970 * 1000
            guard boundaryMs <= endMs else { break }
            let rank = rank(atFraction: (boundaryMs - startMs) / spanMs)
            ticks.append(Tick(rank: rank, fraction: (boundaryMs - startMs) / spanMs, label: label(forMs: boundaryMs)))
            cursorMs = boundaryMs
        }
        guard ticks.count > Self.maxTicks else { return ticks }
        let every = Int((Double(ticks.count) / Double(Self.maxTicks)).rounded(.up))
        return ticks.enumerated().filter { $0.offset % every == 0 }.map(\.element)
    }

    private var component: Calendar.Component {
        switch unit {
        case .hour: return .hour
        case .day: return .day
        case .week: return .weekOfYear
        case .month: return .month
        case .year: return .year
        }
    }

    private func label(forMs ms: Double) -> String {
        let date = Date(timeIntervalSince1970: ms / 1000)
        var style: Date.FormatStyle
        switch unit {
        case .hour: style = Date.FormatStyle().hour(.twoDigits(amPM: .omitted)).minute(.twoDigits)
        case .day, .week: style = Date.FormatStyle().day().month(.abbreviated)
        case .month: style = Date.FormatStyle().month(.abbreviated).year()
        case .year: style = Date.FormatStyle().year()
        }
        style.calendar = calendar
        style.timeZone = calendar.timeZone
        style.locale = locale
        return date.formatted(style)
    }

    private func nearest(_ rank: Int) -> RankTime? {
        ranks.min { abs($0.rank - rank) < abs($1.rank - rank) }
    }
}

/// Cotes de PEAU de la poignée du temps — propres à iOS, hors du JSON
/// partagé (aucun miroir web de la poignée à ce jour ; même précédent que
/// `FocalMetrics.FocusChip`, nommé en `Core` sans revendiquer de token).
nonisolated enum RiverTimeHandleMetrics {
    static let trackWidth: CGFloat = 3
    static let trackInset: CGFloat = 6
    static let handleWidth: CGFloat = 30
    static let handleHeight: CGFloat = 44
    static let tickLength: CGFloat = 8
    static let tickLabelSize: CGFloat = 10
    static let labelSize: CGFloat = 13
    /// La poignée s'efface après ce silence de défilement.
    static let restDelay: TimeInterval = 1.4
}
