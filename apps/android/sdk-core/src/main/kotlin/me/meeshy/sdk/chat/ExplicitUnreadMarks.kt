package me.meeshy.sdk.chat

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Les conversations que le lecteur vient de marquer NON LUES (miroir de iOS
 * `ExplicitUnreadMarks.swift`). La marque dit à la réconciliation des non-lus de ne pas
 * effacer la pastille qu'on vient de poser, et à la sortie de la conversation de ne pas
 * rattraper la lecture ([me.meeshy.sdk.model.conversationlist.UnreadReconciliation]).
 * Elle sert une fois ([consume]) et la réouverture de la conversation l'efface ([clear]).
 */
@Singleton
class ExplicitUnreadMarks @Inject constructor() {
    private val marked = LinkedHashSet<String>()

    @Synchronized
    fun note(conversationId: String) {
        if (conversationId.isNotBlank()) marked.add(conversationId)
    }

    /** `true` (et la marque tombe) si la conversation vient d'être marquée non lue. */
    @Synchronized
    fun consume(conversationId: String): Boolean = marked.remove(conversationId)

    @Synchronized
    fun clear(conversationId: String) {
        marked.remove(conversationId)
    }

    /** Les marques actuelles, en instantané immuable. */
    @Synchronized
    fun snapshot(): Set<String> = marked.toSet()

    /** Oublie toutes les marques (changement de compte, déconnexion). */
    @Synchronized
    fun forgetAll() {
        marked.clear()
    }
}
