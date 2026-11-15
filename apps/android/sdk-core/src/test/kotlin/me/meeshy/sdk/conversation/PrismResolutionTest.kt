package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PrismResolutionTest {

    private class Prefs(
        override val systemLanguage: String? = null,
        override val regionalLanguage: String? = null,
        override val customDestinationLanguage: String? = null,
        override val deviceLocale: String? = null,
    ) : LanguageResolver.ContentLanguagePreferences

    private fun message() = ApiMessage(
        id = "m1",
        conversationId = "c1",
        content = "Hello",
        originalLanguage = "en",
        translations = listOf(
            ApiTextTranslation(targetLanguage = "es", translatedContent = "Hola"),
            ApiTextTranslation(targetLanguage = "de", translatedContent = "Hallo"),
        ),
    )

    private suspend fun reread(harness: MessageCollaboratorHarness) =
        harness.database.messageDao().find("m1")!!.toLocalMessage()

    @Test
    fun `l'original est servi quand aucune traduction ne correspond, jamais la premiere`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val served = reread(harness).displayContent(Prefs(systemLanguage = "fr"))

        assertThat(served).isEqualTo("Hello")
    }

    @Test
    fun `la traduction du rang le plus haut qui existe est servie apres relecture`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val served = reread(harness).displayContent(Prefs(systemLanguage = "fr", regionalLanguage = "de", deviceLocale = "es-ES"))

        assertThat(served).isEqualTo("Hallo")
    }

    @Test
    fun `la locale appareil entre en quatrieme rang`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val served = reread(harness).displayContent(Prefs(systemLanguage = "fr", deviceLocale = "es-ES"))

        assertThat(served).isEqualTo("Hola")
    }

    @Test
    fun `la langue d'origine concourt a son rang et ne court-circuite pas`() = runHarnessTest { harness ->
        harness.seedSynced(message())

        val served = reread(harness).displayContent(Prefs(systemLanguage = "es", regionalLanguage = "en"))

        assertThat(served).isEqualTo("Hola")
    }
}
