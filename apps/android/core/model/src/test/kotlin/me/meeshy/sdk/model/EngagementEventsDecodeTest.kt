package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import me.meeshy.sdk.model.game.GameBlockFixtures
import me.meeshy.sdk.model.game.GameBlockParser
import me.meeshy.sdk.model.game.GameRevisionState
import me.meeshy.sdk.model.game.GameUpdatedEvent
import org.junit.Test

class EngagementEventsDecodeTest {

    private fun held(revision: Long?) = GameRevisionState(revision, checkNotNull(GameBlockParser.parse(GameBlockFixtures.block())))

    @Test fun `engagement post updated se decode en instantane de points`() {
        val event = EngagementEventDecoder.decode("engagement:post-updated", """{"postId":"p1","viewerPoints":12,"at":1000}""")

        assertThat(event).isEqualTo(EngagementEvent.PostUpdated(PostEngagementSnapshot("p1", 12, 1000)))
    }

    @Test fun `engagement conversation updated se decode et tolere les champs inconnus`() {
        val event = EngagementEventDecoder.decode(
            "engagement:conversation-updated",
            """{"conversationId":"c1","totalPoints":9,"todayPoints":3,"streakDays":2,"day":"2026-11-01","futur":1}""",
        )

        val snapshot = (event as EngagementEvent.ConversationUpdated).snapshot
        assertThat(snapshot.conversationId).isEqualTo("c1")
        assertThat(snapshot.streakDays).isEqualTo(2)
    }

    @Test fun `game updated avec un bloc illisible se lit quand meme`() {
        val event = EngagementEventDecoder.decode("game:updated", """{"gameRevision":5,"reason":"mint","game":"???"}""")

        assertThat((event as EngagementEvent.GameUpdated).event.gameRevision).isEqualTo(5L)
    }

    @Test fun `profile decor updated se decode`() {
        val event = EngagementEventDecoder.decode("profile:decor-updated", """{"userId":"u1"}""")

        assertThat((event as EngagementEvent.ProfileDecorUpdated).event.userId).isEqualTo("u1")
    }

    @Test fun `une charge illisible ou un nom etranger se lit null`() {
        assertThat(EngagementEventDecoder.decode("engagement:post-updated", """{"postId":""}""")).isNull()
        assertThat(EngagementEventDecoder.decode("game:updated", "pas du json")).isNull()
        assertThat(EngagementEventDecoder.decode("message:new", "{}")).isNull()
    }

    @Test fun `une revision plus ancienne est ignoree`() {
        val old = GameUpdatedEvent(gameRevision = 99, game = GameBlockFixtures.block())

        assertThat(GameRealtimeRule.decide(held(100), old)).isEqualTo(GameRealtimeDecision.Ignore)
    }

    @Test fun `une revision plus recente est appliquee`() {
        val newer = GameUpdatedEvent(gameRevision = 101, game = GameBlockFixtures.block())

        val decision = GameRealtimeRule.decide(held(100), newer)

        assertThat((decision as GameRealtimeDecision.Apply).state.revision).isEqualTo(101L)
    }

    @Test fun `un bloc illisible declenche la relecture`() {
        val broken = GameUpdatedEvent(gameRevision = 101, game = buildJsonObject { put("level", "oops") })

        assertThat(GameRealtimeRule.decide(held(100), broken)).isEqualTo(GameRealtimeDecision.Refetch)
        assertThat(GameRealtimeRule.decide(null, GameUpdatedEvent(gameRevision = 1, game = null))).isEqualTo(GameRealtimeDecision.Refetch)
    }
}
