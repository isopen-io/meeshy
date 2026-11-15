package me.meeshy.app.widget.kit

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WidgetReaderPrismTest {

    @Test
    fun `the prism survives a round trip in its order`() {
        val prism = listOf("fr", "en", "es")

        assertThat(WidgetReaderPrismCodec.decode(WidgetReaderPrismCodec.encode(prism))).isEqualTo(prism)
    }

    @Test
    fun `an absent or blank prism decodes to nothing, so the original is served`() {
        assertThat(WidgetReaderPrismCodec.decode(null)).isEmpty()
        assertThat(WidgetReaderPrismCodec.decode("")).isEmpty()
        assertThat(WidgetReaderPrismCodec.decode(" , ")).isEmpty()
    }

    @Test
    fun `blank entries never reach the stored prism`() {
        assertThat(WidgetReaderPrismCodec.encode(listOf("fr", " ", "en"))).isEqualTo("fr,en")
    }
}
