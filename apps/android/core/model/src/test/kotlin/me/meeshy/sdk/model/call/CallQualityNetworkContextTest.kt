package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class CallQualityNetworkContextTest {
    private fun reading(relayed: Boolean?) =
        CallQualityReading(1.0, 40.0, 5.0, 30.0, 0.0, relayed)

    @Test
    fun `sans lecture ou sans route connue il n'y a pas de contexte`() {
        assertThat(CallQualityNetworkContext.from(null)).isNull()
        assertThat(CallQualityNetworkContext.from(reading(null))).isNull()
    }

    @Test
    fun `la route relayee ou directe est portee telle quelle`() {
        assertThat(CallQualityNetworkContext.from(reading(true))?.relayed).isTrue()
        assertThat(CallQualityNetworkContext.from(reading(false))?.relayed).isFalse()
    }
}
