package me.meeshy.sdk.talkie

import java.util.concurrent.atomic.AtomicInteger
import me.meeshy.sdk.model.relation.TalkieWaveLaw

/** Lit le niveau d'une voix, normalisé entre 0 et 1, depuis n'importe quel fil. */
fun interface TalkieLevelReading {
    fun level(): Float
}

/**
 * Le niveau d'une voix du talkie (#17315, iso `TalkieLevelMeter`), écrit par le fil audio et lu par l'onde à chaque image
 * sans rien publier : l'en-tête ne se recompose pas pour lui. [outgoing] = le micro qui capte, [incoming] = le lecteur
 * qui joue la voix reçue.
 */
class TalkieLevelMeter : TalkieLevelReading {
    private val bits = AtomicInteger(0f.toRawBits())

    override fun level(): Float = Float.fromBits(bits.get())

    /** Une moyenne quadratique mesurée (0…1 en amplitude). */
    fun push(rms: Float) {
        bits.set(TalkieWaveLaw.normalized(rms).toRawBits())
    }

    fun reset() {
        bits.set(0f.toRawBits())
    }

    companion object {
        val outgoing: TalkieLevelMeter = TalkieLevelMeter()
        val incoming: TalkieLevelMeter = TalkieLevelMeter()
    }
}
