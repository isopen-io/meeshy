package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import java.io.ByteArrayInputStream
import org.junit.Test

class PickedAttachmentReadTest {

    @Test
    fun `a stream within the ceiling is read whole`() {
        val bytes = ByteArray(10) { it.toByte() }

        assertThat(readWithin(ByteArrayInputStream(bytes), maxBytes = 10)).isEqualTo(bytes)
    }

    @Test
    fun `a stream above the ceiling is refused without being read whole`() {
        val stream = ByteArrayInputStream(ByteArray(11))

        assertThat(readWithin(stream, maxBytes = 10)).isNull()
    }
}
