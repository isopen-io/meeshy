package me.meeshy.app.stories

import android.content.Context
import android.content.res.Configuration
import android.content.res.Resources
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.util.Locale
import me.meeshy.feature.stories.R
import me.meeshy.sdk.model.composer.ComposerFormat
import me.meeshy.sdk.model.composer.ComposerFormatVariant
import me.meeshy.sdk.model.composer.ComposerSceneNoun
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.annotation.Config

/**
 * #13913 : en post ou en réel, aucun libellé du compositeur, visible ou annoncé, ne dit « story » ; en story, aucun ne dit
 * « post » ni « réel ». Chaque libellé qui nomme le format passe par la table des variantes, dans les sept langues.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class ComposerFormatLabelsTest {

    private val words: Map<String, Map<ComposerSceneNoun, Regex>> = mapOf(
        "en" to nouns(story = "\\bstory\\b", post = "\\bpost\\b", reel = "\\breel"),
        "fr" to nouns(story = "\\bstory\\b", post = "\\bpost\\b", reel = "\\bréel"),
        "es" to nouns(story = "historia", post = "publicación", reel = "\\breel"),
        "de" to nouns(story = "story", post = "beitrag", reel = "reel"),
        "it" to nouns(story = "storia", post = "\\bpost\\b", reel = "\\breel"),
        "pt" to nouns(story = "\\bstory\\b", post = "publicação", reel = "\\breel"),
        "ar" to nouns(story = "قصة", post = "منشور", reel = "ريل"),
    )

    private fun nouns(story: String, post: String, reel: String) = mapOf(
        ComposerSceneNoun.STORY to Regex(story, RegexOption.IGNORE_CASE),
        ComposerSceneNoun.POST to Regex(post, RegexOption.IGNORE_CASE),
        ComposerSceneNoun.REEL to Regex(reel, RegexOption.IGNORE_CASE),
    )

    private fun resourcesIn(tag: String): Resources {
        val base = RuntimeEnvironment.getApplication() as Context
        val configuration = Configuration(base.resources.configuration).apply { setLocale(Locale.forLanguageTag(tag)) }
        return base.createConfigurationContext(configuration).resources
    }

    @Test
    fun `every label of the composer names the format it composes and no other, in the seven languages`() {
        listOf(ComposerFormat.STORY, ComposerFormat.POST, ComposerFormat.REEL).forEach { format ->
            val variant = ComposerFormatVariant.of(format)
            variant.labels.forEach { label ->
                words.forEach { (tag, byNoun) ->
                    val text = resourcesIn(tag).getString(label.res(variant.noun))
                    assertWithMessage("$format $label [$tag] « $text » names its format")
                        .that(byNoun.getValue(variant.noun).containsMatchIn(text)).isTrue()
                    (byNoun - variant.noun).forEach { (other, word) ->
                        assertWithMessage("$format $label [$tag] « $text » names $other")
                            .that(word.containsMatchIn(text)).isFalse()
                    }
                }
            }
        }
    }

    @Test
    fun `the sound notices a post and a reel share with the story name no format`() {
        val shared = listOf(R.string.story_sound_sheet_transcription_server)
        shared.forEach { res ->
            words.forEach { (tag, byNoun) ->
                val text = resourcesIn(tag).getString(res)
                byNoun.forEach { (noun, word) ->
                    assertWithMessage("[$tag] « $text » names $noun").that(word.containsMatchIn(text)).isFalse()
                }
            }
        }
    }

    @Test
    fun `the composer reads the story-only labels through the format table, never directly`() {
        val storyOnly = listOf(
            "stories_composer_canvas",
            "story_sound_sheet_title",
            "story_sound_library_emptyMine",
            "story_media_soundExtraction_caption",
            "story_media_soundExtraction_a11yHint",
            "composer_post_text",
        )
        val sources = File("src/main/kotlin").walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
        storyOnly.forEach { name ->
            val readers = sources.filter { Regex("R\\.string\\.$name\\b").containsMatchIn(it.readText()) }.map { it.name }
            assertWithMessage("$name is read outside the format table").that(readers).containsExactly("ComposerFormatLabels.kt")
        }
    }
}
