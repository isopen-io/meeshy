import Foundation

/// Canonical relative-time formatting for Meeshy UI chrome — the single source
/// of truth that replaces the divergent ad-hoc formatters that used to live in
/// the feed, comments, stories, notifications, contacts, participants, friend
/// requests and message detail.
///
/// Two registered styles (product decision 2026-06-13):
/// - `.short` — dense lists (feed, comments, stories, notifications):
///   `À l'instant` / `5m` / `2h` / `3j` / `1sem`
/// - `.long` — detail surfaces (contacts, participants, friend requests,
///   message detail): `À l'instant` / `il y a 5 min` / `il y a 2 h` / `hier` /
///   `il y a 3 j` / `4 nov.`
///
/// French only: the SDK's `defaultLocalization` and the app's content fallback.
/// The previous `time.*` keys were never translated (source-only in the
/// xcstrings), so funneling everything through hardcoded French is not a
/// localization regression.
///
/// Pure and deterministic: `now` and `calendar` are injectable for testing.
/// Not a localized cousin of the absolute `HH:mm` message clock
/// (`TimeStringCache`) nor the day separator (`MessageDayLabel`) — those stay
/// distinct by design.
public enum RelativeTimeFormatter {
    public enum Style: Sendable {
        /// Dense lists: `5m` / `2h` / `3j` / `1sem`.
        case short
        /// Detail surfaces: `il y a 5 min` / `hier` / `4 nov.`.
        case long
    }

    public static func string(
        for date: Date,
        style: Style,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        switch style {
        case .short: return shortString(for: date, now: now)
        case .long: return longString(for: date, now: now, calendar: calendar)
        }
    }

    // MARK: - Short — "À l'instant" / "5m" / "2h" / "3j" / "1sem"

    /// Built on the SDK's `RelativeTime` classification primitive (the single
    /// source of truth for the ladder thresholds). Beyond a week the short
    /// ladder keeps counting in weeks rather than switching to an absolute date
    /// (product choice 2026-06-13).
    public static func shortString(for date: Date, now: Date = Date()) -> String {
        switch RelativeTime.classify(date, reference: now) {
        case .now: return justNow
        case .minutes(let m): return "\(m)m"
        case .hours(let h): return "\(h)h"
        case .days(let d): return "\(d)j"
        case .date: return "\(Int(now.timeIntervalSince(date)) / 604_800)sem"
        }
    }

    // MARK: - Long — "À l'instant" / "il y a 5 min" / "hier" / "4 nov."

    public static func longString(
        for date: Date,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        let seconds = Int(now.timeIntervalSince(date))
        if seconds < 60 { return justNow }
        if seconds < 3_600 { return "il y a \(seconds / 60) min" }

        let dayDelta = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: date),
            to: calendar.startOfDay(for: now)
        ).day ?? 0

        if dayDelta <= 0 { return "il y a \(seconds / 3_600) h" }
        if dayDelta == 1 { return "hier" }
        if dayDelta < 7 { return "il y a \(dayDelta) j" }
        return absoluteDate(date, now: now, calendar: calendar)
    }

    // MARK: - Absolute fallback — "4 nov." / "4 nov. 2024"

    private static func absoluteDate(_ date: Date, now: Date, calendar: Calendar) -> String {
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        return absoluteFormatters.string(
            from: date,
            includingYear: !sameYear,
            timeZone: calendar.timeZone
        )
    }

    private static let justNow = "À l'instant"
    private static let absoluteFormatters = AbsoluteDateFormatterBox()
}

/// Thread-safe `DateFormatter` box — `DateFormatter.string(from:)` is not
/// thread-safe, mirroring `TimeStringCache` in `MessageRecord.swift`. The
/// time zone is applied per call so the absolute date stays consistent with the
/// calendar used for the day-delta computation (UTC in tests, local in prod).
private final class AbsoluteDateFormatterBox: @unchecked Sendable {
    private let lock = NSLock()
    private let dayMonth: DateFormatter
    private let dayMonthYear: DateFormatter

    init() {
        let fr = Locale(identifier: "fr_FR")
        dayMonth = DateFormatter()
        dayMonth.locale = fr
        dayMonth.setLocalizedDateFormatFromTemplate("d MMM")
        dayMonthYear = DateFormatter()
        dayMonthYear.locale = fr
        dayMonthYear.setLocalizedDateFormatFromTemplate("d MMM yyyy")
    }

    func string(from date: Date, includingYear: Bool, timeZone: TimeZone) -> String {
        lock.lock()
        defer { lock.unlock() }
        let formatter = includingYear ? dayMonthYear : dayMonth
        formatter.timeZone = timeZone
        return formatter.string(from: date)
    }
}
