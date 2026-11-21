package me.meeshy.sdk.model.sync

import java.time.Instant

/**
 * L'instant SERVEUR qu'un id de message prouve (#19420) : un ObjectId MongoDB commence par la seconde de sa création, sur
 * l'horloge de la passerelle qui l'a émis. Quand un accusé d'envoi ne rapporte pas `createdAt`, la ligne prend cet
 * instant — jamais l'horloge de l'appareil, que l'élagage de la fenêtre récente comparerait à des instants serveur.
 */
object ObjectIdInstant {

    private const val LENGTH = 24
    private const val SECONDS_HEX = 8

    /** La seconde de création de [id], en millisecondes ; `null` quand [id] n'est pas un ObjectId (un `cid_`, un id inconnu). */
    fun epochMillisOrNull(id: String): Long? {
        if (id.length != LENGTH || !id.all { it in '0'..'9' || it in 'a'..'f' || it in 'A'..'F' }) return null
        return id.take(SECONDS_HEX).toLong(radix = 16) * MILLIS_PER_SECOND
    }

    /** [epochMillisOrNull] en ISO-8601, la forme de `createdAt`. */
    fun isoOrNull(id: String): String? = epochMillisOrNull(id)?.let { Instant.ofEpochMilli(it).toString() }

    private const val MILLIS_PER_SECOND = 1_000L
}
