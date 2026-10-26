import Foundation

extension MediaFormat {

    /// How a duration reads. Clocks never promote hours on their own (« 61:35 »)
    /// unless the style says so; the spoken forms are for VoiceOver, never a clock.
    public enum DurationStyle: Sendable, Equatable {
        /// « 2:05 » — media players, recorders.
        case clock
        /// « 02:05 ».
        case paddedClock
        /// « 1:05:00 », hours always shown.
        case hourClock
        /// « 2:05 » under an hour, « 1:05:00 » past it — call history.
        case clockPromotingHours
        /// « 02:05 » under an hour, « 1:05:00 » past it — the live call timer.
        case paddedClockPromotingHours
        /// « 0:03.482 », bounded to one day.
        case milliseconds
        /// « 2 minutes, 5 seconds ».
        case spoken
        /// « two minutes, five seconds » — minutes accumulate.
        case spelledOut
        /// « 4 minutes » — the nearest single unit.
        case approximate
        /// « 4m » — the nearest single unit, abbreviated.
        case approximateAbbreviated
    }

    /// Whole, positive, bounded seconds — `.nan`, `.infinity` and negatives are 0;
    /// `Int(1e30)` would trap at runtime.
    public nonisolated static func wholeSeconds(
        from seconds: TimeInterval,
        rounding: FloatingPointRoundingRule = .down
    ) -> Int {
        guard seconds.isFinite, seconds > 0 else { return 0 }
        return Int(min(seconds.rounded(rounding), Double(Int32.max)))
    }

    /// `rounding` turns a fractional duration into whole seconds; `.milliseconds`
    /// and the approximate styles read the fraction itself.
    public nonisolated static func duration(
        _ seconds: TimeInterval,
        style: DurationStyle = .clock,
        rounding: FloatingPointRoundingRule = .down,
        locale: Locale = .current
    ) -> String {
        switch style {
        case .milliseconds:
            let millis = seconds.isFinite ? Int((min(max(0, seconds), 86_400) * 1000).rounded()) : 0
            return Duration.milliseconds(millis).formatted(
                clock(.minuteSecond(padMinuteToLength: 0, fractionalSecondsLength: 3), locale: locale))
        case .approximate, .approximateAbbreviated:
            let bounded = seconds.isFinite ? min(max(0, seconds), Double(Int32.max)) : 0
            return componentsFormatter(style, locale: locale).string(from: bounded) ?? ""
        default:
            return duration(wholeSeconds(from: seconds, rounding: rounding), style: style, locale: locale)
        }
    }

    public nonisolated static func duration(
        _ seconds: Int,
        style: DurationStyle = .clock,
        locale: Locale = .current
    ) -> String {
        let total = max(0, seconds)
        let span = Duration.seconds(total)
        switch style {
        case .clock:
            return span.formatted(clock(.minuteSecond, locale: locale))
        case .paddedClock:
            return span.formatted(clock(.minuteSecond(padMinuteToLength: 2), locale: locale))
        case .hourClock:
            return span.formatted(clock(.hourMinuteSecond, locale: locale))
        case .clockPromotingHours:
            return duration(total, style: total >= 3600 ? .hourClock : .clock, locale: locale)
        case .paddedClockPromotingHours:
            return duration(total, style: total >= 3600 ? .hourClock : .paddedClock, locale: locale)
        case .spoken:
            return span.formatted(
                .units(allowed: [.hours, .minutes, .seconds], width: .wide, zeroValueUnits: .hide).locale(locale))
        case .spelledOut:
            var components = DateComponents()
            components.minute = total / 60
            components.second = total % 60
            return componentsFormatter(style, locale: locale).string(from: components) ?? "\(total)"
        case .milliseconds, .approximate, .approximateAbbreviated:
            return duration(TimeInterval(total), style: style, locale: locale)
        }
    }

    /// A clock never groups its digits: « 1439:59 », not « 1,439:59 » (iOS 18+;
    /// earlier systems group past 999 minutes).
    private nonisolated static func clock(_ pattern: Duration.TimeFormatStyle.Pattern, locale: Locale) -> Duration.TimeFormatStyle {
        let style = Duration.TimeFormatStyle(pattern: pattern, locale: locale)
        guard #available(iOS 18, macOS 15, *) else { return style }
        return style.grouping(.never)
    }

    private nonisolated(unsafe) static let componentsFormatters = NSCache<NSString, DateComponentsFormatter>()

    /// One formatter per style and locale, built once: spoken values are
    /// recomputed at every playhead frame. `NSCache` is thread-safe, and a
    /// formatter nobody mutates any more is too.
    private nonisolated static func componentsFormatter(_ style: DurationStyle, locale: Locale) -> DateComponentsFormatter {
        let key = "\(style)|\(locale.identifier)" as NSString
        if let cached = componentsFormatters.object(forKey: key) { return cached }
        let formatter = DateComponentsFormatter()
        switch style {
        case .spelledOut:
            formatter.allowedUnits = [.minute, .second]
            formatter.unitsStyle = .spellOut
        default:
            formatter.allowedUnits = [.hour, .minute, .second]
            formatter.unitsStyle = style == .approximate ? .full : .abbreviated
            formatter.maximumUnitCount = 1
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        formatter.calendar = calendar
        componentsFormatters.setObject(formatter, forKey: key)
        return formatter
    }
}
