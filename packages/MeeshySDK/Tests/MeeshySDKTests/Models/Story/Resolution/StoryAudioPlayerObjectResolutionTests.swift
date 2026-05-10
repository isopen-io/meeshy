import Testing
@testable import MeeshySDK

struct StoryAudioPlayerObjectResolutionTests {
    @Test func resolved_returnsVariant_whenLanguageMatches() {
        let bg = makeBgAudio(default: "default-id", variants: [
            ("fr", "fr-id"), ("es", "es-id"),
        ])
        #expect(bg.resolvedPostMediaId(preferredLanguages: ["fr"]) == "fr-id")
    }

    @Test func resolved_followsChainOrder() {
        let bg = makeBgAudio(default: "default-id", variants: [
            ("fr", "fr-id"), ("es", "es-id"),
        ])
        #expect(bg.resolvedPostMediaId(preferredLanguages: ["de", "es", "fr"]) == "es-id")
    }

    @Test func resolved_fallsBackToDefault_whenNoVariantMatches() {
        let bg = makeBgAudio(default: "default-id", variants: [("fr", "fr-id")])
        #expect(bg.resolvedPostMediaId(preferredLanguages: ["de"]) == "default-id")
    }

    @Test func resolved_nilVariants_returnsDefault() {
        let bg = makeBgAudio(default: "default-id", variants: nil)
        #expect(bg.resolvedPostMediaId(preferredLanguages: ["fr"]) == "default-id")
    }

    @Test func resolved_emptyChain_returnsDefault() {
        let bg = makeBgAudio(default: "default-id", variants: [("fr", "fr-id")])
        #expect(bg.resolvedPostMediaId(preferredLanguages: []) == "default-id")
    }

    // Helper: builds a StoryAudioPlayerObject with minimal fields.
    private func makeBgAudio(default postMediaId: String,
                             variants: [(String, String)]?) -> StoryAudioPlayerObject {
        let variantArr = variants?.map {
            StoryAudioVariant(postMediaId: $0.1, language: $0.0)
        }
        return StoryAudioPlayerObject(
            id: "test-bg",
            postMediaId: postMediaId,
            placement: "background",
            isBackground: true,
            backgroundAudioVariants: variantArr
        )
    }
}
