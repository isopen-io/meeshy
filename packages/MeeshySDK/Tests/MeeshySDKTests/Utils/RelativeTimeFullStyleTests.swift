import Foundation
import Testing
@testable import MeeshySDK

struct RelativeTimeFullStyleTests {
    private static let appLanguages = ["fr", "en", "de", "es", "it", "pt-BR", "ar"]

    private func reference(_ date: Date, now: Date, locale: Locale) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .full
        return formatter.localizedString(for: date, relativeTo: now)
    }

    @Test(arguments: appLanguages)
    func full_matchesFoundationSpelledOutFrame_inEveryAppLanguage(_ identifier: String) {
        let locale = Locale(identifier: identifier)
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        for offset: TimeInterval in [-30, -300, -10_800, -259_200, -1_728_000, 7_200] {
            let date = now.addingTimeInterval(offset)
            #expect(
                RelativeTimeFormatter.fullString(for: date, now: now, locale: locale)
                    == reference(date, now: now, locale: locale)
            )
        }
    }

    @Test func full_french_spellsTheUnitOut() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let label = RelativeTimeFormatter.fullString(
            for: now.addingTimeInterval(-3 * 86_400), now: now, locale: Locale(identifier: "fr")
        )
        #expect(label == "il y a 3 jours")
    }

    @Test func full_followsTheLocaleOfEachCall_notTheFirstCachedOne() {
        let now = Date(timeIntervalSince1970: 1_700_000_000)
        let date = now.addingTimeInterval(-3 * 86_400)
        let french = RelativeTimeFormatter.fullString(for: date, now: now, locale: Locale(identifier: "fr"))
        let english = RelativeTimeFormatter.fullString(for: date, now: now, locale: Locale(identifier: "en"))
        #expect(french != english)
        #expect(english == "3 days ago")
    }
}
