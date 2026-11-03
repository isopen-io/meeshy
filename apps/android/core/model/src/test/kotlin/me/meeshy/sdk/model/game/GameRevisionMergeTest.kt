package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Test

class GameRevisionMergeTest {

    private val readable = GameBlockFixtures.block()
    private fun cached(revision: Long?) = GameRevisionState(revision, checkNotNull(GameBlockParser.parse(readable)))

    @Test fun `un etat plus ancien que le cache est ignore`() {
        val outcome = GameRevisionMerge.merge(cached(100), incomingRevision = 99, incomingBlock = readable)

        assertThat(outcome).isEqualTo(GameMergeOutcome.Keep)
    }

    @Test fun `un etat de meme revision remplace le cache`() {
        val outcome = GameRevisionMerge.merge(cached(100), incomingRevision = 100, incomingBlock = readable)

        assertThat(outcome).isInstanceOf(GameMergeOutcome.Replace::class.java)
        assertThat((outcome as GameMergeOutcome.Replace).state.revision).isEqualTo(100)
    }

    @Test fun `un etat plus recent remplace le cache et porte sa revision`() {
        val outcome = GameRevisionMerge.merge(cached(100), incomingRevision = 101, incomingBlock = readable)

        assertThat((outcome as GameMergeOutcome.Replace).state.revision).isEqualTo(101)
    }

    @Test fun `un etat sans revision s applique toujours et un cache vide aussi`() {
        assertThat(GameRevisionMerge.merge(cached(100), null, readable)).isInstanceOf(GameMergeOutcome.Replace::class.java)
        assertThat(GameRevisionMerge.merge(null, 5, readable)).isInstanceOf(GameMergeOutcome.Replace::class.java)
    }

    @Test fun `un bloc illisible ou absent se lit null et declenche la relecture`() {
        val broken = buildJsonObject { put("level", "oops") }

        assertThat(GameRevisionMerge.merge(cached(100), 101, broken)).isEqualTo(GameMergeOutcome.Refetch)
        assertThat(GameRevisionMerge.merge(cached(100), 101, null)).isEqualTo(GameMergeOutcome.Refetch)
    }

    @Test fun `un bloc illisible plus ancien que le cache est ignore sans relecture`() {
        val outcome = GameRevisionMerge.merge(cached(100), 50, buildJsonObject { put("level", "oops") })

        assertThat(outcome).isEqualTo(GameMergeOutcome.Keep)
    }

    @Test fun `l evenement game updated se fusionne par sa revision et son bloc`() {
        val event = GameUpdatedEvent(gameRevision = 7, reason = "mint", game = readable)

        assertThat(GameRevisionMerge.merge(cached(8), event)).isEqualTo(GameMergeOutcome.Keep)
        assertThat(GameRevisionMerge.merge(cached(6), event)).isInstanceOf(GameMergeOutcome.Replace::class.java)
    }
}
