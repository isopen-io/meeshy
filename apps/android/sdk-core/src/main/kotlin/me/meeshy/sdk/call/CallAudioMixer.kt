package me.meeshy.sdk.call

/** Les deux voix d'un appel enregistré : la mienne (micro) et celle des autres (lecture WebRTC). */
internal enum class CallAudioSource { Local, Remote }

/**
 * Le mélange des deux voix en UN flux mono 16 bits à [sampleRate] (#14553). Chaque tampon est ramené au format
 * cible (mono par moyenne des canaux, ré-échantillonnage linéaire) puis mis en file par source ; [drain] rend
 * ce que les deux sources ont toutes deux livré (somme saturée, jamais de débordement), et ne laisse une source
 * seule avancer qu'au-delà de [holdSamples] — une source muette (pas de tap distant sur cet appareil) n'arrête
 * donc jamais l'enregistrement, et une source en retard de quelques tampons n'est pas rendue en silence.
 * [flush] vide tout à l'arrêt. Pas de thread ici : l'appelant sérialise.
 */
internal class CallAudioMixer(
    val sampleRate: Int,
    private val holdSamples: Int = sampleRate / HOLD_DIVISOR,
) {
    private val local = ShortQueue()
    private val remote = ShortQueue()

    fun push(source: CallAudioSource, frame: CallPcmFrame) {
        val mono = toMono(frame, sampleRate)
        if (source == CallAudioSource.Local) local.add(mono) else remote.add(mono)
    }

    fun drain(): ShortArray {
        val both = minOf(local.size, remote.size)
        val count = when {
            both > 0 -> both
            else -> maxOf(local.size, remote.size) - holdSamples
        }
        return if (count > 0) take(count) else EMPTY
    }

    fun flush(): ShortArray = take(maxOf(local.size, remote.size))

    private fun take(count: Int): ShortArray {
        val mine = local.take(count)
        val theirs = remote.take(count)
        return ShortArray(count) { index ->
            (mine[index].toInt() + theirs[index].toInt()).coerceIn(Short.MIN_VALUE.toInt(), Short.MAX_VALUE.toInt()).toShort()
        }
    }

    private class ShortQueue {
        private var data = ShortArray(INITIAL_CAPACITY)
        var size = 0
            private set

        fun add(samples: ShortArray) {
            if (size + samples.size > data.size) data = data.copyOf(maxOf(data.size * 2, size + samples.size))
            samples.copyInto(data, size)
            size += samples.size
        }

        /** [count] échantillons, complétés de silence si la file en a moins. */
        fun take(count: Int): ShortArray {
            val out = ShortArray(count)
            val available = minOf(count, size)
            data.copyInto(out, 0, 0, available)
            data.copyInto(data, 0, available, size)
            size -= available
            return out
        }
    }

    internal companion object {
        private const val HOLD_DIVISOR = 25
        private const val INITIAL_CAPACITY = 4_096
        private val EMPTY = ShortArray(0)

        /** PCM 16 bits petit-boutiste, [CallPcmFrame.channelCount] canaux entrelacés, vers du mono à [targetRate]. */
        fun toMono(frame: CallPcmFrame, targetRate: Int): ShortArray {
            val channels = frame.channelCount.coerceAtLeast(1)
            val frames = frame.pcm.size / (BYTES_PER_SAMPLE * channels)
            val mono = ShortArray(frames) { index ->
                var sum = 0
                for (channel in 0 until channels) sum += sampleAt(frame.pcm, index * channels + channel)
                (sum / channels).toShort()
            }
            return if (frame.sampleRate == targetRate) mono else resample(mono, frame.sampleRate, targetRate)
        }

        private fun sampleAt(pcm: ByteArray, sample: Int): Int =
            (pcm[sample * 2].toInt() and 0xFF) or (pcm[sample * 2 + 1].toInt() shl 8)

        private fun resample(input: ShortArray, from: Int, to: Int): ShortArray {
            if (input.isEmpty() || from <= 0) return ShortArray(0)
            val size = (input.size.toLong() * to / from).toInt()
            return ShortArray(size) { index ->
                val position = index.toDouble() * from / to
                val low = position.toInt().coerceAtMost(input.size - 1)
                val high = (low + 1).coerceAtMost(input.size - 1)
                val fraction = position - low
                (input[low] + (input[high] - input[low]) * fraction).toInt().toShort()
            }
        }

        private const val BYTES_PER_SAMPLE = 2
    }
}
