package me.meeshy.sdk.model.mediacache

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural spec for the human-readable cache-size formatter. Ports the iOS binary
 * `ByteCountFormatter` convention (base 1024, units KB/MB/GB only — no bytes unit, no TB,
 * adaptive ~1 decimal with a space before the unit).
 */
class ByteSizeFormatterTest {

    @Test
    fun `zero bytes renders as 0 KB`() {
        assertThat(ByteSizeFormatter.format(0)).isEqualTo("0 KB")
    }

    @Test
    fun `negative byte counts are clamped to zero`() {
        assertThat(ByteSizeFormatter.format(-4096)).isEqualTo("0 KB")
    }

    @Test
    fun `sub-kilobyte sizes are still expressed in KB with a decimal`() {
        assertThat(ByteSizeFormatter.format(512)).isEqualTo("0.5 KB")
    }

    @Test
    fun `a size that rounds below a tenth of a KB collapses to 0 KB`() {
        assertThat(ByteSizeFormatter.format(40)).isEqualTo("0 KB")
    }

    @Test
    fun `exactly one kilobyte drops the trailing decimal`() {
        assertThat(ByteSizeFormatter.format(1024)).isEqualTo("1 KB")
    }

    @Test
    fun `a fractional kilobyte keeps one decimal`() {
        assertThat(ByteSizeFormatter.format(1536)).isEqualTo("1.5 KB")
    }

    @Test
    fun `kilobyte values round half up to one decimal`() {
        // 1280 / 1024 = 1.25 -> 1.3
        assertThat(ByteSizeFormatter.format(1280)).isEqualTo("1.3 KB")
    }

    @Test
    fun `whole kilobytes render without a decimal`() {
        assertThat(ByteSizeFormatter.format(10 * 1024)).isEqualTo("10 KB")
    }

    @Test
    fun `just under a megabyte stays in KB`() {
        // 1_048_575 bytes -> 1023.999 KB -> 1024 KB (rounds up but stays < 1 MB threshold in bytes)
        assertThat(ByteSizeFormatter.format(1_000 * 1024)).isEqualTo("1000 KB")
    }

    @Test
    fun `exactly one megabyte switches to MB and drops the decimal`() {
        assertThat(ByteSizeFormatter.format(1024L * 1024)).isEqualTo("1 MB")
    }

    @Test
    fun `a fractional megabyte keeps one decimal`() {
        assertThat(ByteSizeFormatter.format(1024L * 1024 * 3 / 2)).isEqualTo("1.5 MB")
    }

    @Test
    fun `multi-megabyte whole values render without a decimal`() {
        assertThat(ByteSizeFormatter.format(25L * 1024 * 1024)).isEqualTo("25 MB")
    }

    @Test
    fun `exactly one gigabyte switches to GB`() {
        assertThat(ByteSizeFormatter.format(1024L * 1024 * 1024)).isEqualTo("1 GB")
    }

    @Test
    fun `a fractional gigabyte keeps one decimal`() {
        assertThat(ByteSizeFormatter.format(1024L * 1024 * 1024 * 5 / 2)).isEqualTo("2.5 GB")
    }

    @Test
    fun `terabyte-scale values stay capped at GB`() {
        assertThat(ByteSizeFormatter.format(2048L * 1024 * 1024 * 1024)).isEqualTo("2048 GB")
    }
}
