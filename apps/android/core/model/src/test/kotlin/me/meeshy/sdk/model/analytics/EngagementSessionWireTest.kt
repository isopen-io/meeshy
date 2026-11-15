package me.meeshy.sdk.model.analytics

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

class EngagementSessionWireTest {

    private val json = Json { encodeDefaults = false; ignoreUnknownKeys = true; explicitNulls = false }

    @Test
    fun `une session avec actions et echantillons fait l'aller-retour`() {
        val session = EngagementSession(
            sessionId = "s", userId = "u", postId = "p", contentType = EngagementSession.ContentType.STORY,
            surface = EngagementSession.Surface.storyViewer, startedAt = 1_757_928_860_123L, dwellMs = 4_000,
            watchMs = 3_500, mediaDurationMs = 9_000, completed = true, truncated = false, consent = "granted",
            actions = listOf(EngagementAction(EngagementAction.ActionType.reacted, 800), EngagementAction(EngagementAction.ActionType.swipedAway, 3_900)),
            watchSamples = listOf(WatchSample(0, 0), WatchSample(2_000, 2_000)),
        )
        val text = json.encodeToString(EngagementSession.serializer(), session)
        assertThat(text).contains(""""startedAt":"2025-09-15T09:34:20.123Z"""")
        assertThat(text).contains(""""contentType":"STORY"""")
        assertThat(text).contains(""""surface":"storyViewer"""")
        assertThat(text).contains(""""type":"reacted"""")
        assertThat(json.decodeFromString(EngagementSession.serializer(), text)).isEqualTo(session)
    }

    @Test
    fun `completed et truncated sont ecrits meme a leur valeur par defaut`() {
        val session = EngagementSession("s", "u", "p", EngagementSession.ContentType.POST, EngagementSession.Surface.detail, 0, 1, consent = "denied")
        val text = Json { encodeDefaults = false }.encodeToString(EngagementSession.serializer(), session)
        assertThat(text).contains(""""actions":[]""")
        assertThat(text).contains(""""completed":false""")
    }
}
