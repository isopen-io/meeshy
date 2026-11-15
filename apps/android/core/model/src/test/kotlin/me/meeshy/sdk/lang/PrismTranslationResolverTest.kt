package me.meeshy.sdk.lang

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * La descente du Prisme (miroir de `PrismTranslationResolver.swift` et de
 * `resolvePrismTranslation` TS). Les cas partagés avec les deux autres plateformes sont
 * rejoués par [PrismTranslationVectorParityTest] ; ce fichier tient ce que le fichier de
 * vecteurs exclut ou ne dit pas : le départage de deux clés de même langue canonique, le
 * médium générique, et les témoins de RANG écrits sur un rang autre que le premier.
 */
class PrismTranslationResolverTest {

    private fun texts(vararg entries: Pair<String, String>): Map<String, String> =
        linkedMapOf(*entries)

    private fun resolve(
        translations: Map<String, String>,
        originalLanguage: String?,
        vararg prism: String,
    ): PrismTranslation? = PrismTranslationResolver.resolve(
        originalLanguage = originalLanguage,
        translations = translations,
        preferredLanguages = prism.toList(),
    )

    // --- la langue d'origine concourt à son RANG, jamais en court-circuit ---

    @Test
    fun `a message written in the primary language stays original even with a lower-rank translation`() {
        val served = resolve(texts("en" to "Hello"), originalLanguage = "fr", "fr", "en")
        assertThat(served).isNull()
    }

    @Test
    fun `a message written in the secondary language is served in the primary one when translated`() {
        val served = resolve(texts("fr" to "Bonjour"), originalLanguage = "en", "fr", "en")
        assertThat(served).isEqualTo(PrismTranslation(language = "fr", text = "Bonjour"))
    }

    @Test
    fun `the original language beats a translation that ranks BELOW it, on a rank other than the first`() {
        // Témoin de rang : au rang 1 le court-circuit interdit et la règle juste rendent
        // le même verdict. L'origine est ici au rang 2, la traduction au rang 3.
        val served = resolve(texts("it" to "Ciao"), originalLanguage = "en", "de", "en", "it")
        assertThat(served).isNull()
    }

    @Test
    fun `a translation ranked ABOVE the original language wins over it`() {
        val served = resolve(texts("de" to "Hallo"), originalLanguage = "en", "de", "en")
        assertThat(served).isEqualTo(PrismTranslation(language = "de", text = "Hallo"))
    }

    @Test
    fun `a region-tagged original competes at its canonical rank`() {
        assertThat(resolve(texts("fr" to "Bonjour"), originalLanguage = "en-US", "en", "fr")).isNull()
    }

    // --- jamais translations.first ---

    @Test
    fun `no translation at any reader rank and a foreign origin serves the original`() {
        assertThat(resolve(texts("es" to "Hola", "it" to "Ciao"), originalLanguage = "en", "de")).isNull()
    }

    @Test
    fun `no translation at any reader rank and an unknown origin serves the original`() {
        assertThat(resolve(texts("es" to "Hola"), originalLanguage = null, "de", "fr")).isNull()
    }

    @Test
    fun `an empty prism serves the original whatever the translations`() {
        assertThat(resolve(texts("es" to "Hola"), originalLanguage = "en")).isNull()
    }

    @Test
    fun `an unknown original does not stop the descent`() {
        val served = resolve(texts("fr" to "Bonjour"), originalLanguage = null, "fr")
        assertThat(served).isEqualTo(PrismTranslation(language = "fr", text = "Bonjour"))
    }

    // --- clés canoniques, région-aveugles ---

    @Test
    fun `pt-BR and pt compare by the same canonical key, in both directions`() {
        assertThat(resolve(texts("pt" to "Olá"), originalLanguage = "en", "pt-BR"))
            .isEqualTo(PrismTranslation(language = "pt", text = "Olá"))
        assertThat(resolve(texts("pt-BR" to "Olá"), originalLanguage = "en", "pt"))
            .isEqualTo(PrismTranslation(language = "pt-BR", text = "Olá"))
    }

    @Test
    fun `en-US and en compare by the same canonical key`() {
        assertThat(resolve(texts("fr" to "Bonjour"), originalLanguage = "en-US", "en", "fr")).isNull()
        assertThat(resolve(texts("fr" to "Bonjour"), originalLanguage = "en", "en-US", "fr")).isNull()
    }

    @Test
    fun `the served language is the STORED key, never its canonical form`() {
        val served = resolve(texts("fr_FR" to "Bonjour"), originalLanguage = "en", "fr")
        assertThat(served?.language).isEqualTo("fr_FR")
    }

