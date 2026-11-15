package me.meeshy.sdk.model.waveform

import kotlin.math.min
import kotlin.math.sqrt

/**
 * **La mesure, en fonctions pures.** Un RMS par compartiment : aucun fichier, aucun cache,
 * aucune échelle d'affichage. Miroir de `WaveformMath.swift` (iOS).
 *
 * La valeur est ABSOLUE (jamais divisée par le pic) : deux pistes de niveaux différents se
 * distinguent, et c'est ce qui permet de régler un volume à l'œil. L'échelle qui la rend
 * lisible est [WaveformScale].
 */
object WaveformMath {

    /** `count` RMS, un par tranche égale de [samples]. Vide si l'un ou l'autre est vide. */
    fun rmsBuckets(samples: FloatArray, count: Int): FloatArray {
        if (count <= 0 || samples.isEmpty()) return FloatArray(0)
        val accumulator = WaveformAccumulator(count = count, totalFrames = samples.size.toLong())
        accumulator.append(samples)
        return accumulator.result()
    }

    /**
     * La moyenne des canaux, échantillon par échantillon. Vide si aucun canal, ou si les canaux
     * n'ont pas la même longueur.
     */
    fun monoMix(channels: List<FloatArray>): FloatArray {
        val first = channels.firstOrNull() ?: return FloatArray(0)
        if (first.isEmpty() || channels.any { it.size != first.size }) return FloatArray(0)
        if (channels.size == 1) return first.copyOf()
        val gain = 1f / channels.size
        return FloatArray(first.size) { frame -> channels.sumOf { it[frame].toDouble() }.toFloat() * gain }
    }

    /**
     * Ramène du PCM entrelacé little-endian (la sortie d'un décodeur) à des flottants mono dans
     * [out] : la moyenne des [channelCount] voies de chaque trame, en `-1..1`. Rend le nombre de
     * trames écrites ; une trame incomplète en fin de bloc est ignorée, et [out] borne le nombre
     * de trames traitées.
     */
    fun monoFromInterleaved(
        bytes: ByteArray,
        byteCount: Int,
        channelCount: Int,
        encoding: PcmEncoding,
        out: FloatArray,
    ): Int {
        if (channelCount <= 0 || byteCount <= 0) return 0
        val frameBytes = channelCount * encoding.bytesPerSample
        val frames = min(min(byteCount, bytes.size) / frameBytes, out.size)
        for (frame in 0 until frames) {
            var sum = 0f
            val base = frame * frameBytes
            for (channel in 0 until channelCount) {
                sum += encoding.read(bytes, base + channel * encoding.bytesPerSample)
            }
            out[frame] = sum / channelCount
        }
        return frames
    }
}

/** Le codage d'un bloc de PCM décodé : ce que `MediaCodec` rend (16 bits par défaut, ou flottant). */
enum class PcmEncoding(val bytesPerSample: Int) {
    PCM_16BIT(2) {
        override fun read(bytes: ByteArray, offset: Int): Float {
            val sample = (bytes[offset].toInt() and 0xFF) or (bytes[offset + 1].toInt() shl 8)
            return sample.toShort() / 32768f
        }
    },
    PCM_FLOAT(4) {
        override fun read(bytes: ByteArray, offset: Int): Float {
            val bits = (bytes[offset].toInt() and 0xFF) or
                ((bytes[offset + 1].toInt() and 0xFF) shl 8) or
                ((bytes[offset + 2].toInt() and 0xFF) shl 16) or
                ((bytes[offset + 3].toInt() and 0xFF) shl 24)
            return java.lang.Float.intBitsToFloat(bits)
        }
    };

    internal abstract fun read(bytes: ByteArray, offset: Int): Float
}

/**
 * **Le même RMS, par blocs.** L'audio se décode par morceaux : l'accumulateur découpe chaque
 * morceau aux bornes des compartiments et cumule la somme des carrés en double précision. Lu par
 * blocs ou d'un coup, le résultat est le même.
 *
 * Le compartiment d'une trame `f` est `f * count / totalFrames` ; les trames au-delà de
 * l'estimation (durée approchée d'un décodeur) se replient dans le dernier compartiment. Non
 * thread-safe : une mesure appartient à un seul appelant.
 */
class WaveformAccumulator(count: Int, totalFrames: Long) {

    val count: Int = maxOf(0, count)
    val totalFrames: Long = maxOf(0L, totalFrames)
    private val sumSquares = DoubleArray(this.count)
    private val frameCounts = LongArray(this.count)
    private var cursor = 0L

    /** Ajoute les [length] premières valeurs de [chunk]. */
    fun append(chunk: FloatArray, length: Int = chunk.size) {
        val size = min(length, chunk.size)
        if (count == 0 || totalFrames == 0L || size <= 0) return
        var offset = 0
        while (offset < size) {
            val frame = cursor + offset
            val bucket = bucketIndexOf(frame)
            val take = min((size - offset).toLong(), bucketEnd(bucket) - frame).toInt()
            if (take <= 0) break
            var squares = 0.0
            for (i in offset until offset + take) {
                val value = chunk[i].toDouble()
                squares += value * value
            }
            sumSquares[bucket] += squares
            frameCounts[bucket] += take.toLong()
            offset += take
        }
        cursor += size
    }

    fun result(): FloatArray {
        if (cursor == 0L) return FloatArray(0)
        return FloatArray(count) { bucket ->
            val frames = frameCounts[bucket]
            if (frames > 0) sqrt(sumSquares[bucket] / frames).toFloat() else 0f
        }
    }

    private fun bucketIndexOf(frame: Long): Int = min(count - 1L, frame * count / totalFrames).toInt()

    /** La première trame du compartiment suivant : `ceil((bucket + 1) * total / count)`. */
    private fun bucketEnd(bucket: Int): Long {
        if (bucket >= count - 1) return Long.MAX_VALUE
        return ((bucket + 1L) * totalFrames + count - 1) / count
    }
}
