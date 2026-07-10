package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

private data class StripPrefs(
    override val systemLanguage: String?,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences

private data class Translation(
    override val targetLanguage: String,
    override val translatedContent: String,
) : LanguageResolver.TranslationLike

class MessageLanguageStripTest {

    private val french = StripPrefs(systemLanguage = "fr")

    @Test
    fun `no strip when the message has no translations`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = emptyList(),
            preferences = french,
            showingOriginal = false,
        )

        assertThat(chips).isEmpty()
    }

    @Test
    fun `no strip when translations exist but none targets a preferred language`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("es", "Hola")),
            preferences = french,
            showingOriginal = false,
        )

        assertThat(chips).isEmpty()
    }

    @Test
    fun `translated strip has original chip then the active preferred chip`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = french,
            showingOriginal = false,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr").inOrder()
        val original = chips.single { it.code == "en" }
        val preferred = chips.single { it.code == "fr" }
        assertThat(original.isOriginal).isTrue()
        assertThat(original.isActive).isFalse()
        assertThat(preferred.isOriginal).isFalse()
        assertThat(preferred.isActive).isTrue()
    }

    @Test
    fun `showing original moves the active marker to the original chip`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = french,
            showingOriginal = true,
        )

        assertThat(chips.single { it.code == "en" }.isActive).isTrue()
        assertThat(chips.single { it.code == "fr" }.isActive).isFalse()
    }

    @Test
    fun `each chip carries its LanguageData metadata`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = french,
            showingOriginal = false,
        )

        val fr = chips.single { it.code == "fr" }
        assertThat(fr.info?.flag).isEqualTo("🇫🇷")
        assertThat(fr.info?.nativeName).isEqualTo("Francais")
    }

    @Test
    fun `an unknown original code still yields a chip with null metadata`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "xx",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = french,
            showingOriginal = false,
        )

        val exotic = chips.single { it.code == "xx" }
        assertThat(exotic.info).isNull()
        assertThat(exotic.isOriginal).isTrue()
    }

    @Test
    fun `codes are normalized to trimmed lowercase`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = " EN ",
            translations = listOf(Translation("FR", "Bonjour")),
            preferences = StripPrefs(systemLanguage = "FR"),
            showingOriginal = false,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr").inOrder()
    }

    @Test
    fun `regional and custom languages with translations extend the strip in order`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(
                Translation("fr", "Bonjour"),
                Translation("es", "Hola"),
            ),
            preferences = StripPrefs(
                systemLanguage = "fr",
                regionalLanguage = "es",
            ),
            showingOriginal = false,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr", "es").inOrder()
        assertThat(chips.single { it.code == "fr" }.isActive).isTrue()
    }

    @Test
    fun `a configured language without a translation is not added to the strip`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = StripPrefs(
                systemLanguage = "fr",
                customDestinationLanguage = "de",
            ),
            showingOriginal = false,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr").inOrder()
    }

    @Test
    fun `the original chip is not duplicated when it is also a preferred language`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = StripPrefs(
                systemLanguage = "fr",
                regionalLanguage = "en",
            ),
            showingOriginal = false,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr").inOrder()
        assertThat(chips.count { it.code == "en" }).isEqualTo(1)
    }

    @Test
    fun `a blank-content translation is not treated as available content`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "   ")),
            preferences = french,
            showingOriginal = false,
        )

        assertThat(chips).isEmpty()
    }

    @Test
    fun `a blank original still surfaces the active translation chip`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "   ",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = french,
            showingOriginal = false,
        )

        assertThat(chips.map { it.code }).containsExactly("fr")
        val fr = chips.single()
        assertThat(fr.isOriginal).isFalse()
        assertThat(fr.isActive).isTrue()
    }

    @Test
    fun `exactly one chip is active in the translated strip`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(
                Translation("fr", "Bonjour"),
                Translation("es", "Hola"),
            ),
            preferences = StripPrefs(systemLanguage = "fr", regionalLanguage = "es"),
            showingOriginal = false,
        )

        assertThat(chips.count { it.isActive }).isEqualTo(1)
    }
}
