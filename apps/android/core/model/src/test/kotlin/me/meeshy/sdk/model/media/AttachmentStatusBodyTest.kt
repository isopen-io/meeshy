package me.meeshy.sdk.model.media

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import org.junit.Test

class AttachmentStatusBodyTest {
    private val json = Json { ignoreUnknownKeys = true }

    @Test fun `aller-retour avec segments et raison de fin`() {
        val body = AttachmentStatusBody(
            action = "listened", playPositionMs = 4_000, durationMs = 9_000, complete = false,
            stretches = listOf(
                PlaybackStretch(0, 2_000, StretchEnd.SEEK),
                PlaybackStretch(5_000, 9_000, StretchEnd.COMPLETED),
            ),
            language = "fr",
        )
        val text = json.encodeToString(body)
        assertThat(text).contains("\"endedBy\":\"seek\"")
        assertThat(text).contains("\"completed\"")
        assertThat(json.decodeFromString<AttachmentStatusBody>(text)).isEqualTo(body)
    }

    @Test fun `les champs inconnus sont omis`() {
        val text = json.encodeToString(AttachmentStatusBody("viewed", 0, 0, true))
        assertThat(text).doesNotContain("stretches")
        assertThat(text).doesNotContain("language")
    }

    @Test fun `une liste d'ecoutes vide se normalise en null`() {
        val n = AttachmentStatusBody("listened", 0, 1, false, stretches = emptyList()).normalized()
        assertThat(n.stretches).isNull()
    }

    @Test fun `le sink par defaut est inerte`() {
        PlaybackReportSink.Inert.report("a", AttachmentStatusBody("viewed", 0, 0, true))
    }
}
