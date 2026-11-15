package me.meeshy.sdk.conversation

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.MessageTranslationsPayload
import org.junit.Test

class MessageTranslationsFetcherTest {

    private fun fetcher(payload: MessageTranslationsPayload?, stored: MutableList<Triple<String, String, String>>) =
        MessageTranslationsFetcher(
            read = { payload },
            store = { id, language, text -> stored += Triple(id, language, text) },
        )

    @Test
    fun `every usable translation read is stored under its message`() = runTest {
        val stored = mutableListOf<Triple<String, String, String>>()
        val payload = MessageTranslationsPayload(
            listOf(MessageTranslationsPayload.Item("FR", "Bonjour"), MessageTranslationsPayload.Item("es", "Hola")),
        )

        val count = fetcher(payload, stored).fetch("m1")

        assertThat(count).isEqualTo(2)
        assertThat(stored).containsExactly(Triple("m1", "fr", "Bonjour"), Triple("m1", "es", "Hola"))
    }

    @Test
    fun `a failed read stores nothing and says zero`() = runTest {
        val stored = mutableListOf<Triple<String, String, String>>()

        assertThat(fetcher(null, stored).fetch("m1")).isEqualTo(0)
        assertThat(stored).isEmpty()
    }
}
