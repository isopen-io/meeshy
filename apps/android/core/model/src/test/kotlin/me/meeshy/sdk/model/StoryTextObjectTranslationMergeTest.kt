package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Realtime merge of per-text-object overlay translations into a cached story.
 *
 * The gateway broadcasts `story:translation-updated` (`{ postId, textObjectIndex,
 * translations }`) once it has translated a canvas text overlay; the viewer merges
 * those translations into the story so the reader — who resolves via the preferred
 * chain — switches to the requested language the instant it lands. Port of the iOS
 * `StoryItem.mergingTextObjectTranslations(at:translations:)`.
 */
class StoryTextObjectTranslationMergeTest {

    private fun story(textObjects: List<StoryTextObject>) =
        StoryItem(id = "post1", storyEffects = StoryEffects(textObjects = textObjects))

    private fun textObject(
        id: String = "txt",
        text: String = "Hello",
        translations: Map<String, String>? = null,
    ) = StoryTextObject(id = id, text = text, translations = translations)

    @Test
    fun `adds translations to the targeted text object`() {
        val merged = StoryTextObjectTranslationMerge.merge(
            story(listOf(textObject())),
            textObjectIndex = 0,
            translations = mapOf("fr" to "Bonjour", "es" to "Hola"),
        )

        val t = merged.storyEffects!!.textObjects[0].translations
        assertThat(t!!["fr"]).isEqualTo("Bonjour")
        assertThat(t["es"]).isEqualTo("Hola")
        assertThat(merged.storyEffects!!.textObjects[0].text).isEqualTo("Hello")
    }

    @Test
    fun `preserves existing translations and overwrites the same language`() {
        val merged = StoryTextObjectTranslationMerge.merge(
            story(listOf(textObject(translations = mapOf("fr" to "Salut", "de" to "Hallo")))),
            textObjectIndex = 0,
            translations = mapOf("fr" to "Bonjour", "es" to "Hola"),
        )

        val t = merged.storyEffects!!.textObjects[0].translations!!
        assertThat(t["fr"]).isEqualTo("Bonjour") // overwritten
        assertThat(t["de"]).isEqualTo("Hallo")   // preserved
        assertThat(t["es"]).isEqualTo("Hola")    // added
    }

    @Test
    fun `targets only the indexed text object, leaving the others untouched`() {
        val merged = StoryTextObjectTranslationMerge.merge(
            story(listOf(textObject(id = "first", text = "First"), textObject(id = "second", text = "Second"))),
            textObjectIndex = 1,
            translations = mapOf("fr" to "Deuxième"),
        )

        assertThat(merged.storyEffects!!.textObjects[0].translations).isNull()
        assertThat(merged.storyEffects!!.textObjects[1].translations!!["fr"]).isEqualTo("Deuxième")
    }

    @Test
    fun `an out-of-range index returns the story unchanged`() {
        val original = story(listOf(textObject()))

        val merged = StoryTextObjectTranslationMerge.merge(original, textObjectIndex = 5, translations = mapOf("fr" to "Bonjour"))

        assertThat(merged).isEqualTo(original)
    }

    @Test
    fun `a negative index returns the story unchanged`() {
        val original = story(listOf(textObject()))

        val merged = StoryTextObjectTranslationMerge.merge(original, textObjectIndex = -1, translations = mapOf("fr" to "Bonjour"))

        assertThat(merged).isEqualTo(original)
    }

    @Test
    fun `empty translations return the story unchanged`() {
        val original = story(listOf(textObject(translations = mapOf("fr" to "Salut"))))

        val merged = StoryTextObjectTranslationMerge.merge(original, textObjectIndex = 0, translations = emptyMap())

        assertThat(merged).isEqualTo(original)
    }

    @Test
    fun `a story with no storyEffects returns unchanged`() {
        val original = StoryItem(id = "post1", storyEffects = null)

        val merged = StoryTextObjectTranslationMerge.merge(original, textObjectIndex = 0, translations = mapOf("fr" to "Bonjour"))

        assertThat(merged).isEqualTo(original)
    }

    @Test
    fun `preserves every other field of the story and its effects around the merge`() {
        val original = StoryItem(
            id = "post1",
            content = "caption",
            createdAt = "2026-08-24T00:00:00Z",
            isViewed = true,
            reactionCount = 42,
            commentCount = 7,
            translations = listOf(StoryTranslation(language = "es", content = "hola")),
            storyEffects = StoryEffects(
                background = "#123456",
                textObjects = listOf(textObject()),
            ),
        )

        val merged = StoryTextObjectTranslationMerge.merge(original, textObjectIndex = 0, translations = mapOf("fr" to "Bonjour"))

        assertThat(merged.content).isEqualTo("caption")
        assertThat(merged.createdAt).isEqualTo("2026-08-24T00:00:00Z")
        assertThat(merged.isViewed).isTrue()
        assertThat(merged.reactionCount).isEqualTo(42)
        assertThat(merged.commentCount).isEqualTo(7)
        assertThat(merged.translations).isEqualTo(listOf(StoryTranslation(language = "es", content = "hola")))
        assertThat(merged.storyEffects!!.background).isEqualTo("#123456")
        assertThat(merged.storyEffects!!.textObjects[0].translations!!["fr"]).isEqualTo("Bonjour")
    }
}
