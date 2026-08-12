package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.util.Locale

/**
 * Behavioural spec for [SharedPlace] — the Android mirror of the gateway's
 * `SharedPlace` (`services/gateway/src/services/location/sharedPlace.ts`) and iOS's
 * `SharedPlace` (`packages/MeeshySDK/Sources/MeeshySDK/Models/SharedPlace.swift`):
 * `{latitude, longitude, name, address, category}`. Only [formattedCoordinates] has
 * behaviour of its own to test here — the data class itself carries no other logic,
 * exactly like its iOS counterpart.
 */
class SharedPlaceTest {

    @Test
    fun `formattedCoordinates defaults to 5 decimal places, dot-separated`() {
        val place = SharedPlace(latitude = 48.8566, longitude = 2.3522)

        assertThat(place.formattedCoordinates()).isEqualTo("48.85660, 2.35220")
    }

    @Test
    fun `formattedCoordinates honours a custom decimal-place count`() {
        val place = SharedPlace(latitude = 48.8566, longitude = 2.3522)

        assertThat(place.formattedCoordinates(decimalPlaces = 2)).isEqualTo("48.86, 2.35")
    }

    @Test
    fun `formattedCoordinates rounds rather than truncates`() {
        val place = SharedPlace(latitude = 48.856699, longitude = 2.352199)

        assertThat(place.formattedCoordinates(decimalPlaces = 2)).isEqualTo("48.86, 2.35")
    }

    @Test
    fun `formattedCoordinates preserves the sign of negative coordinates`() {
        val place = SharedPlace(latitude = -33.8688, longitude = -70.6693)

        assertThat(place.formattedCoordinates(decimalPlaces = 2)).isEqualTo("-33.87, -70.67")
    }

    @Test
    fun `formattedCoordinates stays dot-separated regardless of the JVM default locale`() {
        // Real device-diversity gotcha: java.lang.String#format defaults to the JVM's
        // Locale, and a comma-decimal locale (fr_FR, de_DE...) would silently corrupt
        // this into an invalid wire value ("48,86") if the format call omitted an
        // explicit Locale. Proven, not assumed: temporarily flip the default and
        // confirm the output is unaffected, then restore it so no other test observes
        // a changed JVM-wide default.
        val original = Locale.getDefault()
        try {
            Locale.setDefault(Locale.FRANCE)
            val place = SharedPlace(latitude = 48.8566, longitude = 2.3522)

            assertThat(place.formattedCoordinates(decimalPlaces = 2)).isEqualTo("48.86, 2.35")
        } finally {
            Locale.setDefault(original)
        }
    }

    @Test
    fun `zero decimal places rounds to whole degrees`() {
        val place = SharedPlace(latitude = 48.8566, longitude = 2.3522)

        assertThat(place.formattedCoordinates(decimalPlaces = 0)).isEqualTo("49, 2")
    }

    @Test
    fun `two SharedPlace values with the same fields are equal`() {
        val a = SharedPlace(latitude = 1.0, longitude = 2.0, name = "Cafe", address = "1 rue", category = "food")
        val b = SharedPlace(latitude = 1.0, longitude = 2.0, name = "Cafe", address = "1 rue", category = "food")

        assertThat(a).isEqualTo(b)
    }

    @Test
    fun `name, address and category default to null for a bare coordinate`() {
        val place = SharedPlace(latitude = 1.0, longitude = 2.0)

        assertThat(place.name).isNull()
        assertThat(place.address).isNull()
        assertThat(place.category).isNull()
    }
}
