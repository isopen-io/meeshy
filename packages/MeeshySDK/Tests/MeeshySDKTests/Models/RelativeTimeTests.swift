import Testing
import Foundation
@testable import MeeshySDK

@Suite("RelativeTime")
struct RelativeTimeTests {

    private let reference = Date(timeIntervalSince1970: 1_000_000)

    private func ago(_ seconds: TimeInterval) -> Date {
        reference.addingTimeInterval(-seconds)
    }

    @Test("under thirty seconds is now")
    func now() {
        #expect(RelativeTime.classify(ago(0), reference: reference) == .now)
        #expect(RelativeTime.classify(ago(29), reference: reference) == .now)
    }

    @Test("seconds between thirty seconds and a minute")
    func seconds() {
        #expect(RelativeTime.classify(ago(30), reference: reference) == .seconds(30))
        #expect(RelativeTime.classify(ago(59), reference: reference) == .seconds(59))
    }

    @Test("future / clock-skewed timestamps collapse to now")
    func future() {
        #expect(RelativeTime.classify(reference.addingTimeInterval(120), reference: reference) == .now)
    }

    @Test("minutes between one minute and one hour")
    func minutes() {
        #expect(RelativeTime.classify(ago(60), reference: reference) == .minutes(1))
        #expect(RelativeTime.classify(ago(150), reference: reference) == .minutes(2))
        #expect(RelativeTime.classify(ago(3_599), reference: reference) == .minutes(59))
    }

    @Test("hours between one hour and one day")
    func hours() {
        #expect(RelativeTime.classify(ago(3_600), reference: reference) == .hours(1))
        #expect(RelativeTime.classify(ago(86_399), reference: reference) == .hours(23))
    }

    @Test("days between one day and one week")
    func days() {
        #expect(RelativeTime.classify(ago(86_400), reference: reference) == .days(1))
        #expect(RelativeTime.classify(ago(6 * 86_400), reference: reference) == .days(6))
    }

    @Test("weeks between one week and one month")
    func weeks() {
        #expect(RelativeTime.classify(ago(7 * 86_400), reference: reference) == .weeks(1))
        #expect(RelativeTime.classify(ago(29 * 86_400), reference: reference) == .weeks(4))
    }

    @Test("months between one month and three months")
    func months() {
        #expect(RelativeTime.classify(ago(30 * 86_400), reference: reference) == .months(1))
        #expect(RelativeTime.classify(ago(89 * 86_400), reference: reference) == .months(2))
    }

    @Test("three months or older falls back to the absolute date")
    func absoluteDate() {
        let old = ago(90 * 86_400)
        #expect(RelativeTime.classify(old, reference: reference) == .date(old))
        let veryOld = ago(400 * 86_400)
        #expect(RelativeTime.classify(veryOld, reference: reference) == .date(veryOld))
    }
}
