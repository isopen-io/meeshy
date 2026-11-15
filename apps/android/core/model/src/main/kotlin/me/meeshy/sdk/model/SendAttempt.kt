package me.meeshy.sdk.model

/**
 * Transport d'une tentative d'envoi — miroir de `SendAttemptRecord.Transport` (iOS). Le mot écrit en base est celui d'iOS
 * (`socket-first`, `rest`, `socket-fallback`, `outbox`) : une base et un export lus par les deux plateformes restent d'accord.
 */
enum class SendTransport(val wire: String) {
    /** Temps réel (socket), premier choix. */
    SOCKET_FIRST("socket-first"),

    /** HTTP : le chemin d'envoi nominal d'Android. */
    REST("rest"),

    /** Repli temps réel après l'échec d'un autre transport. */
    SOCKET_FALLBACK("socket-fallback"),

    /** Rejeu de la file d'envoi (nouvelle tentative automatique). */
    OUTBOX("outbox"),
    ;

    companion object {
        /** Tolérant : un transport inconnu (build plus récent) se lit `null`, l'écran en montre alors le mot brut. */
        fun fromWire(wire: String?): SendTransport? = entries.firstOrNull { it.wire == wire }
    }
}

/** Issue d'une tentative — `success` / `failure`, comme iOS. */
enum class SendOutcome(val wire: String) {
    SUCCESS("success"),
    FAILURE("failure"),
    ;

    companion object {
        fun fromWire(wire: String?): SendOutcome? = entries.firstOrNull { it.wire == wire }
    }
}

/**
 * Une ligne du journal d'envoi d'un message sortant : une par tentative, clé de jointure [localId] (le `clientMessageId`).
 * Le journal survit à l'accusé du serveur — c'est l'historique que la fiche du message affiche.
 */
data class SendAttempt(
    val localId: String,
    val attemptNumber: Int,
    val transport: String,
    val startedAtMillis: Long,
    val finishedAtMillis: Long?,
    val outcome: String,
    val errorMessage: String?,
) {
    val isSuccess: Boolean get() = outcome == SendOutcome.SUCCESS.wire
}

/** Libellé ordinal d'une tentative : « 1re tentative » pour la première, « Tentative n » ensuite. */
sealed interface SendAttemptOrdinal {
    data object First : SendAttemptOrdinal
    data class Nth(val number: Int) : SendAttemptOrdinal

    companion object {
        fun of(attemptNumber: Int): SendAttemptOrdinal = if (attemptNumber <= 1) First else Nth(attemptNumber)
    }
}

/**
 * Catégorie de pluriel du compte « n tentative(s) » : la règle de pluriel elle-même est celle des ressources `plurals`, qui
 * la choisissent par langue ; ici, seule la valeur transmise est bornée (jamais négative).
 */
object SendAttemptCount {
    fun quantity(count: Int): Int = count.coerceAtLeast(0)
}
