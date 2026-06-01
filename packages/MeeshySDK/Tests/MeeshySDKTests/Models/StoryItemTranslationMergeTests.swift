import XCTest
@testable import MeeshySDK

/// Tests du merge realtime des traductions de texte de story par text-object.
/// Le gateway diffuse `story:translation-updated` (`{postId, textObjectIndex,
/// translations}`) après avoir traduit un overlay ; `mergingTextObjectTranslations`
/// fusionne ces traductions dans la `StoryItem` en cache, sans mutation en place.
final class StoryItemTranslationMergeTests: XCTestCase {

    private func makeStory(textObjects: [StoryTextObject]) -> StoryItem {
        StoryItem(id: "post1", storyEffects: StoryEffects(textObjects: textObjects))
    }

    func test_merge_addsTranslationsToTargetTextObject() {
        let story = makeStory(textObjects: [StoryTextObject(text: "Hello")])

        let merged = story.mergingTextObjectTranslations(at: 0, translations: ["fr": "Bonjour", "es": "Hola"])

        XCTAssertEqual(merged.storyEffects?.textObjects[0].translations?["fr"], "Bonjour")
        XCTAssertEqual(merged.storyEffects?.textObjects[0].translations?["es"], "Hola")
        XCTAssertEqual(merged.storyEffects?.textObjects[0].text, "Hello")
    }

    func test_merge_preservesExistingTranslationsAndOverwritesSameLanguage() {
        let story = makeStory(textObjects: [
            StoryTextObject(text: "Hello", translations: ["fr": "Salut", "de": "Hallo"])
        ])

        let merged = story.mergingTextObjectTranslations(at: 0, translations: ["fr": "Bonjour", "es": "Hola"])

        let t = merged.storyEffects?.textObjects[0].translations
        XCTAssertEqual(t?["fr"], "Bonjour")   // overwritten
        XCTAssertEqual(t?["de"], "Hallo")     // preserved
        XCTAssertEqual(t?["es"], "Hola")      // added
    }

    func test_merge_targetsOnlyTheIndexedTextObject() {
        let story = makeStory(textObjects: [
            StoryTextObject(text: "First"),
            StoryTextObject(text: "Second"),
        ])

        let merged = story.mergingTextObjectTranslations(at: 1, translations: ["fr": "Deuxième"])

        XCTAssertNil(merged.storyEffects?.textObjects[0].translations)
        XCTAssertEqual(merged.storyEffects?.textObjects[1].translations?["fr"], "Deuxième")
    }

    func test_merge_outOfRangeIndex_returnsUnchanged() {
        let story = makeStory(textObjects: [StoryTextObject(text: "Hello")])

        let merged = story.mergingTextObjectTranslations(at: 5, translations: ["fr": "Bonjour"])

        XCTAssertNil(merged.storyEffects?.textObjects[0].translations)
    }

    func test_merge_emptyTranslations_returnsUnchanged() {
        let story = makeStory(textObjects: [StoryTextObject(text: "Hello", translations: ["fr": "Salut"])])

        let merged = story.mergingTextObjectTranslations(at: 0, translations: [:])

        XCTAssertEqual(merged.storyEffects?.textObjects[0].translations, ["fr": "Salut"])
    }

    func test_merge_noStoryEffects_returnsUnchanged() {
        let story = StoryItem(id: "post1", storyEffects: nil)

        let merged = story.mergingTextObjectTranslations(at: 0, translations: ["fr": "Bonjour"])

        XCTAssertNil(merged.storyEffects)
    }
}
