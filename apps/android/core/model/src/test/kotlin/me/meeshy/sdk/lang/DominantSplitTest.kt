package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La langue DOMINANTE d'un lot de lectures et ses exceptions — la forme qu'attend
 * `mark-read`. Miroir de `PrismTranslationLaw.dominantSplit` (iOS) : à égalité, le code
 * alphabétiquement premier gagne, pour que deux exécutions sur les mêmes données donnent le
 * même corps de requête.
 */
class DominantSplitTest {

    @Test
    fun `a tie is broken by the alphabetically first code and the others are exceptions`() {
        val split = dominantSplit(mapOf("m1" to "fr", "m2" to "en", "m3" to "fr", "m4" to "en"))

        assertThat(split.language).isEqualTo("en")
        assertThat(split.exceptions).containsExactly("m1", "fr", "m3", "fr")
    }

    @Test
    fun `the same data in another order gives the same body`() {
        val forward = dominantSplit(linkedMapOf("m1" to "fr", "m2" to "en", "m3" to "fr", "m4" to "en"))
        val reverse = dominantSplit(linkedMapOf("m4" to "en", "m3" to "fr", "m2" to "en", "m1" to "fr"))

        assertThat(reverse).isEqualTo(forward)
    }

    @Test
    fun `the majority language is dominant and the minority are the exceptions`() {
        val split = dominantSplit(mapOf("m1" to "fr", "m2" to "fr", "m3" to "es"))

        assertThat(split.language).isEqualTo("fr")
        assertThat(split.exceptions).containsExactly("m3", "es")
    }

    @Test
    fun `a single language has no exception`() {
        val split = dominantSplit(mapOf("m1" to "fr", "m2" to "fr"))

        assertThat(split.language).isEqualTo("fr")
        assertThat(split.exceptions).isEmpty()
    }

    @Test
    fun `an empty batch has no language`() {
        val split = dominantSplit(emptyMap())

        assertThat(split.language).isNull()
        assertThat(split.exceptions).isEmpty()
    }

    @Test
    fun `a count beats the alphabet`() {
        val split = dominantSplit(mapOf("m1" to "es", "m2" to "fr", "m3" to "fr"))

        assertThat(split.language).isEqualTo("fr")
        assertThat(split.exceptions).containsExactly("m1", "es")
    }
}
