package me.meeshy.sdk.model.mediacache

/**
 * Cadence des rapports de progression d'un transfert (miroir de `TransferProgressCadence`, iOS) : au plus un rapport
 * par [minimumIntervalMillis], plus toujours le premier et le dernier.
 *
 * Un flux d'octets signale CHAQUE tampon écrit — plusieurs centaines par seconde sur un bon réseau. Les relayer tels
 * quels recomposerait toutes les surfaces qui montrent le média à chaque tampon. Règle pure : l'appelant fournit
 * l'horloge.
 */
public class TransferProgressCadence(
    private val minimumIntervalMillis: Long = DEFAULT_INTERVAL_MILLIS,
) {
    private var lastEmissionMillis: Long? = null

    /** `true` quand ce rapport doit être publié ; l'état avance seulement alors. */
    public fun admits(writtenBytes: Long, expectedBytes: Long, nowMillis: Long): Boolean {
        val completes = expectedBytes > 0 && writtenBytes >= expectedBytes
        val last = lastEmissionMillis
        if (!completes && last != null && nowMillis - last < minimumIntervalMillis) return false
        lastEmissionMillis = nowMillis
        return true
    }

    public companion object {
        public const val DEFAULT_INTERVAL_MILLIS: Long = 100L
    }
}
