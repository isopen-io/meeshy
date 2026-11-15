package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

class AttachmentStatusUserTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `une ligne de statut dit qui a lu et ecoute`() {
        val u = json.decodeFromString<AttachmentStatusUser>(
            """{"participantId":"p1","username":"ana","listenedAt":"2026-10-01T10:00:00Z","listenCount":3,"listenedComplete":true,"extra":1}""",
        )
        assertThat(u.id).isEqualTo("p1")
        assertThat(u.listenCount).isEqualTo(3)
        assertThat(u.listenedComplete).isTrue()
        assertThat(u.viewCount).isNull()
        assertThat(u.watchedAt).isNull()
    }

    @Test
    fun `une transcription forcee porte force true`() {
        assertThat(json.encodeToString(TranscribeRequest(force = true))).isEqualTo("""{"force":true}""")
    }

    @Test
    fun `une transcription non forcee porte force false`() {
        assertThat(Json { encodeDefaults = false }.encodeToString(TranscribeRequest(false))).isEqualTo("""{"force":false}""")
    }
}
