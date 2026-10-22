package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test
import java.time.Instant

/**
 * LES DATES DU FIL (#11609) — miroir Kotlin de `WireDate` (iOS, #6609) : la passerelle sérialise
 * par `toISOString` et valide ses entrées par `z.string().datetime({ offset: true })`. On écrit
 * donc une date-heure ISO 8601 COMPLÈTE, en UTC, à la milliseconde, arrondie vers le bas, et on
 * relit avec ET sans fractions.
 */
class WireDateTest {

    private val instantMillis = 1_789_464_863_563L

    // region écriture

    @Test
    fun `string writes a UTC date-time with milliseconds`() {
        assertThat(WireDate.string(instantMillis)).isEqualTo("2026-09-15T09:34:23.563Z")
    }

    @Test
    fun `a round second still carries its milliseconds`() {
        assertThat(WireDate.string(1_789_464_863_000L)).isEqualTo("2026-09-15T09:34:23.000Z")
    }

    @Test
    fun `a half second keeps three digits where Instant toString would write one`() {
        assertThat(WireDate.string(1_789_464_863_500L)).isEqualTo("2026-09-15T09:34:23.500Z")
        assertThat(Instant.ofEpochMilli(1_789_464_863_500L).toString()).isEqualTo("2026-09-15T09:34:23.500Z")
        assertThat(Instant.ofEpochMilli(1_789_464_863_000L).toString()).isEqualTo("2026-09-15T09:34:23Z")
    }

    @Test
    fun `the epoch is the cold start string`() {
        assertThat(WireDate.string(0L)).isEqualTo("1970-01-01T00:00:00.000Z")
    }

    @Test
    fun `below the millisecond the date never goes past itself`() {
        val instant = Instant.ofEpochSecond(1_789_464_863L, 563_700_000L)

        assertThat(WireDate.string(instant)).isEqualTo("2026-09-15T09:34:23.563Z")
    }

    @Test
    fun `the last nanosecond of a millisecond stays in that millisecond`() {
        val instant = Instant.ofEpochSecond(1_789_464_863L, 563_999_999L)

        assertThat(WireDate.string(instant)).isEqualTo("2026-09-15T09:34:23.563Z")
    }

    @Test
    fun `before the epoch the rounding still goes down`() {
        val instant = Instant.ofEpochSecond(-1L, 999_500_000L)

        assertThat(WireDate.string(instant)).isEqualTo("1969-12-31T23:59:59.999Z")
    }

    // endregion

    // region lecture

    @Test
    fun `epochMillis reads the milliseconds`() {
        assertThat(WireDate.epochMillis("2026-09-15T09:34:23.563Z")).isEqualTo(instantMillis)
    }

    @Test
    fun `epochMillis reads a date-time without fractions`() {
        assertThat(WireDate.epochMillis("2026-09-15T09:34:23Z")).isEqualTo(1_789_464_863_000L)
    }

    @Test
    fun `epochMillis reads an offset and names the same instant`() {
        assertThat(WireDate.epochMillis("2026-09-15T11:34:23.563+02:00")).isEqualTo(instantMillis)
    }

    @Test
    fun `epochMillis reads finer fractions and rounds them down`() {
        assertThat(WireDate.epochMillis("2026-09-15T09:34:23.563987Z")).isEqualTo(instantMillis)
    }

    @Test
    fun `a time of day alone is not a date`() {
        assertThat(WireDate.epochMillis("03:53:29.563")).isNull()
        assertThat(WireDate.epochMillis("")).isNull()
        assertThat(WireDate.epochMillis("   ")).isNull()
        assertThat(WireDate.epochMillis(null)).isNull()
        assertThat(WireDate.epochMillis("not-a-timestamp")).isNull()
    }

    @Test
    fun `the epoch reads as zero not as absent`() {
        assertThat(WireDate.epochMillis("1970-01-01T00:00:00Z")).isEqualTo(0L)
    }

    @Test
    fun `instant reads what epochMillis reads`() {
        assertThat(WireDate.instant("2026-09-15T09:34:23.563Z")).isEqualTo(Instant.ofEpochMilli(instantMillis))
        assertThat(WireDate.instant("03:53:29.563")).isNull()
    }

    // endregion

    // region aller-retour

    @Test
    fun `every millisecond of a second survives the round trip`() {
        val failures = (0 until 1_000).filter { ms ->
            val millis = 1_789_464_863_000L + ms
            val written = WireDate.string(millis)
            written.length != 24 ||
                !written.endsWith(String.format(".%03dZ", ms)) ||
                WireDate.epochMillis(written) != millis ||
                WireDate.string(WireDate.epochMillis(written)!!) != written
        }

        assertThat(failures).isEmpty()
    }

    // endregion
}
