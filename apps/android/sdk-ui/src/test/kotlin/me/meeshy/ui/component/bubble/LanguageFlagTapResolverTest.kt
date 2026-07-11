package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import me.meeshy.ui.component.bubble.LanguageFlagTapResolver.Result
import me.meeshy.sdk.lang.LanguageResolver
import org.junit.Test

private data class Tr(
    override val targetLanguage: String,
    override val translatedContent: String,
) : LanguageResolver.TranslationLike

class LanguageFlagTapResolverTest {

    private val translations = listOf(
        Tr("fr", "Bonjour"),
        Tr("es", "Hola"),
    )

    @Test
    fun `tapping a translation that is not active activates it`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "es",
            activeCode = "fr",
            originalLanguage = "en",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.Activate("es"))
    }

    @Test
    fun `tapping the original language activates the original`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "en",
            activeCode = "fr",
            originalLanguage = "en",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.Activate("en"))
    }

    @Test
    fun `tapping the already-active language reverts to the default Prisme resolution`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "es",
            activeCode = "es",
            originalLanguage = "en",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.Revert)
    }

    @Test
    fun `tapping the active original reverts`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "en",
            activeCode = "en",
            originalLanguage = "en",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.Revert)
    }

    @Test
    fun `tapping a language with no content requests a translation`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "de",
            activeCode = "fr",
            originalLanguage = "en",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.RequestTranslation("de"))
    }

    @Test
    fun `a translation present but blank counts as no content`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "de",
            activeCode = "fr",
            originalLanguage = "en",
            translations = translations + Tr("de", "   "),
        )

        assertThat(result).isEqualTo(Result.RequestTranslation("de"))
    }

    @Test
    fun `codes are matched case-insensitively and trimmed`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "  ES ",
            activeCode = "FR",
            originalLanguage = "EN",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.Activate("es"))
    }

    @Test
    fun `tapping the active language reverts even under case and whitespace differences`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = " ES ",
            activeCode = "es",
            originalLanguage = "en",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.Revert)
    }

    @Test
    fun `a blank tapped code is inert`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "   ",
            activeCode = "fr",
            originalLanguage = "en",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.None)
    }

    @Test
    fun `activating a translation with no current override treats a null active as not-yet-active`() {
        val result = LanguageFlagTapResolver.resolve(
            tappedCode = "es",
            activeCode = null,
            originalLanguage = "en",
            translations = translations,
        )

        assertThat(result).isEqualTo(Result.Activate("es"))
    }
}
