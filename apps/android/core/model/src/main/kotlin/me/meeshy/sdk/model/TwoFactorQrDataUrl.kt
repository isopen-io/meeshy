package me.meeshy.sdk.model

/**
 * Extracts the base64 image payload from the gateway's `data:image/png;base64,...` QR
 * code data URL (`POST auth/2fa/setup`'s `qrCodeDataUrl`) — pure string parsing kept
 * independent of `Base64.decode`/`BitmapFactory.decodeByteArray` (Android-framework
 * calls, which stay screen-side glue) so the parsing itself is unit-testable in the JVM.
 */
object TwoFactorQrDataUrl {
    private val DATA_URL_REGEX = Regex("^data:image/[a-zA-Z0-9.+-]+;base64,(.+)$", RegexOption.DOT_MATCHES_ALL)

    fun base64Payload(dataUrl: String): String? =
        DATA_URL_REGEX.matchEntire(dataUrl)?.groupValues?.get(1)?.takeIf { it.isNotBlank() }
}
