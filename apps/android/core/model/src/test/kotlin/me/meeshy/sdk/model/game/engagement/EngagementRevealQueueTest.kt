package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EngagementRevealQueueTest {

    private val a = EngagementReveal.Achievement(EngagementAchievementKey.EDITOR)
    private val b = EngagementReveal.Streak(7)
    private val c = EngagementReveal.Level(2)
    private val d = EngagementReveal.Badge("content.post", 10)

    @Test
    fun `un seul palier est a l ecran et les suivants attendent`() {
        val q = EngagementRevealQueue().enqueue(a).enqueue(b)

        assertThat(q.current).isEqualTo(a)
        assertThat(q.waiting).containsExactly(b)
    }

    @Test
    fun `fermer la celebration fait passer la suivante`() {
        val q = EngagementRevealQueue().enqueue(a).enqueue(b).finish()

        assertThat(q.current).isEqualTo(b)
        assertThat(q.waiting).isEmpty()
        assertThat(q.finish().current).isNull()
        assertThat(q.finish().isEmpty).isTrue()
    }

    @Test
    fun `un palier en cours ou en attente n est pas enfile deux fois`() {
        val q = EngagementRevealQueue().enqueue(a).enqueue(b).enqueue(a).enqueue(b)

        assertThat(q.waiting).containsExactly(b)
    }

    @Test
    fun `la deduplication survit a la fermeture`() {
        val q = EngagementRevealQueue().enqueue(a).finish().enqueue(a)

        assertThat(q.isEmpty).isTrue()
    }

    @Test
    fun `la file est bornee a trois celebrations`() {
        val q = EngagementRevealQueue().enqueue(a).enqueue(b).enqueue(c).enqueue(d)

        assertThat(q.current).isEqualTo(a)
        assertThat(q.waiting).containsExactly(b, c).inOrder()
    }

    @Test
    fun `la memoire des paliers montres est bornee`() {
        val shown = listOf(a, b, c, d)
        val q = shown.fold(EngagementRevealQueue()) { acc, r -> acc.enqueue(r).finish() }

        assertThat(q.alreadyShown).containsExactly(b, c, d).inOrder()
        assertThat(q.enqueue(a).current).isEqualTo(a)
    }

    @Test
    fun `suspendue la file garde les paliers sans les montrer`() {
        val q = EngagementRevealQueue().suspend(true).enqueue(a)

        assertThat(q.current).isNull()
        assertThat(q.waiting).containsExactly(a)
        assertThat(q.suspend(false).current).isEqualTo(a)
    }

    @Test
    fun `suspendre ne retire jamais la celebration a l ecran`() {
        val q = EngagementRevealQueue().enqueue(a).enqueue(b).suspend(true)

        assertThat(q.current).isEqualTo(a)
        assertThat(q.finish().current).isNull()
        assertThat(q.finish().suspend(false).current).isEqualTo(b)
    }
}
