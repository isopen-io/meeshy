import Foundation

/// One rung of the compact relative-time ladder used by post, reel and comment
/// timestamps. Carries the numeric value but no localized text, so the view
/// layer owns the wording and the absolute-date formatting.
public enum RelativeTimeUnit: Equatable, Sendable {
    case now
    case minutes(Int)
    case hours(Int)
    case days(Int)
    case date(Date)
}

/// Pure, locale-agnostic classification of how long ago a timestamp occurred.
///
/// The thresholds live here as the single source of truth; rendering (localized
/// strings, absolute date formatting) stays in the UI layer so the SDK holds no
/// presentation strings. Ladder, matching the product spec:
/// seconds (`now`) → minutes → hours → days (under a week) → absolute `date`.
public enum RelativeTime {
    /// Classifies `date` relative to `reference` (default: now). Future or
    /// clock-skewed timestamps (a negative interval) collapse to `.now` rather
    /// than producing nonsensical negative counts.
    public static func classify(_ date: Date, reference: Date = Date()) -> RelativeTimeUnit {
        let seconds = Int(reference.timeIntervalSince(date))
        if seconds < 60 { return .now }
        if seconds < 3_600 { return .minutes(seconds / 60) }
        if seconds < 86_400 { return .hours(seconds / 3_600) }
        let days = seconds / 86_400
        if days < 7 { return .days(days) }
        return .date(date)
    }
}
