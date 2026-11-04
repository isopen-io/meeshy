package me.meeshy.sdk.model.chatlist

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class DeferredListUpdatesTest {

    @Test
    fun `une mise a jour sur une liste libre est rendue telle quelle`() {
        val release = DeferredListUpdates().offer(setOf("a"))
        assertThat(release).isEqualTo(DeferredListUpdates.Release(setOf("a"), everything = false))
    }

    @Test
    fun `pendant le geste les identifiants s accumulent et sont rejoues une fois a l arret`() {
        val updates = DeferredListUpdates()
        updates.setScrolling(true)
        assertThat(updates.offer(setOf("a"))).isNull()
        assertThat(updates.offer(setOf("b", "a"))).isNull()
        val release = updates.setScrolling(false)
        assertThat(release).isEqualTo(DeferredListUpdates.Release(setOf("a", "b"), everything = false))
        assertThat(updates.setScrolling(false)).isNull()
    }

    @Test
    fun `la reconfiguration globale domine l union`() {
        val updates = DeferredListUpdates()
        updates.setScrolling(true)
        updates.offer(setOf("a"))
        updates.offer(null)
        updates.offer(setOf("b"))
        val release = updates.setScrolling(false)!!
        assertThat(release.everything).isTrue()
    }

    @Test
    fun `la liste endormie garde le delta meme apres la fin du geste`() {
        val updates = DeferredListUpdates()
        updates.setAsleep(true)
        updates.setScrolling(true)
        updates.offer(setOf("a"))
        assertThat(updates.setScrolling(false)).isNull()
        assertThat(updates.setAsleep(false)!!.ids).containsExactly("a")
    }

    @Test
    fun `rien a rejouer rend null`() {
        val updates = DeferredListUpdates()
        updates.setScrolling(true)
        assertThat(updates.setScrolling(false)).isNull()
    }

    @Test
    fun `clear oublie le delta`() {
        val updates = DeferredListUpdates()
        updates.setScrolling(true)
        updates.offer(setOf("a"))
        updates.clear()
        assertThat(updates.setScrolling(false)).isNull()
    }
}
