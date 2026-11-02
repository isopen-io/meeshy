package me.meeshy.ui.component.media

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.UploadByteReading
import org.junit.Test
import java.util.Locale

class UploadProgressFormatTest {

    private val reading = UploadByteReading.of(sent = 4_800_000, total = 14_200_000)

    @Test
    fun `both numbers follow the reader's locale and carry at most one decimal`() {
        assertThat(UploadProgressFormat.numbers(reading, Locale.FRANCE)).isEqualTo("4,8" to "14,2")
        assertThat(UploadProgressFormat.numbers(reading, Locale.US)).isEqualTo("4.8" to "14.2")
    }

    @Test
    fun `a whole number shows no trailing decimal`() {
        val whole = UploadByteReading.of(sent = 2_000_000, total = 10_000_000)

        assertThat(UploadProgressFormat.numbers(whole, Locale.US)).isEqualTo("2" to "10")
    }

    @Test
    fun `small files read in kilobytes with the same rule`() {
        val small = UploadByteReading.of(sent = 1_500, total = 64_000)

        assertThat(UploadProgressFormat.numbers(small, Locale.US)).isEqualTo("1.5" to "64")
    }
}
