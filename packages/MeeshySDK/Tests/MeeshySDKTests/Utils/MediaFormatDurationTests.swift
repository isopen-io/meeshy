import Foundation
import Testing
@testable import MeeshySDK

struct MediaFormatDurationTests {
    private static let appLanguages = ["fr", "en", "de", "es", "it", "pt-BR", "ar"]
    private static let samples = [0, 5, 59, 60, 125, 599, 600, 3_599, 3_600, 3_695, 7_322, 86_399]

    private static func dateComponents(
        _ style: DateComponentsFormatter.UnitsStyle,
        units: NSCalendar.Unit = [.hour, .minute, .second],
        maximumUnitCount: Int = 0,
        locale: Locale
    ) -> DateComponentsFormatter {
        let formatter = DateComponentsFormatter()
        formatter.unitsStyle = style
        formatter.allowedUnits = units
        formatter.maximumUnitCount = maximumUnitCount
        var calendar = Calendar(identifier: .gregorian)
        calendar.locale = locale
        formatter.calendar = calendar
        return formatter
    }

    @Test(arguments: appLanguages)
    func clock_matchesTheFormerMinuteSecondFormat(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        for total in Self.samples {
            #expect(MediaFormat.duration(total, locale: locale) == String(format: "%d:%02d", total / 60, total % 60))
        }
    }

    @Test(arguments: appLanguages)
    func paddedClock_matchesTheFormerPaddedFormat(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        for total in Self.samples {
            #expect(MediaFormat.duration(total, style: .paddedClock, locale: locale)
                == String(format: "%02d:%02d", total / 60, total % 60))
        }
    }

    @Test(arguments: appLanguages)
    func clockPromotingHours_matchesTheFormerCallHistoryFormat(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        for total in Self.samples {
            let h = total / 3600, m = (total % 3600) / 60, s = total % 60
            let former = h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
            #expect(MediaFormat.duration(total, style: .clockPromotingHours, locale: locale) == former)
        }
    }

    @Test(arguments: appLanguages)
    func paddedClockPromotingHours_isThePhoneTimer(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        for total in Self.samples {
            let expected = total >= 3600
                ? MediaFormat.duration(total, style: .hourClock, locale: locale)
                : MediaFormat.duration(total, style: .paddedClock, locale: locale)
            #expect(MediaFormat.duration(total, style: .paddedClockPromotingHours, locale: locale) == expected)
        }
    }

    @Test func hourClock_alwaysShowsHours() {
        let english = Locale(identifier: "en_US")
        #expect(MediaFormat.duration(3_900, style: .hourClock, locale: english) == "1:05:00")
        #expect(MediaFormat.duration(65, style: .hourClock, locale: english) == "0:01:05")
    }

    @Test(arguments: appLanguages)
    func spoken_matchesTheFormerFullDateComponentsFormatter(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        let former = Self.dateComponents(.full, locale: locale)
        for total in Self.samples where total > 0 {
            #expect(MediaFormat.duration(total, style: .spoken, locale: locale) == former.string(from: TimeInterval(total)))
        }
    }

    @Test(arguments: appLanguages)
    func spelledOut_matchesTheFormerTrimmerFormatter(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        let former = Self.dateComponents(.spellOut, units: [.minute, .second], locale: locale)
        for total in Self.samples {
            var components = DateComponents()
            components.minute = total / 60
            components.second = total % 60
            #expect(MediaFormat.duration(total, style: .spelledOut, locale: locale) == former.string(from: components))
        }
    }

    @Test(arguments: appLanguages)
    func approximate_matchesTheFormerSingleUnitFormatters(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        let full = Self.dateComponents(.full, maximumUnitCount: 1, locale: locale)
        let abbreviated = Self.dateComponents(.abbreviated, maximumUnitCount: 1, locale: locale)
        for seconds in Self.samples.map(TimeInterval.init) + [89.6, 239.4] {
            #expect(MediaFormat.duration(seconds, style: .approximate, locale: locale) == full.string(from: seconds))
            #expect(MediaFormat.duration(seconds, style: .approximateAbbreviated, locale: locale) == abbreviated.string(from: seconds))
        }
    }

    @Test(arguments: appLanguages)
    func milliseconds_keepsTheFractionalPart(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        let expected = Duration.milliseconds(3_482).formatted(
            .time(pattern: .minuteSecond(padMinuteToLength: 0, fractionalSecondsLength: 3)).locale(locale))
        #expect(MediaFormat.duration(3.482, style: .milliseconds, locale: locale) == expected)
    }

    @Test func milliseconds_boundsToOneDay() {
        let english = Locale(identifier: "en_US")
        #expect(MediaFormat.duration(1e12, style: .milliseconds, locale: english)
            == MediaFormat.duration(86_400, style: .milliseconds, locale: english))
        #expect(MediaFormat.duration(-.infinity, style: .milliseconds, locale: english) == "0:00.000")
    }

    @Test func arabicRegion_rendersArabicIndicDigits() {
        #expect(MediaFormat.duration(125, locale: Locale(identifier: "ar_SA")) == "٢:٠٥")
    }

    @Test func clock_defaultRoundingTruncates_nearestRoundsWhenAsked() {
        let english = Locale(identifier: "en_US")
        #expect(MediaFormat.duration(59.9, locale: english) == "0:59")
        #expect(MediaFormat.duration(59.6, rounding: .toNearestOrAwayFromZero, locale: english) == "1:00")
        #expect(MediaFormat.duration(59.4, rounding: .toNearestOrAwayFromZero, locale: english) == "0:59")
        #expect(MediaFormat.duration(0.2, rounding: .up, locale: english) == "0:01")
    }

    @Test(arguments: [-5.0, .nan, .infinity, -.infinity, 1e30])
    func clock_hostileInputsNeverTrap(_ seconds: Double) {
        let english = Locale(identifier: "en_US")
        #expect(!MediaFormat.duration(seconds, locale: english).isEmpty)
        #expect(!MediaFormat.duration(seconds, style: .spoken, locale: english).contains(":"))
    }

    @Test func clock_invalidInputsFallBackToZero() {
        let english = Locale(identifier: "en_US")
        #expect(MediaFormat.duration(-5, locale: english) == "0:00")
        #expect(MediaFormat.duration(.nan, locale: english) == "0:00")
        #expect(MediaFormat.duration(-3 as Int, locale: english) == "0:00")
    }

    @Test func wholeSeconds_boundsAndRounds() {
        #expect(MediaFormat.wholeSeconds(from: 90.9) == 90)
        #expect(MediaFormat.wholeSeconds(from: 90.5, rounding: .toNearestOrAwayFromZero) == 91)
        #expect(MediaFormat.wholeSeconds(from: .nan) == 0)
        #expect(MediaFormat.wholeSeconds(from: 1e30) == Int(Int32.max))
    }
}
