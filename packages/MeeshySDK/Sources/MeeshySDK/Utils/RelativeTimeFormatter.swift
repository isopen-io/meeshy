import Foundation

/// Canonical relative-time formatting for Meeshy UI chrome — the single source
/// of truth that replaces the divergent ad-hoc formatters that used to live in
/// the feed, comments, stories, notifications, contacts, participants, friend
/// requests and message detail.
///
/// Two registered styles (product decision 2026-06-13):
/// - `.short` — dense lists (feed, comments, stories, notifications):
///   `maintenant` / `45s` / `5 min` / `2h` / `3j` / `2sem` / `2mois`, then the
///   localized absolute date past three months.
/// - `.long` — detail surfaces (contacts, participants, friend requests,
///   message detail): `maintenant` / `il y a 45s` / `il y a 5 min` / `hier` /
///   `il y a 3j` / `il y a 2sem` / `il y a 2mois`, then the localized absolute
///   date past three months.
///
/// Fully localized: every label resolves through the app catalog
/// (`time.short.*` / `time.long.*` keys, `Bundle.main`), translated into the
/// five app languages (de/en/es/fr/pt-BR). The French `defaultValue` matches the
/// catalog so SDK tests — which run without the app bundle — resolve to it. The
/// absolute date past three months follows `Locale.current` (regional format +
/// translated month name).
///
/// Pure and deterministic: `now` and `calendar` are injectable for testing.
/// Not a localized cousin of the absolute `HH:mm` message clock
/// (`TimeStringCache`) nor the day separator (`MessageDayLabel`) — those stay
/// distinct by design.
public enum RelativeTimeFormatter {
    public enum Style: Sendable {
        /// Dense lists: `5 min` / `2h` / `3j` / `2sem` / `2mois` / date.
        case short
        /// Detail surfaces: `il y a 5 min` / `hier` / `il y a 2mois` / date.
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

    // MARK: - Short — "maintenant" / "45s" / "5 min" / "2h" / "3j" / "2sem" / "2mois"

    /// Built on the SDK's `RelativeTime` classification primitive (the single
    /// source of truth for the ladder thresholds). Past three months it switches
    /// to the localized absolute date.
    public static func shortString(for date: Date, now: Date = Date()) -> String {
        switch RelativeTime.classify(date, reference: now) {
        case .now: return nowLabel
        case .seconds(let s): return secondsLabel(s)
        case .minutes(let m): return minutesLabel(m)
        case .hours(let h): return hoursLabel(h)
        case .days(let d): return daysLabel(d)
        case .weeks(let w): return weeksLabel(w)
        case .months(let mo): return monthsLabel(mo)
        case .date(let d): return absoluteDate(d, now: now, calendar: .current)
        }
    }

    // MARK: - Long — "maintenant" / "il y a 5 min" / "hier" / "4 nov."

    /// Wraps the short unit label in the localized "ago" frame (`il y a %@` fr,
    /// `%@ ago` en, …), with `maintenant` and `hier` special-cased. Uses the
    /// calendar for day-level boundaries so "hier" tracks the previous calendar
    /// day rather than a 24-hour window.
    public static func longString(
        for date: Date,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        let seconds = Int(now.timeIntervalSince(date))
        if seconds < 30 { return nowLabel }
        if seconds < 60 { return ago(secondsLabel(seconds)) }
        if seconds < 3_600 { return ago(minutesLabel(seconds / 60)) }

        let dayDelta = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: date),
            to: calendar.startOfDay(for: now)
        ).day ?? 0

