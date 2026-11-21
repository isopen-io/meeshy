package me.meeshy.sdk.model.reading.focal

/**
 * #19790 — les appels que le fil dit « en cours » (`call-live`) sans que le serveur l'ait confirmé : ni l'appel actif
 * connu de la conversation, ni rien. Tant que cet ensemble n'est pas vide, l'écran relit l'appel actif ; l'ensemble
 * ne change qu'avec le fil ou l'appel actif, donc une carte figée sur un appel fini ne relance pas la lecture en boucle.
 */
object FocalLiveCalls {

    fun unconfirmed(liveCallIds: List<String>, activeCallId: String?): Set<String> =
        liveCallIds.filter { it.isNotBlank() && it != activeCallId }.toSet()
}
