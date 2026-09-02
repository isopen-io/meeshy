package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryTextEffect
import me.meeshy.sdk.model.StoryTextObject
import me.meeshy.sdk.model.StoryTextBackgroundStyle
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.JUnit4

/**
 * Behavioural spec for the pure projection of a wire [StoryTextObject] into the
 * viewer's [StoryTextObjectView]. Text is resolved through the Prisme Linguistique
 * chain (port of iOS `StoryTextObject.resolvedText(preferredLanguages:)`): each
 * preferred language tries an exact key, then a case/region-insensitive match,
 * before the next; the original text is the final fallback. Transform, timing and
 * keyframe fields carry through so the viewer can animate the object.
 */
@RunWith(JUnit4::class)
class StoryTextObjectProjectionTest {

    private fun textObject(
        text: String = "Hello",
        translations: Map<String, String>? = null,
    ) = StoryTextObject(id = "t", text = text, translations = translations)

    @Test
    fun `resolveText returns the original text when there are no translations`() {
        val resolved = StoryTextObjectProjection.resolveText(textObject(), preferredLanguages = listOf("fr"))
        assertThat(resolved).isEqualTo("Hello")
    }

    @Test
    fun `resolveText returns the original text when no preferred language is configured`() {
        val obj = textObject(translations = mapOf("fr" to "Bonjour"))
        assertThat(StoryTextObjectProjection.resolveText(obj, preferredLanguages = emptyList())).isEqualTo("Hello")
    }

