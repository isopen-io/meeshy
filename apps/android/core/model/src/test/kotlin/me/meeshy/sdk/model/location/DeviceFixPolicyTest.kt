package me.meeshy.sdk.model.location

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyLocationCoordinate
import org.junit.Test

class DeviceFixPolicyTest {

    private fun fix(accuracy: Double?, ageMillis: Long, latitude: Double = 48.0) =
        KnownFix(MeeshyLocationCoordinate(latitude = latitude, longitude = 2.0, accuracy = accuracy), ageMillis)

    @Test
    fun `une position reseau de 14 m vieille de 30 s sert la carte tout de suite`() {
        val network = fix(accuracy = 14.0, ageMillis = 30_000)

        assertThat(DeviceFixPolicy.immediate(listOf(network))).isEqualTo(network.coordinate)
    }

    @Test
    fun `entre deux positions recentes la plus precise gagne`() {
        val gps = fix(accuracy = 5.0, ageMillis = 60_000, latitude = 1.0)
        val network = fix(accuracy = 40.0, ageMillis = 10_000, latitude = 2.0)

        assertThat(DeviceFixPolicy.immediate(listOf(network, gps))).isEqualTo(gps.coordinate)
    }

    @Test
    fun `une position de dix minutes ne tient pas lieu de releve mais reste un repli`() {
        val stale = fix(accuracy = 20.0, ageMillis = 600_000)

        assertThat(DeviceFixPolicy.immediate(listOf(stale))).isNull()
        assertThat(DeviceFixPolicy.fallback(listOf(stale))).isEqualTo(stale.coordinate)
    }

    @Test
    fun `une position de plus d'une demi-heure n'est plus un repli`() {
        assertThat(DeviceFixPolicy.fallback(listOf(fix(accuracy = 20.0, ageMillis = 3_600_000)))).isNull()
        assertThat(DeviceFixPolicy.fallback(emptyList())).isNull()
    }

    @Test
    fun `le repli prefere la position la plus recente`() {
        val old = fix(accuracy = 5.0, ageMillis = 900_000, latitude = 1.0)
        val recent = fix(accuracy = 80.0, ageMillis = 300_000, latitude = 2.0)

        assertThat(DeviceFixPolicy.fallback(listOf(old, recent))).isEqualTo(recent.coordinate)
    }

    @Test
    fun `un age negatif est une horloge inconsistante, jamais servi`() {
        assertThat(DeviceFixPolicy.immediate(listOf(fix(accuracy = 5.0, ageMillis = -1)))).isNull()
    }
    @Test
    fun `pendant le partage en direct un releve GPS passe toujours`() {
        assertThat(DeviceFixPolicy.streamKeeps(fromGps = true, lastGpsAtMillis = 10_000, nowMillis = 11_000)).isTrue()
        assertThat(DeviceFixPolicy.streamKeeps(fromGps = true, lastGpsAtMillis = null, nowMillis = 11_000)).isTrue()
    }

    @Test
    fun `un releve reseau ne s'intercale pas entre deux releves GPS`() {
        assertThat(DeviceFixPolicy.streamKeeps(fromGps = false, lastGpsAtMillis = 10_000, nowMillis = 15_000)).isFalse()
    }

    @Test
    fun `le reseau prend le relais quand le GPS se tait - en interieur`() {
        assertThat(DeviceFixPolicy.streamKeeps(fromGps = false, lastGpsAtMillis = null, nowMillis = 15_000)).isTrue()
        val silence = DeviceFixPolicy.STREAM_GPS_SILENCE_MILLIS
        assertThat(DeviceFixPolicy.streamKeeps(fromGps = false, lastGpsAtMillis = 10_000, nowMillis = 10_000 + silence)).isTrue()
    }
}
