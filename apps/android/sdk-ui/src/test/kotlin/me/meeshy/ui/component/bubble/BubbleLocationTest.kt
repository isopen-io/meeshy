package me.meeshy.ui.component.bubble

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class BubbleLocationTest {

    @Test
    fun `a location with both coordinates has coordinates`() {
        val location = BubbleLocation(attachmentId = "a1", latitude = 48.8566, longitude = 2.3522)

        assertThat(location.hasCoordinates).isTrue()
    }

    @Test
    fun `a location missing its latitude has no coordinates`() {
        val location = BubbleLocation(attachmentId = "a1", latitude = null, longitude = 2.3522)

        assertThat(location.hasCoordinates).isFalse()
    }

    @Test
    fun `a location missing its longitude has no coordinates`() {
        val location = BubbleLocation(attachmentId = "a1", latitude = 48.8566, longitude = null)

        assertThat(location.hasCoordinates).isFalse()
    }

    @Test
    fun `a location with coordinates and a place name builds a labelled geo uri`() {
        val location = BubbleLocation(
            attachmentId = "a1",
            latitude = 48.8566,
            longitude = 2.3522,
            placeName = "Tour Eiffel",
        )

        assertThat(location.geoUri).isEqualTo("geo:48.8566,2.3522?q=48.8566,2.3522(Tour Eiffel)")
    }

    @Test
    fun `a location with coordinates and no place name builds a plain geo uri`() {
        val location = BubbleLocation(attachmentId = "a1", latitude = 48.8566, longitude = 2.3522)

        assertThat(location.geoUri).isEqualTo("geo:48.8566,2.3522?q=48.8566,2.3522")
    }

    @Test
    fun `a blank place name is treated as no label in the geo uri`() {
        val location = BubbleLocation(
            attachmentId = "a1",
            latitude = 48.8566,
            longitude = 2.3522,
            placeName = "   ",
        )

        assertThat(location.geoUri).isEqualTo("geo:48.8566,2.3522?q=48.8566,2.3522")
    }

    @Test
    fun `a place name is trimmed inside the geo uri label`() {
        val location = BubbleLocation(
            attachmentId = "a1",
            latitude = 1.0,
            longitude = 2.0,
            placeName = "  Home  ",
        )

        assertThat(location.geoUri).isEqualTo("geo:1.0,2.0?q=1.0,2.0(Home)")
    }

    @Test
    fun `a location without coordinates has no geo uri`() {
        val location = BubbleLocation(attachmentId = "a1", placeName = "Somewhere")

        assertThat(location.geoUri).isNull()
    }

    @Test
    fun `the geo uri always uses a dot decimal separator regardless of locale`() {
        val previous = java.util.Locale.getDefault()
        java.util.Locale.setDefault(java.util.Locale.FRANCE)
        try {
            val location = BubbleLocation(attachmentId = "a1", latitude = 48.85, longitude = 2.35)

            assertThat(location.geoUri).isEqualTo("geo:48.85,2.35?q=48.85,2.35")
        } finally {
            java.util.Locale.setDefault(previous)
        }
    }
}
