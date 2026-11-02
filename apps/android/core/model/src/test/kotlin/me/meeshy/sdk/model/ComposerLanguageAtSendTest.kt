package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.lang.LanguageIdentification
import me.meeshy.sdk.lang.LanguageIdentifying
import org.junit.Test

/**
 * #14502 — un commentaire part TOUJOURS avec une langue, comme iOS (`composerLanguage`, défaut
 * `DefaultComposerLanguage.resolve()`) : la pastille choisie, sinon la détection confiante, sinon ce
 * que la pastille AFFICHE. Le POST ne part plus jamais sans `originalLanguage`.
 */
class ComposerLanguageAtSendTest {

    private val doubtful = LanguageIdentifying { LanguageIdentification("pt", 0.4) }

    @Test
    fun `a manual pick wins over a confident detection`() = runTest {
        val state = ComposerLanguageState().withManualPick("de")

        assertThat(state.atSend("Hello there my dear friend", fallback = "fr", identifier = LanguageIdentifying { LanguageIdentification("en", 0.99) }))
            .isEqualTo("de")
    }

    @Test
    fun `a confident detection is sent when nothing was picked`() = runTest {
        assertThat(
            ComposerLanguageState().atSend("Hello there my dear friend", fallback = "fr", identifier = LanguageIdentifying { LanguageIdentification("en", 0.95) }),
        ).isEqualTo("en")
    }

    @Test
    fun `without a confident detection the language the pill shows is sent, never nothing`() = runTest {
        val state = ComposerLanguageState().onDraftChanged("Bravo receta")

        assertThat(state.atSend("Bravo receta", fallback = "es", identifier = doubtful)).isEqualTo(state.display("es"))
    }

    @Test
    fun `an unavailable identifier still sends the pill's language`() = runTest {
        assertThat(ComposerLanguageState().atSend("ok", fallback = "fr", identifier = LanguageIdentifying.Unavailable)).isEqualTo("fr")
    }

    @Test
    fun `a voice comment without text sends the pill's language`() = runTest {
        assertThat(ComposerLanguageState().atSend("", fallback = "it", identifier = doubtful)).isEqualTo("it")
    }
}
