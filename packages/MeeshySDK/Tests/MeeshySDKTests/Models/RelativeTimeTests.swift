import Testing
import Foundation
@testable import MeeshySDK

@Suite("RelativeTime")
struct RelativeTimeTests {

    private let reference = Date(timeIntervalSince1970: 1_000_000)

    private func ago(_ seconds: TimeInterval) -> Date {
        reference.addingTimeInterval(-seconds)
    }

    @Test("under a minute is now")
    func now() {
        #expect(RelativeTime.classify(ago(0), reference: reference) == .now)
        #expect(RelativeTime.classify(ago(59), reference: reference) == .now)
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

    @Test("a week or older falls back to the absolute date")
    func absoluteDate() {
        let old = ago(7 * 86_400)
        #expect(RelativeTime.classify(old, reference: reference) == .date(old))
        let veryOld = ago(400 * 86_400)
        #expect(RelativeTime.classify(veryOld, reference: reference) == .date(veryOld))
    }
}
