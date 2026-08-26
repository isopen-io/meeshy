package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * `opening` / `closing` arrivent sous DEUX formes sur le fil, et Android n'en
 * acceptait qu'une.
 *
 * Une transition écrite par un client natif est une CHAÎNE (`"fade"`) ; celle
 * que produit le convertisseur de la passerelle est un OBJET
 * (`{"type":"fade"}`), au vocabulaire plus large que l'enum
 * (`storyEffectsV3.ts:230` ne la transporte que sous cette forme). iOS décode
 * les deux depuis toujours et documente la tolérance
 * (`StoryModels.swift:1864-1867`).
 *
 * Android typait le champ en enum nu. La conséquence dépassait la transition :
 * kotlinx échoue sur le DOCUMENT entier, donc un post parfaitement lisible
 * disparaissait avec tout ce qui l'entourait. Une forme inconnue doit valoir
 * `null` — jamais une exception.
 */
class StoryTransitionToleranceTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private fun decode(raw: String): StoryEffects =
        json.decodeFromString(StoryEffects.serializer(), raw)

    @Test
    fun `la forme chaine des clients natifs decode`() {
        val effects = decode("""{ "opening": "fade", "closing": "zoom" }""")

        assertThat(effects.opening).isEqualTo(StoryTransitionEffect.FADE)
        assertThat(effects.closing).isEqualTo(StoryTransitionEffect.ZOOM)
    }

    @Test
    fun `la forme objet de la passerelle decode aussi`() {
        val effects = decode("""{ "opening": { "type": "fade" }, "closing": { "type": "zoom" } }""")

        assertThat(effects.opening).isEqualTo(StoryTransitionEffect.FADE)
        assertThat(effects.closing).isEqualTo(StoryTransitionEffect.ZOOM)
    }

    /**
     * Le vocabulaire de la passerelle est plus large que l'enum client : une
     * transition qu'Android ne connaît pas ne doit coûter QUE cette transition.
     */
    @Test
    fun `une transition inconnue vaut null sans emporter le document`() {
        val effects = decode("""{ "opening": { "type": "kenBurns" }, "background": "color:#000" }""")

        assertThat(effects.opening).isNull()
        assertThat(effects.background).isEqualTo("color:#000")
    }

    @Test
    fun `une chaine inconnue vaut null sans emporter le document`() {
        val effects = decode("""{ "opening": "kenBurns", "background": "color:#000" }""")

        assertThat(effects.opening).isNull()
        assertThat(effects.background).isEqualTo("color:#000")
    }

    @Test
    fun `l absence de transition reste absente`() {
        val effects = decode("""{ "background": "color:#000" }""")

        assertThat(effects.opening).isNull()
        assertThat(effects.closing).isNull()
    }
}