    // --- départage déterministe de deux clés de même langue canonique ---

    @Test
    fun `two keys of the same canonical language are tied by the canonical form first`() {
        val forward = resolve(texts("fr-CA" to "Allô", "fr" to "Bonjour"), originalLanguage = "en", "fr")
        val reverse = resolve(texts("fr" to "Bonjour", "fr-CA" to "Allô"), originalLanguage = "en", "fr")
        assertThat(forward).isEqualTo(PrismTranslation(language = "fr", text = "Bonjour"))
        assertThat(reverse).isEqualTo(forward)
    }

    @Test
    fun `two non-canonical keys of the same language are tied lexically, whatever the insertion order`() {
        val forward = resolve(texts("fr-CA" to "Allô", "fr-BE" to "Bonjour"), originalLanguage = "en", "fr")
        val reverse = resolve(texts("fr-BE" to "Bonjour", "fr-CA" to "Allô"), originalLanguage = "en", "fr")
        assertThat(forward).isEqualTo(PrismTranslation(language = "fr-BE", text = "Bonjour"))
        assertThat(reverse).isEqualTo(forward)
    }

    @Test
    fun `an empty entry never wins the tie, the servable one takes the key`() {
        val served = resolve(texts("fr" to "  ", "fr-CA" to "Allô"), originalLanguage = "en", "fr")
        assertThat(served).isEqualTo(PrismTranslation(language = "fr-CA", text = "Allô"))
    }

    // --- une traduction vide est sautée ---

    @Test
    fun `a blank translation is skipped and its rank falls through to the next language`() {
        val served = resolve(texts("fr" to "   ", "es" to "Hola"), originalLanguage = "en", "fr", "es")
        assertThat(served).isEqualTo(PrismTranslation(language = "es", text = "Hola"))
    }

    @Test
    fun `a blank translation alone serves the original`() {
        assertThat(resolve(texts("fr" to ""), originalLanguage = "en", "fr")).isNull()
    }

    // --- le médium générique ---

    private data class Track(val postMediaId: String, val durationMs: Int)

    @Test
    fun `the generic descent serves a non-text value and keeps the raw language key`() {
        val tracks = listOf(
            PrismCandidate(language = "de", value = Track("m-de", 1_000)),
            PrismCandidate(language = "pt-BR", value = Track("m-pt", 2_000)),
        )
        val served = PrismTranslationResolver.resolve(
            originalLanguage = "en",
            candidates = tracks,
            preferredLanguages = listOf("es", "pt"),
            isServable = { it.durationMs > 0 },
        )
        assertThat(served).isEqualTo(PrismCandidate("pt-BR", Track("m-pt", 2_000)))
    }

    @Test
    fun `the generic descent lets each medium decide what servable means`() {
        val tracks = listOf(
            PrismCandidate(language = "fr", value = Track("m-fr", 0)),
            PrismCandidate(language = "es", value = Track("m-es", 500)),
        )
        val served = PrismTranslationResolver.resolve(
            originalLanguage = "en",
            candidates = tracks,
            preferredLanguages = listOf("fr", "es"),
            isServable = { it.durationMs > 0 },
        )
        assertThat(served?.language).isEqualTo("es")
    }

    @Test
    fun `the generic descent honours the original language at its rank`() {
        val tracks = listOf(PrismCandidate(language = "es", value = Track("m-es", 500)))
        val served = PrismTranslationResolver.resolve(
            originalLanguage = "fr",
            candidates = tracks,
            preferredLanguages = listOf("fr", "es"),
            isServable = { true },
        )
        assertThat(served).isNull()
    }

    @Test
    fun `the text projection of a candidate list agrees with the map projection`() {
        val map = texts("pt-BR" to "Olá", "es" to "Hola")
        val fromMap = resolve(map, originalLanguage = "en", "de", "pt")
        val fromList = PrismTranslationResolver.resolve(
            originalLanguage = "en",
            candidates = map.map { (language, text) -> PrismCandidate(language, text) },
            preferredLanguages = listOf("de", "pt"),
        )
        assertThat(fromList).isEqualTo(fromMap)
    }

    @Test
    fun `no candidates serves the original`() {
        val served = PrismTranslationResolver.resolve(
            originalLanguage = "en",
            candidates = emptyList<PrismCandidate<String>>(),
            preferredLanguages = listOf("fr"),
        )
        assertThat(served).isNull()
    }
}
