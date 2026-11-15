package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import java.time.ZoneId
import java.util.Locale
import org.junit.Test

class ShareLinkDateFormatTest {

    private val utc = ZoneId.of("UTC")
    private val oct22 = 1_792_000_000_000L // 2026-10-14T...Z

    private fun ascii(text: String) = text.map { c ->
        if (Character.getType(c) == Character.DECIMAL_DIGIT_NUMBER.toInt()) ('0' + Character.digit(c, 10)) else c
    }.joinToString("")

    @Test
    fun `une date arabe saoudienne reste grégorienne`() {
        val text = ascii(ShareLinkDateFormat.day(oct22, Locale.forLanguageTag("ar-SA"), utc))
        assertThat(text).contains("2026")
        assertThat(text).doesNotContain("1448")
    }

    @Test
    fun `le jour et l heure se disent ensemble`() {
        val text = ShareLinkDateFormat.dayAndTime(oct22, Locale.US, utc)
        assertThat(text).contains("2026")
        assertThat(text).containsMatch("\\d:\\d\\d")
    }
}
