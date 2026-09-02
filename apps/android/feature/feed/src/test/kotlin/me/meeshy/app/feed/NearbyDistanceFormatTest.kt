package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NearbyDistanceFormatTest {

    @Test
    fun `under 1000 meters formats as whole meters`() {
        assertThat(NearbyDistanceFormat.label(50.0)).isEqualTo(NearbyDistanceLabel.Meters(50))
        assertThat(NearbyDistanceFormat.label(999.0)).isEqualTo(NearbyDistanceLabel.Meters(999))
    }

    @Test
    fun `at exactly 1000 meters formats as 1point0 km`() {
        assertThat(NearbyDistanceFormat.label(1000.0)).isEqualTo(NearbyDistanceLabel.Kilometers(1.0))
    }

    @Test
    fun `beyond 1000 meters rounds to one decimal of kilometers`() {
        assertThat(NearbyDistanceFormat.label(2560.0)).isEqualTo(NearbyDistanceLabel.Kilometers(2.6))
    }
}
