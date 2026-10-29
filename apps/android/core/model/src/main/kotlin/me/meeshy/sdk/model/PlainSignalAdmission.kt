package me.meeshy.sdk.model

/**
 * **RÉAGIR, ÉPINGLER, DÉSÉPINGLER, SUPPRIMER POUR TOUS** (#13790) : en bout en bout, ces gestes voyagent en SIGNAUX chiffrés
 * (`POST /e2ee/conversations/:id/signals`, #13142) que l'Android natif ne sait pas encore sceller (#13015). Leurs routes en clair
 * y répondent `409 E2EE_SIGNAL_CHANNEL_REQUIRED`, mais la passerelle a déjà lu l'emoji et le message visé : le geste ne doit
 * jamais partir. iOS les envoie par le canal ; [MessageActionPolicy] porte la loi PARTAGÉE (qui les offre), et cette loi-ci
 * dit ce que CE client peut en faire tant qu'il n'a pas le canal.
 *
 * Le geste n'est OFFERT que vers une conversation CONNUE claire ; un mode inconnu se relit d'abord (l'outbox attend, #13628) et
 * ne s'annonce pas comme chiffré.
 */
object PlainSignalAdmission {

    /** Ce que l'appareil sait de la conversation, le fil compris : un fil qui MONTRE du bout en bout la ferme (#13099). */
    fun clearanceOf(conversation: ConversationClearance, threadShowsEndToEnd: Boolean): ConversationClearance =
        if (threadShowsEndToEnd) ConversationClearance.END_TO_END else conversation

    /** Menu, barre d'emoji, bulle, sélection : le geste n'existe que vers une conversation CONNUE claire. */
    fun offers(clearance: ConversationClearance): Boolean = clearance == ConversationClearance.CLEAR

    /** L'interface dit pourquoi le geste manque seulement quand le bout en bout est SU. */
    fun saysWhy(clearance: ConversationClearance): Boolean = clearance == ConversationClearance.END_TO_END
}
