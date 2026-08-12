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
    fun `includeTranslatable surfaces a configured language without content as a translatable chip`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = StripPrefs(
                systemLanguage = "fr",
                customDestinationLanguage = "de",
            ),
            showingOriginal = false,
            includeTranslatable = true,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "fr", "de").inOrder()
        val de = chips.single { it.code == "de" }
        assertThat(de.isTranslatable).isTrue()
    }

    @Test
    fun `a translatable chip is never active or original`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = StripPrefs(
                systemLanguage = "fr",
                customDestinationLanguage = "de",
            ),
            showingOriginal = false,
            includeTranslatable = true,
        )

        val de = chips.single { it.code == "de" }
        assertThat(de.isActive).isFalse()
        assertThat(de.isOriginal).isFalse()
    }

    @Test
    fun `content configured languages are not marked translatable`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(
                Translation("fr", "Bonjour"),
                Translation("es", "Hola"),
            ),
            preferences = StripPrefs(
                systemLanguage = "fr",
                regionalLanguage = "es",
                customDestinationLanguage = "de",
            ),
            showingOriginal = false,
            includeTranslatable = true,
        )

        assertThat(chips.single { it.code == "fr" }.isTranslatable).isFalse()
        assertThat(chips.single { it.code == "es" }.isTranslatable).isFalse()
        assertThat(chips.single { it.code == "de" }.isTranslatable).isTrue()
    }

    @Test
    fun `content and translatable chips interleave in configured preference order`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("es", "Hola")),
            preferences = StripPrefs(
                systemLanguage = "de",
                regionalLanguage = "es",
                customDestinationLanguage = "it",
            ),
            showingOriginal = false,
            includeTranslatable = true,
        )

        assertThat(chips.map { it.code }).containsExactly("en", "de", "es", "it").inOrder()
        assertThat(chips.single { it.code == "de" }.isTranslatable).isTrue()
        assertThat(chips.single { it.code == "es" }.isTranslatable).isFalse()
        assertThat(chips.single { it.code == "it" }.isTranslatable).isTrue()
    }

    @Test
    fun `an active-code override never activates a translatable chip`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = StripPrefs(
                systemLanguage = "fr",
                customDestinationLanguage = "de",
            ),
            showingOriginal = false,
            activeCodeOverride = "de",
            includeTranslatable = true,
        )

        // A translatable chip can never be the active display, even when the
        // override names it directly — the strip marks nothing active rather than
        // highlighting a content-less language (the builder drops such an override
        // upstream, so production never reaches this state; the strip stays honest).
        assertThat(chips.single { it.code == "de" }.isActive).isFalse()
        assertThat(chips.none { it.isActive }).isTrue()
    }

    @Test
    fun `the original chip is never marked translatable even without a translation to it`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "de",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = StripPrefs(
                systemLanguage = "fr",
                customDestinationLanguage = "de",
            ),
            showingOriginal = false,
            includeTranslatable = true,
        )

        val de = chips.single { it.code == "de" }
        assertThat(de.isOriginal).isTrue()
        assertThat(de.isTranslatable).isFalse()
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
    fun `an active-code override moves the active marker to a third language`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(
                Translation("fr", "Bonjour"),
                Translation("es", "Hola"),
            ),
            preferences = StripPrefs(systemLanguage = "fr", regionalLanguage = "es"),
            showingOriginal = false,
            activeCodeOverride = "es",
        )

        assertThat(chips.single { it.code == "es" }.isActive).isTrue()
        assertThat(chips.single { it.code == "fr" }.isActive).isFalse()
        assertThat(chips.single { it.code == "en" }.isActive).isFalse()
    }

    @Test
    fun `an active-code override is normalized before matching a chip`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = french,
            showingOriginal = false,
            activeCodeOverride = " EN ",
        )

        assertThat(chips.single { it.code == "en" }.isActive).isTrue()
        assertThat(chips.single { it.code == "fr" }.isActive).isFalse()
    }

    @Test
    fun `a null active-code override falls back to the showing-original computation`() {
        val chips = MessageLanguageStrip.build(
            originalLanguage = "en",
            translations = listOf(Translation("fr", "Bonjour")),
            preferences = french,
            showingOriginal = true,
            activeCodeOverride = null,
        )

        assertThat(chips.single { it.code == "en" }.isActive).isTrue()
        assertThat(chips.single { it.code == "fr" }.isActive).isFalse()
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
