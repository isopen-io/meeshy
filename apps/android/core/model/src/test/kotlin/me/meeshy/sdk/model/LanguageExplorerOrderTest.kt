package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

class LanguageExplorerOrderTest {

    private data class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun info(code: String) = LanguageInfo(code, code, code, "", "000000")

    private val candidates = listOf("en", "fr", "es", "de", "pt").map(::info)

    private fun order(prefs: Prefs, original: String? = null, pool: List<LanguageInfo> = candidates) =
        LanguageExplorerOrder.of(original, prefs, pool)

    @Test
    fun `the configured languages lead in prism rank order then the candidates follow`() {
        val codes = order(Prefs(systemLanguage = "de", regionalLanguage = "es"))
        assertThat(codes).containsExactly("de", "es", "en", "fr", "pt").inOrder()
    }

    @Test
    fun `the custom destination ranks after the regional language`() {
        val codes = order(Prefs(systemLanguage = "pt", regionalLanguage = "fr", customDestinationLanguage = "es"))
        assertThat(codes.take(3)).containsExactly("pt", "fr", "es").inOrder()
    }

    @Test
    fun `the original language never gets a row`() {
        val codes = order(Prefs(systemLanguage = "fr"), original = "fr")
        assertThat(codes).doesNotContain("fr")
        assertThat(codes.first()).isEqualTo("en")
    }

    @Test
    fun `a configured language outside the candidate pool still gets its row at its rank`() {
        val codes = order(Prefs(systemLanguage = "ja"))
        assertThat(codes.first()).isEqualTo("ja")
        assertThat(codes).containsNoDuplicates()
    }

    @Test
    fun `without preferences the candidate order is kept and no default language is invented`() {
        assertThat(order(Prefs())).containsExactly("en", "fr", "es", "de", "pt").inOrder()
        assertThat(order(Prefs(), pool = emptyList())).isEmpty()
    }

    @Test
    fun `codes are trimmed and lowercased and duplicates collapse to their first rank`() {
        val codes = order(Prefs(systemLanguage = " ES ", regionalLanguage = "es"), original = " EN ")
        assertThat(codes).containsExactly("es", "fr", "de", "pt").inOrder()
    }

    @Test
    fun `an unconfigured viewer is offered the same list as the full common-first table`() {
        val codes = LanguageExplorerOrder.of("en", Prefs(), LanguageData.allLanguagesCommonFirst)
        assertThat(codes).containsNoDuplicates()
        assertThat(codes).doesNotContain("en")
        assertThat(codes.size).isAtLeast(18)
    }
}
