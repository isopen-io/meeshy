import Foundation
import Testing
@testable import MeeshySDK

struct StoryItemRenderableSlideTests {
    @Test func toRenderableSlide_preservesEffects() {
        let textObj = StoryTextObject(id: "t1", text: "Hello",
                                      translations: ["fr": "Bonjour"])
        var effects = StoryEffects()
        effects.textObjects = [textObj]
        let item = StoryItem(id: "story-1", content: "Hello", media: [],
                             storyEffects: effects, createdAt: Date(),
                             expiresAt: nil, isViewed: false)

        let slide = item.toRenderableSlide(preferredLanguages: [])

        #expect(slide.id == "story-1")
        #expect(slide.effects.textObjects.count == 1)
        #expect(slide.effects.textObjects[0].text == "Hello")
    }

    @Test func toRenderableSlide_emptyContent_returnsSlideWithoutContent() {
        let item = StoryItem(id: "story-1", content: nil, media: [],
                             storyEffects: nil, createdAt: Date(),
                             expiresAt: nil, isViewed: false)
        let slide = item.toRenderableSlide(preferredLanguages: ["fr"])
        #expect(slide.id == "story-1")
        #expect(slide.content == nil)
    }

    @Test func toRenderableSlide_resolvesContent_viaPreferredLanguageChain() {
        let item = StoryItem(id: "story-1", content: "Hello", media: [],
                             storyEffects: nil, createdAt: Date(),
                             expiresAt: nil, isViewed: false)
        let slide = item.toRenderableSlide(preferredLanguages: ["fr"])
        // fallback to "Hello" when no translations on the item
        #expect(slide.content == "Hello")
    }
}
