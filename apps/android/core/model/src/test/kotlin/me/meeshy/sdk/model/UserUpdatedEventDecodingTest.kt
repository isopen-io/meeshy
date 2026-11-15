package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import org.junit.Test

class UserUpdatedEventDecodingTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `banner and avatar decode independently`() {
        val e = json.decodeFromString<UserUpdatedEvent>("""{"userId":"u","changes":{"avatar":null,"banner":"b.png"},"extra":1}""")
        assertThat(e.avatar).isEqualTo(OptionalMediaChange.Replaced(null))
        assertThat(e.banner).isEqualTo(OptionalMediaChange.Replaced("b.png"))
    }
}
