import Testing
@testable import MeeshySDK

struct StoryTextObjectResolutionTests {
    @Test func resolvedText_returnsTranslation_whenLanguageMatches() {
        let obj = StoryTextObject(id: "t1", text: "Hello",
                                  translations: ["fr": "Bonjour", "es": "Hola"])
        #expect(obj.resolvedText(preferredLanguages: ["fr"]) == "Bonjour")
    }

    @Test func resolvedText_followsChainOrder() {
        let obj = StoryTextObject(id: "t1", text: "Hello",
                                  translations: ["fr": "Bonjour", "es": "Hola"])
        #expect(obj.resolvedText(preferredLanguages: ["de", "es", "fr"]) == "Hola")
    }

    @Test func resolvedText_fallsBackToOriginal_whenNoMatch() {
        let obj = StoryTextObject(id: "t1", text: "Hello",
                                  translations: ["fr": "Bonjour"])
        #expect(obj.resolvedText(preferredLanguages: ["de"]) == "Hello")
    }

    @Test func resolvedText_emptyChain_returnsOriginal() {
        let obj = StoryTextObject(id: "t1", text: "Hello",
                                  translations: ["fr": "Bonjour"])
        #expect(obj.resolvedText(preferredLanguages: []) == "Hello")
    }

    @Test func resolvedText_nilTranslations_returnsOriginal() {
        let obj = StoryTextObject(id: "t1", text: "Hello", translations: nil)
        #expect(obj.resolvedText(preferredLanguages: ["fr"]) == "Hello")
    }
}
