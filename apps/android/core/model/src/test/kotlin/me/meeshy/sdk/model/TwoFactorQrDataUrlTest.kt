package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage of [TwoFactorQrDataUrl.base64Payload] — pure extraction of the
 * base64 PNG payload from the gateway's `data:image/png;base64,...` QR code data URL
 * (`POST auth/2fa/setup`'s `qrCodeDataUrl`). Kept independent of `Base64.decode`/
 * `BitmapFactory` (Android-framework calls, screen-side glue) so the parsing itself is
 * unit-testable in the JVM.
 */
class TwoFactorQrDataUrlTest {

    @Test
    fun base64Payload_validPngDataUrl_extractsPayload() {
        val result = TwoFactorQrDataUrl.base64Payload("data:image/png;base64,iVBORw0KGgo=")
        assertThat(result).isEqualTo("iVBORw0KGgo=")
    }

    @Test
    fun base64Payload_validJpegDataUrl_extractsPayload() {
        val result = TwoFactorQrDataUrl.base64Payload("data:image/jpeg;base64,/9j/4AAQ")
        assertThat(result).isEqualTo("/9j/4AAQ")
    }

    @Test
    fun base64Payload_missingDataPrefix_returnsNull() {
        assertThat(TwoFactorQrDataUrl.base64Payload("iVBORw0KGgo=")).isNull()
    }

    @Test
    fun base64Payload_missingBase64Marker_returnsNull() {
        assertThat(TwoFactorQrDataUrl.base64Payload("data:image/png,iVBORw0KGgo=")).isNull()
    }

    @Test
    fun base64Payload_nonImageMime_returnsNull() {
        assertThat(TwoFactorQrDataUrl.base64Payload("data:text/plain;base64,aGVsbG8=")).isNull()
    }

    @Test
    fun base64Payload_emptyPayload_returnsNull() {
        assertThat(TwoFactorQrDataUrl.base64Payload("data:image/png;base64,")).isNull()
    }

    @Test
    fun base64Payload_blankString_returnsNull() {
        assertThat(TwoFactorQrDataUrl.base64Payload("")).isNull()
    }
}
