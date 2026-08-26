package me.meeshy.app.feed

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.SharedPlace
import org.junit.Test

class FeedPostLocationBuilderTest {

    private fun place(
        latitude: Double = 48.8584,
        longitude: Double = 2.2945,
        name: String? = null,
        address: String? = null,
    ) = SharedPlace(latitude = latitude, longitude = longitude, name = name, address = address)

    @Test
    fun `null place projects to null`() {
        assertThat(FeedPostLocationBuilder.build(null)).isNull()
    }

    @Test
    fun `named place uses the name as the label`() {
        val out = FeedPostLocationBuilder.build(place(name = "Tour Eiffel", address = "Champ de Mars"))

        assertThat(out).isNotNull()
        assertThat(out!!.label).isEqualTo("Tour Eiffel")
    }

    @Test
    fun `name wins over address when both are present`() {
        val out = FeedPostLocationBuilder.build(place(name = "Louvre", address = "Rue de Rivoli"))

        assertThat(out!!.label).isEqualTo("Louvre")
    }

    @Test
    fun `blank name falls back to the address`() {
        val out = FeedPostLocationBuilder.build(place(name = "   ", address = "Rue de Rivoli"))

        assertThat(out!!.label).isEqualTo("Rue de Rivoli")
    }

    @Test
    fun `absent name falls back to the address`() {
        val out = FeedPostLocationBuilder.build(place(name = null, address = "Rue de Rivoli"))

        assertThat(out!!.label).isEqualTo("Rue de Rivoli")
    }

    @Test
    fun `blank address after blank name yields a null label`() {
        val out = FeedPostLocationBuilder.build(place(name = " ", address = "   "))

        assertThat(out).isNotNull()
        assertThat(out!!.label).isNull()
    }

    @Test
    fun `absent name and address yields a null label`() {
        val out = FeedPostLocationBuilder.build(place(name = null, address = null))

        assertThat(out!!.label).isNull()
    }

    @Test
    fun `coordinates pass through unchanged`() {
        val out = FeedPostLocationBuilder.build(place(latitude = 12.5, longitude = -34.75, name = "Somewhere"))

        assertThat(out!!.latitude).isEqualTo(12.5)
        assertThat(out.longitude).isEqualTo(-34.75)
    }

    @Test
    fun `a coordinate-only place still projects with a null label`() {
        val out = FeedPostLocationBuilder.build(place(latitude = 0.0, longitude = 0.0))

        assertThat(out).isNotNull()
        assertThat(out!!.label).isNull()
        assertThat(out.latitude).isEqualTo(0.0)
        assertThat(out.longitude).isEqualTo(0.0)
    }
}