    @Test
    fun `resolveText returns an exact-key translation for a preferred language`() {
        val obj = textObject(translations = mapOf("es" to "Hola"))
        assertThat(StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("es"))).isEqualTo("Hola")
    }

    @Test
    fun `resolveText matches a preferred language case- and region-insensitively`() {
        val obj = textObject(translations = mapOf("fr" to "Bonjour"))
        assertThat(StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("fr-FR"))).isEqualTo("Bonjour")
    }

    @Test
    fun `resolveText normalizes the translation key too, matching a 3-letter key to a 2-letter preference`() {
        val obj = textObject(translations = mapOf("eng" to "Hi"))
        assertThat(StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("en"))).isEqualTo("Hi")
    }

    @Test
    fun `resolveText prefers an exact key over a normalized sibling`() {
        val obj = textObject(translations = mapOf("pt-BR" to "Ola BR", "pt" to "Ola"))
        // The exact "pt-BR" key wins outright over the normalized "pt" sibling that would also match.
        assertThat(StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("pt-BR"))).isEqualTo("Ola BR")
    }

    @Test
    fun `resolveText follows preferred-language priority, first match wins`() {
        val obj = textObject(translations = mapOf("es" to "Hola", "fr" to "Bonjour"))
        assertThat(
            StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("fr", "es")),
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `resolveText falls back to the original when no preferred language matches`() {
        val obj = textObject(translations = mapOf("de" to "Hallo"))
        assertThat(StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("fr"))).isEqualTo("Hello")
    }

    @Test
    fun `resolveText tries the exploration override FIRST, ahead of the preferred chain`() {
        val obj = textObject(translations = mapOf("es" to "Hola", "fr" to "Bonjour"))
        // Reader prefers fr, but has tapped "es" in the language bar: es wins outright.
        assertThat(
            StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("fr"), overrideLanguage = "es"),
        ).isEqualTo("Hola")
    }

    @Test
    fun `resolveText falls back to the preferred chain when the override has no matching translation`() {
        val obj = textObject(translations = mapOf("fr" to "Bonjour"))
        // Override "de" has no translation, so the normal Prisme chain (fr) still resolves.
        assertThat(
            StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("fr"), overrideLanguage = "de"),
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `resolveText matches the override case- and region-insensitively`() {
        val obj = textObject(translations = mapOf("es" to "Hola"))
        assertThat(
            StoryTextObjectProjection.resolveText(obj, preferredLanguages = emptyList(), overrideLanguage = "ES-MX"),
        ).isEqualTo("Hola")
    }

    @Test
    fun `resolveText resolves the override even when no preferred language is configured`() {
        val obj = textObject(translations = mapOf("es" to "Hola"))
        assertThat(
            StoryTextObjectProjection.resolveText(obj, preferredLanguages = emptyList(), overrideLanguage = "es"),
        ).isEqualTo("Hola")
    }

    @Test
    fun `resolveText with a blank override behaves exactly like no override`() {
        val obj = textObject(translations = mapOf("fr" to "Bonjour"))
        assertThat(
            StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("fr"), overrideLanguage = ""),
        ).isEqualTo("Bonjour")
    }

    @Test
    fun `resolveText returns the original when neither the override nor the chain matches`() {
        val obj = textObject(translations = mapOf("de" to "Hallo"))
        assertThat(
            StoryTextObjectProjection.resolveText(obj, preferredLanguages = listOf("fr"), overrideLanguage = "es"),
        ).isEqualTo("Hello")
    }

    @Test
    fun `project resolves the displayed text through the exploration override`() {
        val wire = StoryTextObject(
            id = "t",
            text = "Hello",
            translations = mapOf("es" to "Hola", "fr" to "Bonjour"),
        )
        val view = StoryTextObjectProjection.project(wire, preferredLanguages = listOf("fr"), overrideLanguage = "es")
        assertThat(view.text).isEqualTo("Hola")
    }

    @Test
    fun `project carries the transform, timing and keyframe fields into the view`() {
        val wire = StoryTextObject(
            id = "t1",
            text = "Hi",
            x = 0.25,
            y = 0.75,
            scale = 1.5,
            rotation = 30.0,
            fontSize = 48.0,
            textColor = "#FF0000",
            textAlign = "left",
            startTime = 1.0,
            duration = 10.0,
            fadeIn = 2.0,
            fadeOut = 0.0,
            keyframes = listOf(
                StoryKeyframe(time = 0f, x = 0.25),
                StoryKeyframe(time = 4f, x = 0.85),
            ),
        )
        val view = StoryTextObjectProjection.project(wire, preferredLanguages = emptyList())
        assertThat(view.id).isEqualTo("t1")
        assertThat(view.x).isEqualTo(0.25)
        assertThat(view.y).isEqualTo(0.75)
        assertThat(view.scale).isEqualTo(1.5)
        assertThat(view.rotation).isEqualTo(30.0)
        assertThat(view.fontSize).isEqualTo(48.0)
        assertThat(view.colorHex).isEqualTo("#FF0000")
        assertThat(view.align).isEqualTo("left")
        assertThat(view.startTime).isEqualTo(1.0)
        assertThat(view.duration).isEqualTo(10.0)
        assertThat(view.fadeIn).isEqualTo(2.0)
        // The keyframes are live, not dropped: the view animates its position across the clip window.
        assertThat(view.keyframes).hasSize(2)
        assertThat(view.animated(atSeconds = 1f).x).isWithin(1e-9).of(0.25)
        assertThat(view.animated(atSeconds = 3f).x).isWithin(1e-9).of(0.55)
    }

    @Test
    fun `project resolves the displayed text through the prisme chain`() {
        val wire = StoryTextObject(id = "t", text = "Hello", translations = mapOf("fr" to "Bonjour"))
        val view = StoryTextObjectProjection.project(wire, preferredLanguages = listOf("fr"))
        assertThat(view.text).isEqualTo("Bonjour")
    }

    @Test
    fun `project defaults absent timing fields to zero`() {
        val wire = StoryTextObject(id = "t", text = "Hello")
        val view = StoryTextObjectProjection.project(wire, preferredLanguages = emptyList())
        assertThat(view.startTime).isEqualTo(0.0)
        assertThat(view.duration).isEqualTo(0.0)
        assertThat(view.fadeIn).isEqualTo(0.0)
        assertThat(view.fadeOut).isEqualTo(0.0)
        assertThat(view.keyframes).isEmpty()
    }

    @Test
    fun `project carries no text backing when the wire object declares none`() {
        val wire = StoryTextObject(id = "t", text = "Hello")
        val view = StoryTextObjectProjection.project(wire, preferredLanguages = emptyList())
        assertThat(view.background).isEqualTo(StoryTextBackground.None)
    }

    @Test
    fun `project resolves a modern glass background style into the view backing`() {
        val wire = StoryTextObject(
            id = "t",
            text = "Hello",
            backgroundStyle = StoryTextBackgroundStyle(type = "glass", radius = 24.0),
        )
        val view = StoryTextObjectProjection.project(wire, preferredLanguages = emptyList())
        assertThat(view.background).isEqualTo(StoryTextBackground.Glass(radius = 24.0))
    }

    @Test
    fun `project resolves a modern solid background style into the view backing`() {
        val wire = StoryTextObject(
            id = "t",
            text = "Hello",
            backgroundStyle = StoryTextBackgroundStyle(type = "solid", hex = "6366F1"),
        )
        val view = StoryTextObjectProjection.project(wire, preferredLanguages = emptyList())
        assertThat(view.background).isEqualTo(StoryTextBackground.Solid(hex = "6366F1"))
    }

    @Test
    fun `project falls back to a legacy textBg hex as a solid backing`() {
        val wire = StoryTextObject(id = "t", text = "Hello", textBg = "112233")
        val view = StoryTextObjectProjection.project(wire, preferredLanguages = emptyList())
        assertThat(view.background).isEqualTo(StoryTextBackground.Solid(hex = "112233"))
    }

    // --- effect (#4870) ---

    @Test
    fun `project carries the text effect, and an absent one is NONE`() {
        val glowing = StoryTextObject(id = "t", text = "Hi", textEffect = "glow")
        assertThat(StoryTextObjectProjection.project(glowing, preferredLanguages = emptyList()).effect)
            .isEqualTo(StoryTextEffect.GLOW)
        assertThat(StoryTextObjectProjection.project(textObject(), preferredLanguages = emptyList()).effect)
            .isEqualTo(StoryTextEffect.NONE)
    }

    @Test
    fun `project decays an unknown effect to NONE rather than failing the slide`() {
        val future = StoryTextObject(id = "t", text = "Hi", textEffect = "effect-from-the-future")
        assertThat(StoryTextObjectProjection.project(future, preferredLanguages = emptyList()).effect)
            .isEqualTo(StoryTextEffect.NONE)
    }
}
