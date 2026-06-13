import Foundation

/// One rung of the compact relative-time ladder used by post, reel and comment
/// timestamps. Carries the numeric value but no localized text, so the view
/// layer owns the wording and the absolute-date formatting.
public enum RelativeTimeUnit: Equatable, Sendable {
    case now
    case seconds(Int)
    case minutes(Int)
    case hours(Int)
    case days(Int)
    case weeks(Int)
    case months(Int)
    case date(Date)
}

/// Pure, locale-agnostic classification of how long ago a timestamp occurred.
///
/// The thresholds live here as the single source of truth; rendering (localized
/// strings, absolute date formatting) stays in the UI layer so the SDK holds no
/// presentation strings. Ladder, matching the product spec:
/// `now` (under 30 s) → seconds (under a minute) → minutes → hours → days
/// (under a week) → weeks (under a month) → months (under three months) →
/// absolute `date` (three months or older). Approximations: a month is 30 days,
/// three months is 90 days.
public enum RelativeTime {
    /// Classifies `date` relative to `reference` (default: now). Future or
    /// clock-skewed timestamps (a negative interval) collapse to `.now` rather
    /// than producing nonsensical negative counts.
    public static func classify(_ date: Date, reference: Date = Date()) -> RelativeTimeUnit {
        let seconds = Int(reference.timeIntervalSince(date))
        if seconds < 30 { return .now }
        if seconds < 60 { return .seconds(seconds) }
        if seconds < 3_600 { return .minutes(seconds / 60) }
        if seconds < 86_400 { return .hours(seconds / 3_600) }
        let days = seconds / 86_400
        if days < 7 { return .days(days) }
        if days < 30 { return .weeks(days / 7) }
        if days < 90 { return .months(days / 30) }
        return .date(date)
    }
}
