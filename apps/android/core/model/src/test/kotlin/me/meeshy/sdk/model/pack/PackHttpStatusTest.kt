package me.meeshy.sdk.model.pack

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class PackHttpStatusTest {

    @Test fun `insufficient meeshes is read from its gateway code only`() {
        assertThat(PackHttpStatus.isInsufficientMeeshes("INSUFFICIENT_MEESHES")).isTrue()
        assertThat(PackHttpStatus.isInsufficientMeeshes("PACK_ALREADY_OWNED")).isFalse()
        assertThat(PackHttpStatus.isInsufficientMeeshes(null)).isFalse()
    }

    @Test fun `a definitive refusal is a 4xx except 408 and 429`() {
        assertThat(PackHttpStatus.isDefinitiveRefusal(400)).isTrue()
        assertThat(PackHttpStatus.isDefinitiveRefusal(409)).isTrue()
        assertThat(PackHttpStatus.isDefinitiveRefusal(499)).isTrue()
        assertThat(PackHttpStatus.isDefinitiveRefusal(408)).isFalse()
        assertThat(PackHttpStatus.isDefinitiveRefusal(429)).isFalse()
    }

    @Test fun `a server fault, a success or no status is never definitive`() {
        assertThat(PackHttpStatus.isDefinitiveRefusal(500)).isFalse()
        assertThat(PackHttpStatus.isDefinitiveRefusal(503)).isFalse()
        assertThat(PackHttpStatus.isDefinitiveRefusal(200)).isFalse()
        assertThat(PackHttpStatus.isDefinitiveRefusal(null)).isFalse()
    }

    @Test fun `only 403 is forbidden`() {
        assertThat(PackHttpStatus.isForbidden(403)).isTrue()
        assertThat(PackHttpStatus.isForbidden(401)).isFalse()
        assertThat(PackHttpStatus.isForbidden(null)).isFalse()
    }

    @Test fun `offline means no status and the network code`() {
        assertThat(PackHttpStatus.isOffline(null, "NETWORK")).isTrue()
        assertThat(PackHttpStatus.isOffline(null, null)).isFalse()
        assertThat(PackHttpStatus.isOffline(503, "NETWORK")).isFalse()
    }
}
