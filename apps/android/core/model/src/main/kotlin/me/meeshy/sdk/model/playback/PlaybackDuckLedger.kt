package me.meeshy.sdk.model.playback

import kotlin.math.abs

/**
 * **Baisser puis rendre le volume d'un lecteur Meeshy** pendant un enregistrement — port de iOS
 * `PlaybackDuckLedger` (#11042), la loi sans lecteur ni effet.
 *
 * Elle mémorise le volume d'AVANT, rend le volume baissé à appliquer, puis, à la fin, rend
 * EXACTEMENT le volume mémorisé. Le volume visé est celui du lecteur, jamais celui du système.
 *
 * - Baisser deux fois ne baisse qu'une fois, et la restauration rend le volume d'origine, pas le
 *   volume déjà baissé.
 * - Rendre sans avoir baissé ne fait rien : une fin d'enregistrement sans début n'écrit aucun
 *   volume.
 * - Un volume que l'utilisateur a changé pendant l'enregistrement (coupé, remonté) est le sien : il
 *   n'est pas écrasé. Un lecteur coupé n'est jamais rendu audible : seul le volume est touché, et
 *   un lecteur coupé n'est pas baissé.
 * - Un lecteur silencieux (volume nul) n'est pas baissé.
 *
 * [K] identifie un lecteur par une clé stable (l'instance elle-même ou son identifiant). Non
 * thread-safe — à confiner au dispatcher qui pilote les lecteurs.
 */
public class PlaybackDuckLedger<K : Any> {

    private class Entry(val original: Float, val applied: Float)

    private val entries = HashMap<K, Entry>()

    public val isEmpty: Boolean
        get() = entries.isEmpty()

    /** Le volume baissé à écrire, ou `null` s'il n'y a rien à écrire. */
    public fun duck(key: K, currentVolume: Float): Float? {
        if (entries.containsKey(key) || !(currentVolume > 0f)) return null
        val applied = currentVolume * DUCKED_FACTOR
        entries[key] = Entry(original = currentVolume, applied = applied)
        return applied
    }

    /** Idem, mais un lecteur coupé n'est jamais baissé : il ne s'entend pas, il n'y a rien à protéger. */
    public fun duck(key: K, output: PlayerOutputState): Float? {
        if (ContentPlaybackAudibility.of(output) == ContentPlaybackAudibility.Muted) return null
        return duck(key, output.volume)
    }

    /** Le volume d'avant à réécrire, ou `null` s'il ne faut rien écrire. */
    public fun restore(key: K, currentVolume: Float): Float? {
        val entry = entries.remove(key) ?: return null
        if (abs(currentVolume - entry.applied) > TOLERANCE) return null
        return entry.original
    }

    /** Le lecteur n'existe plus : il n'y a rien à lui rendre. */
    public fun forget(key: K) {
        entries.remove(key)
    }

    public companion object {
        /** ≈ −10 dB : le son reste audible, et capté sans couvrir la voix. */
        public const val DUCKED_FACTOR: Float = 0.3f

        /** L'écart en deçà duquel un volume relu est celui qu'on a écrit. */
        private const val TOLERANCE: Float = 0.0005f
    }
}
