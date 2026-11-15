package me.meeshy.sdk.model.playback

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.DeviceMediaTier
import org.junit.Test

class PlayerPoolCapacityTest {
    @Test
    fun `la capacite suit le palier de l'appareil`() {
        assertThat(PlayerPoolCapacity.players(DeviceMediaTier.LOW)).isEqualTo(1)
        assertThat(PlayerPoolCapacity.players(DeviceMediaTier.MID)).isEqualTo(2)
        assertThat(PlayerPoolCapacity.players(DeviceMediaTier.HIGH)).isEqualTo(3)
        assertThat(PlayerPoolCapacity.players(DeviceMediaTier.PRO)).isEqualTo(3)
    }

    @Test
    fun `l'eviction rend le plus loin puis le plus ancien`() {
        val order = listOf("a", "b", "c")
        assertThat(PlayerPoolEviction.victim(order, mapOf("a" to 1, "b" to -3, "c" to 2))).isEqualTo("b")
        assertThat(PlayerPoolEviction.victim(order, mapOf("a" to 1, "b" to -1, "c" to 1))).isEqualTo("a")
        assertThat(PlayerPoolEviction.victim(order, emptyMap())).isEqualTo("a")
        assertThat(PlayerPoolEviction.victim(order, mapOf("a" to 1, "c" to 1))).isEqualTo("b")
        assertThat(PlayerPoolEviction.victim(emptyList(), emptyMap())).isNull()
    }

    @Test
    fun `un candidat qui serait aussitot evince n'est pas admis`() {
        val distances = mapOf("a" to 1, "b" to 1)
        assertThat(PlayerPoolEviction.admits("z", listOf("a", "b"), distances, capacity = 2)).isFalse()
        assertThat(PlayerPoolEviction.admits("z", listOf("a", "b"), distances + ("z" to 1), capacity = 2)).isTrue()
        assertThat(PlayerPoolEviction.admits("z", listOf("a"), distances, capacity = 2)).isTrue()
    }
}
