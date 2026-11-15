package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/** Un fragment de talkie se découpe en trames AAC lisibles seules (#16675). */
class TalkieAdtsTest {

    /** Une trame ADTS AAC-LC 44,1 kHz mono, sans CRC, portant [payload]. */
    private fun frame(payload: ByteArray, crc: Boolean = false): ByteArray {
        val header = if (crc) 9 else 7
        val length = header + payload.size
        val bytes = byteArrayOf(
            0xFF.toByte(),
            (if (crc) 0xF0 else 0xF1).toByte(),
            ((1 shl 6) or (4 shl 2) or 0).toByte(),
            ((1 shl 6) or ((length shr 11) and 0x03)).toByte(),
            ((length shr 3) and 0xFF).toByte(),
            (((length and 0x07) shl 5) or 0x1F).toByte(),
            0xFC.toByte(),
        )
        return bytes + (if (crc) byteArrayOf(0, 0) else byteArrayOf()) + payload
    }

    @Test
    fun `chaque trame rend sa charge, en-tete retire`() {
        val frames = TalkieAdts.frames(frame(byteArrayOf(1, 2, 3)) + frame(byteArrayOf(4, 5), crc = true))
        assertThat(frames.map { it.payload.toList() }).containsExactly(listOf<Byte>(1, 2, 3), listOf<Byte>(4, 5)).inOrder()
    }

    @Test
    fun `le format lu donne la configuration du decodeur`() {
        val format = TalkieAdts.frames(frame(byteArrayOf(9))).single().format
        assertThat(format).isEqualTo(AdtsFormat(audioObjectType = 2, sampleRateIndex = 4, channels = 1))
        assertThat(format.sampleRate).isEqualTo(44_100)
        assertThat(format.audioSpecificConfig.toList()).containsExactly(0x12.toByte(), 0x08.toByte()).inOrder()
    }

    @Test
    fun `une trame tronquee ou hors synchronisation arrete la lecture sans rien inventer`() {
        val whole = frame(byteArrayOf(1, 2, 3))
        assertThat(TalkieAdts.frames(whole + whole.copyOf(whole.size - 1))).hasSize(1)
        assertThat(TalkieAdts.frames(byteArrayOf(0, 1, 2, 3, 4, 5, 6, 7))).isEmpty()
        assertThat(TalkieAdts.frames(byteArrayOf())).isEmpty()
    }
}
