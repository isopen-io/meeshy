import Testing
@testable import MeeshySDK

struct LanguageDetectionTests {
    @Test func detects_french_text() {
        #expect(LanguageDetection.detectLanguageCode(
            for: "Bonjour, comment vas-tu aujourd'hui ? J'espère que tout va bien.",
            fallback: "en") == "fr")
    }

    @Test func detects_english_text() {
        #expect(LanguageDetection.detectLanguageCode(
            for: "How are you doing today? I hope everything is going well.",
            fallback: "fr") == "en")
    }

    @Test func short_text_returns_fallback() {
        #expect(LanguageDetection.detectLanguageCode(for: "Ok", fallback: "fr") == "fr")
    }

    @Test func emoji_only_returns_fallback() {
        #expect(LanguageDetection.detectLanguageCode(for: "😅🤣🤣", fallback: "fr") == "fr")
    }

    @Test func nil_fallback_when_undetectable() {
        #expect(LanguageDetection.detectLanguageCode(for: "🙂", fallback: nil) == nil)
    }
}
