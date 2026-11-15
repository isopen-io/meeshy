package me.meeshy.ui.component.video

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ReelPlayerPoolTest {
    private class Fixture {
        val created = mutableListOf<Int>()
        val resets = mutableListOf<Int>()
        val destroyed = mutableListOf<Int>()
        val pool = ReelPlayerPool(
            create = { created.size.also { created += it } },
            reset = { resets += it },
            destroy = { destroyed += it },
        )
    }

    @Test
    fun `le pool est borne a trois et evince le plus ancien en FIFO`() {
        val f = Fixture()
        val players = List(4) { f.pool.acquire() }
        players.forEach(f.pool::release)
        assertThat(f.pool.idleCount).isEqualTo(3)
        assertThat(f.destroyed).containsExactly(0)
    }

    @Test
    fun `le sortant retourne au pool, reinitialise, et resert au lieu d en creer un autre`() {
        val f = Fixture()
        val first = f.pool.acquire()
        f.pool.release(first)
        assertThat(f.resets).containsExactly(first)
        assertThat(f.pool.acquire()).isEqualTo(first)
        assertThat(f.created).hasSize(1)
    }

    @Test
    fun `rendre un lecteur ne detruit rien tant que la borne tient`() {
        val f = Fixture()
        val a = f.pool.acquire()
        val b = f.pool.acquire()
        f.pool.release(a)
        f.pool.release(b)
        assertThat(f.destroyed).isEmpty()
        assertThat(f.pool.idleCount).isEqualTo(2)
    }

    @Test
    fun `trim libere tous les lecteurs au repos`() {
        val f = Fixture()
        val a = f.pool.acquire()
        val b = f.pool.acquire()
        f.pool.release(a)
        f.pool.release(b)
        f.pool.trim()
        assertThat(f.pool.idleCount).isEqualTo(0)
        assertThat(f.destroyed).containsExactly(0, 1)
    }

    @Test
    fun `un lecteur ecarte est detruit sans entrer au pool`() {
        val f = Fixture()
        val a = f.pool.acquire()
        f.pool.discard(a)
        assertThat(f.destroyed).containsExactly(a)
        assertThat(f.pool.idleCount).isEqualTo(0)
    }
}
