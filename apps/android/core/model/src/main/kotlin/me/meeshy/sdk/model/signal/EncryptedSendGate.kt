package me.meeshy.sdk.model.signal

/**
 * Pourquoi un aller-retour Signal avec la passerelle (`/signal/keys`,
 * `/signal/keys/{userId}`, `/signal/session/establish`) n'a rien livré.
 *
 * Les causes se lisent sur la réponse de `services/gateway/src/routes/signal-protocol.ts` :
 * 404 « User has not generated encryption keys », 403 « not authorized » (aucune
 * conversation ni amitié en commun), 503 `E2EE_UNAVAILABLE` (« Signal Protocol not
 * available, refusing to fake E2EE session »), 429 du limiteur de débit.
 */
enum class SignalFailure {
    /** 404 — l'autre côté n'a jamais publié de clés : aucune session n'est possible. */
    KEYS_NOT_PUBLISHED,

    /** 403 — pas de conversation ni d'amitié en commun, ou pas participant. */
    NOT_AUTHORIZED,

    /** 503 / `E2EE_UNAVAILABLE` — le serveur REFUSE de simuler une session chiffrée. */
    SERVER_UNAVAILABLE,

    /** 429 — le limiteur de débit des routes Signal (5 à 30 requêtes par minute). */
    RATE_LIMITED,

    /** Aucune réponse HTTP : hors ligne, délai dépassé. */
    TRANSPORT,

    /** Tout le reste — jamais une raison de relâcher une protection. */
    UNKNOWN,
    ;

    companion object {
        private const val CODE_E2EE_UNAVAILABLE = "E2EE_UNAVAILABLE"
        private const val CODE_NETWORK = "NETWORK"

        /** Projette le verdict d'un refus (statut HTTP, `code` de l'enveloppe) sur sa cause. */
        fun from(httpStatus: Int?, code: String?): SignalFailure = when {
            code == CODE_E2EE_UNAVAILABLE || httpStatus == 503 -> SERVER_UNAVAILABLE
            httpStatus == 404 -> KEYS_NOT_PUBLISHED
            httpStatus == 403 -> NOT_AUTHORIZED
            httpStatus == 429 -> RATE_LIMITED
            httpStatus == null && code == CODE_NETWORK -> TRANSPORT
            else -> UNKNOWN
        }
    }
}

/** Ce qu'un envoi doit faire une fois qu'une opération Signal a échoué. */
sealed interface EncryptedSendDecision {
    /** Aucune garantie de chiffrement n'était demandée : l'envoi suit son cours normal. */
    data object Proceed : EncryptedSendDecision

    /** Le message ne part PAS — ni en clair, ni sous une autre forme. [cause] dit pourquoi. */
    data class Blocked(val cause: SignalFailure) : EncryptedSendDecision
}

/**
 * La loi « fail-closed » du chiffrement de bout en bout (directive porteur
 * 2026-10-03, #9224) : dans une conversation chiffrée, aucun échec Signal ne
 * laisse partir un message en clair.
 *
 * Sans E2EE sur la conversation, un échec Signal n'a rien à gouverner — personne
 * n'a demandé de session. Avec E2EE, la décision ne dépend PAS de la cause : un
 * 503, un 404, un délai dépassé et une cause inconnue bloquent tous l'envoi. La
 * cause voyage dans [EncryptedSendDecision.Blocked] pour que l'écran puisse DIRE
 * pourquoi, jamais pour décider s'il faut bloquer.
 */
object EncryptedSendGate {
    fun afterSignalFailure(conversationEncrypted: Boolean, failure: SignalFailure): EncryptedSendDecision =
        if (conversationEncrypted) EncryptedSendDecision.Blocked(failure) else EncryptedSendDecision.Proceed
}