        if dayDelta <= 0 { return ago(hoursLabel(seconds / 3_600)) }
        if dayDelta == 1 { return yesterdayLabel }
        if dayDelta < 7 { return ago(daysLabel(dayDelta)) }
        if dayDelta < 30 { return ago(weeksLabel(dayDelta / 7)) }
        if dayDelta < 90 { return ago(monthsLabel(dayDelta / 30)) }
        return absoluteDate(date, now: now, calendar: calendar)
    }

    // MARK: - Last seen — "En ligne" / "Vu il y a 5 min" / "Vu hier à 14:12"

    /// Presence label shown after a username on the profile card. Adds the exact
    /// clock time (`HH:mm`) to every absolute (>24h) format, per product decision
    /// 2026-06-30. Under one minute reads "En ligne"; the relative frame (<24h)
    /// carries no clock. Mirrors the web `formatPresenceLabel` contract.
    public static func lastSeenString(
        for date: Date,
        now: Date = Date(),
        calendar: Calendar = .current
    ) -> String {
        let seconds = Int(now.timeIntervalSince(date))
        if seconds < 60 { return lastSeenOnlineLabel }
        if seconds < 3_600 { return seen(ago(minutesLabel(seconds / 60))) }

        let dayDelta = calendar.dateComponents(
            [.day],
            from: calendar.startOfDay(for: date),
            to: calendar.startOfDay(for: now)
        ).day ?? 0

        if dayDelta <= 0 { return seen(ago(hoursLabel(seconds / 3_600))) }

        let time = absoluteFormatters.timeString(from: date, timeZone: calendar.timeZone)
        if dayDelta == 1 { return String(format: lastSeenYesterdayAtFormat, time) }
        if dayDelta == 2 { return String(format: lastSeenBeforeYesterdayAtFormat, time) }
        let dateStr = absoluteDate(date, now: now, calendar: calendar)
        return String(format: lastSeenDateAtFormat, dateStr, time)
    }

    // MARK: - Localized unit labels (app catalog, Bundle.main)

    private static var nowLabel: String {
        String(localized: "time.short.now", defaultValue: "maintenant", bundle: .main)
    }
    private static func secondsLabel(_ s: Int) -> String { unit("time.short.seconds", "%llds", s) }
    private static func minutesLabel(_ m: Int) -> String { unit("time.short.minutes", "%lld min", m) }
    private static func hoursLabel(_ h: Int) -> String { unit("time.short.hours", "%lldh", h) }
    private static func daysLabel(_ d: Int) -> String { unit("time.short.days", "%lldj", d) }
    private static func weeksLabel(_ w: Int) -> String { unit("time.short.weeks", "%lldsem", w) }
    private static func monthsLabel(_ mo: Int) -> String { unit("time.short.months", "%lldmois", mo) }

    private static func unit(_ key: StaticString, _ def: String.LocalizationValue, _ value: Int) -> String {
        String(format: String(localized: key, defaultValue: def, bundle: .main), value)
    }

    private static var yesterdayLabel: String {
        String(localized: "time.long.yesterday", defaultValue: "hier", bundle: .main)
    }
    private static func ago(_ label: String) -> String {
        String(format: String(localized: "time.long.ago", defaultValue: "il y a %@", bundle: .main), label)
    }

    // MARK: - Last seen labels (app catalog, Bundle.main)

    private static var lastSeenOnlineLabel: String {
        String(localized: "time.lastSeen.online", defaultValue: "En ligne", bundle: .main)
    }
    private static func seen(_ label: String) -> String {
        String(format: String(localized: "time.lastSeen.seen", defaultValue: "Vu %@", bundle: .main), label)
    }
    private static var lastSeenYesterdayAtFormat: String {
        String(localized: "time.lastSeen.yesterdayAt", defaultValue: "Vu hier à %@", bundle: .main)
    }
    private static var lastSeenBeforeYesterdayAtFormat: String {
        String(localized: "time.lastSeen.beforeYesterdayAt", defaultValue: "Vu avant-hier à %@", bundle: .main)
    }
    private static var lastSeenDateAtFormat: String {
        String(localized: "time.lastSeen.dateAt", defaultValue: "Vu le %@ à %@", bundle: .main)
    }

    // MARK: - Absolute fallback — "4 nov." / "4 nov. 2024" (Locale.current)

    private static func absoluteDate(_ date: Date, now: Date, calendar: Calendar) -> String {
        let sameYear = calendar.component(.year, from: date) == calendar.component(.year, from: now)
        return absoluteFormatters.string(
            from: date,
            includingYear: !sameYear,
            timeZone: calendar.timeZone
        )
    }

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
    private let clock: DateFormatter

    init() {
        // Locale.current → the absolute date follows the user's regional format
        // (component order, separators) and is translated into their language
        // (month name). `setLocalizedDateFormatFromTemplate` reorders the
        // template per locale ("4 nov." fr, "Nov 4" en, etc.).
        let locale = Locale.current
        dayMonth = DateFormatter()
        dayMonth.locale = locale
        dayMonth.setLocalizedDateFormatFromTemplate("d MMM")
        dayMonthYear = DateFormatter()
        dayMonthYear.locale = locale
        dayMonthYear.setLocalizedDateFormatFromTemplate("d MMM yyyy")
        clock = DateFormatter()
        clock.locale = locale
        clock.setLocalizedDateFormatFromTemplate("jmm")
    }

    func string(from date: Date, includingYear: Bool, timeZone: TimeZone) -> String {
        lock.lock()
        defer { lock.unlock() }
        let formatter = includingYear ? dayMonthYear : dayMonth
        formatter.timeZone = timeZone
        return formatter.string(from: date)
    }

    func timeString(from date: Date, timeZone: TimeZone) -> String {
        lock.lock()
        defer { lock.unlock() }
        clock.timeZone = timeZone
        return clock.string(from: date)
    }
}
