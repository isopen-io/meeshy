package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import retrofit2.http.Headers

class MessageSearchCapsHeaderTest {

    private fun headersOf(name: String): List<String> =
        MessageApi::class.java.methods
            .filter { it.name == name }
            .flatMap { method -> method.getAnnotation(Headers::class.java)?.value?.toList().orEmpty() }

    @Test
    fun `the unified message search declares that this client veils a blurred hit and paints a transcript`() {
        assertThat(headersOf("searchAll")).containsExactly("X-Search-Caps: 1")
    }
}
