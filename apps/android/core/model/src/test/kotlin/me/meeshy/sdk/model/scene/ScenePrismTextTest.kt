package me.meeshy.sdk.model.scene

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryClipTransition
import me.meeshy.sdk.model.StoryEasing
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StoryTextObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

@RunWith(JUnit4::class)
class ScenePrismTextTest {

    private fun hello() = text("t").copy(
        text = "Hello",
        sourceLanguage = "en",
        translations = mapOf("fr" to "Bonjour", "es" to "Hola"),
    )

    private fun rendered(langs: SceneReaderLanguages, mode: SceneRenderMode = SceneRenderMode.PLAY) =
        SceneRenderPlanner.plan(SceneLists(texts = listOf(hello())), 0.0, mode, langs).single()

    @Test
    fun `le rang un sert sa traduction`() {
        val item = rendered(SceneReaderLanguages(listOf("fr", "en")))
        assertThat(item.displayText).isEqualTo("Bonjour")
        assertThat(item.servedLanguage).isEqualTo("fr")
    }

    @Test
    fun `le rang quatre appareil sert sa traduction quand les trois premiers manquent`() {
        val langs = SceneReaderLanguages.of(systemLanguage = "de", regionalLanguage = null, customDestinationLanguage = null, deviceLocale = "es")
        assertThat(langs.languages).containsExactly("de", "es").inOrder()
        assertThat(rendered(langs).displayText).isEqualTo("Hola")
    }

    @Test
    fun `sans traduction vers la langue preferee on sert l original jamais la premiere`() {
        val item = rendered(SceneReaderLanguages(listOf("de")))
        assertThat(item.displayText).isEqualTo("Hello")
        assertThat(item.servedLanguage).isNull()
    }

    @Test
    fun `la langue d origine a son rang court circuite les rangs inferieurs`() {
        assertThat(rendered(SceneReaderLanguages(listOf("en", "fr"))).displayText).isEqualTo("Hello")
        assertThat(rendered(SceneReaderLanguages(listOf("fr", "en"))).displayText).isEqualTo("Bonjour")
    }

    @Test
    fun `en edition le texte source reste affiche`() {
        assertThat(rendered(SceneReaderLanguages(listOf("fr")), SceneRenderMode.EDIT).displayText).isEqualTo("Hello")
    }

    @Test
    fun `la langue du lecteur est injectee a tous les types d objet`() {
        val lists = SceneLists(texts = listOf(hello()), stickers = listOf(sticker()), places = listOf(place()), audios = listOf(audio()))
        val items = SceneRenderPlanner.plan(lists, 0.0, SceneRenderMode.PLAY, SceneReaderLanguages(listOf("fr")))
        assertThat(items).hasSize(4)
        assertThat(items.all { it.readerLanguages == listOf("fr") }).isTrue()
    }
}
