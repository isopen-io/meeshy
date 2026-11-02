package me.meeshy.app.chat.river

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.reading.river.RiverConversationMapping
import me.meeshy.sdk.model.reading.river.RiverCursor
import me.meeshy.sdk.model.reading.river.RiverNavigation
import me.meeshy.sdk.model.reading.river.RiverStepReason
import org.junit.Test

class RiverThreadMappingTest {

    private val voices = listOf(
        riverBubble("m1", "alice", 0),
        riverBubble("m2", "bob", 1),
        riverBubble("m3", "me", 2, outgoing = true),
        riverBubble("m4", "dina", 3),
        riverBubble("m5", "eve", 4),
    )

    @Test
    fun `le lecteur est l'auteur de son premier message sortant, et personne sans message sortant`() {
        assertThat(RiverThreadMapping.viewerId(voices)).isEqualTo("me")
        assertThat(RiverThreadMapping.viewerId(voices.filterNot { it.isOutgoing })).isEmpty()
    }

    @Test
    fun `un message sans instant lisible n'a pas de rang`() {
        val broken = voices[0].copy(createdAtIso = null)
        val geometry = RiverThreadMapping.geometry(listOf(broken) + voices.drop(1))
        assertThat(geometry.bubbles.map { it.messageId }).doesNotContain("m1")
    }

    @Test
    fun `un message supprime n'occupe aucun rang, un avis occupe le sien sans etre la voix de personne`() {
        val geometry = RiverThreadMapping.geometry(
            voices + riverBubble("gone", "bob", 5, deleted = true) + riverBubble("sys", "alice", 6, system = true),
        )
        assertThat(geometry.bubbles.map { it.messageId }).doesNotContain("gone")
        assertThat(geometry.bubbles.first { it.messageId == "sys" }.isSystem).isTrue()
    }

    @Test
    fun `la premiere geometrie peuplee pose le curseur au present et recadre`() {
        val empty = RiverThreadMapping.geometry(emptyList())
        val populated = RiverThreadMapping.geometry(voices)

        val verdict = RiverReconciler.reconcile(empty, RiverNavigation(RiverCursor(0, 0)), populated)

        assertThat(verdict.reland).isTrue()
        assertThat(verdict.navigation.cursor).isEqualTo(RiverConversationMapping.initialCursor(populated))
        assertThat(RiverConversationMapping.isAtPresent(verdict.navigation.cursor, populated)).isTrue()
        assertThat(verdict.navigation.lastReason).isEqualTo(RiverStepReason.MOVED)
    }

    @Test
    fun `un message qui arrive en bout ne ramene jamais un lecteur remonte dans l'histoire au present`() {
        val before = RiverThreadMapping.geometry(voices)
        val reader = RiverNavigation(RiverCursor(before.bubbles[1].laneIndex, 1))

        val after = RiverThreadMapping.geometry(voices + riverBubble("m6", "alice", 5))
        val verdict = RiverReconciler.reconcile(before, reader, after)

        assertThat(verdict.reland).isFalse()
        assertThat(verdict.navigation).isEqualTo(reader)
    }

    @Test
    fun `quand le reseau prefixe l'histoire, le curseur reste sur son MESSAGE et le volet le recadre`() {
        val before = RiverThreadMapping.geometry(voices)
        val onM3 = before.bubbles.first { it.messageId == "m3" }
        val reader = RiverNavigation(RiverCursor(onM3.laneIndex, onM3.rank))

        val older = listOf(riverBubble("o1", "alice", -20), riverBubble("o2", "bob", -10))
        val after = RiverThreadMapping.geometry(older + voices)
        val verdict = RiverReconciler.reconcile(before, reader, after)

        val m3After = after.bubbles.first { it.messageId == "m3" }
        assertThat(m3After.rank).isNotEqualTo(onM3.rank)
        assertThat(verdict.navigation.cursor).isEqualTo(RiverCursor(m3After.laneIndex, m3After.rank))
        assertThat(verdict.reland).isTrue()
    }
}
