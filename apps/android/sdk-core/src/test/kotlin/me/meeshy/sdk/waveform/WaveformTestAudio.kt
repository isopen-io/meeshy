package me.meeshy.sdk.waveform

import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder

/** Des fichiers WAV PCM générés pour les tests : aucun binaire dans le dépôt. */
internal object WaveformTestAudio {

    /**
     * Écrit un WAV de [frames] trames. [sample] donne la valeur `-1..1` de la trame et du canal ;
     * [floatPcm] choisit le PCM flottant 32 bits plutôt que l'entier 16 bits.
     */
    fun wav(
        file: File,
        frames: Int,
        channels: Int = 1,
        sampleRate: Int = 44_100,
        floatPcm: Boolean = false,
        sample: (frame: Int, channel: Int) -> Float,
    ): File {
        val bytesPerSample = if (floatPcm) 4 else 2
        val dataBytes = frames * channels * bytesPerSample
        val buffer = ByteBuffer.allocate(44 + dataBytes).order(ByteOrder.LITTLE_ENDIAN)
        buffer.put("RIFF".toByteArray()).putInt(36 + dataBytes).put("WAVE".toByteArray())
        buffer.put("fmt ".toByteArray()).putInt(16)
            .putShort(if (floatPcm) 3 else 1).putShort(channels.toShort()).putInt(sampleRate)
            .putInt(sampleRate * channels * bytesPerSample).putShort((channels * bytesPerSample).toShort())
            .putShort((bytesPerSample * 8).toShort())
        buffer.put("data".toByteArray()).putInt(dataBytes)
        for (frame in 0 until frames) {
            for (channel in 0 until channels) {
                val value = sample(frame, channel)
                if (floatPcm) buffer.putFloat(value) else buffer.putShort((value * 32767f).toInt().coerceIn(-32768, 32767).toShort())
            }
        }
        file.parentFile?.mkdirs()
        file.writeBytes(buffer.array())
        return file
    }
}
