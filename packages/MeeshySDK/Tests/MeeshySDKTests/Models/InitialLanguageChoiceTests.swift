import Testing
@testable import MeeshySDK

@Suite("InitialLanguageChoice")
struct InitialLanguageChoiceTests {

    private let supported: Set<String> = ["fr", "en"]

    @Test func firstSupportedPreferredLanguageWins() {
        let choice = InitialLanguageChoice.resolve(preferred: ["de", "en", "fr"], deviceLocale: "fr", supported: supported, fallback: "fr")
        #expect(choice == "en")
    }

    @Test func regionalIdentifierCollapsesToItsLanguage() {
        let choice = InitialLanguageChoice.resolve(preferred: ["EN-us"], deviceLocale: nil, supported: supported, fallback: "fr")
        #expect(choice == "en")
    }

    @Test func deviceLocaleServesWhenNoPreferredLanguageIsSupported() {
        let choice = InitialLanguageChoice.resolve(preferred: ["de"], deviceLocale: "en", supported: supported, fallback: "fr")
        #expect(choice == "en")
    }

    @Test func fallbackServesWhenNothingIsSupported() {
        let choice = InitialLanguageChoice.resolve(preferred: ["de"], deviceLocale: "es", supported: supported, fallback: "fr")
        #expect(choice == "fr")
    }
}
