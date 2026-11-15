package me.meeshy.sdk.conversation

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow

/**
 * « Ces conversations ont réellement changé en base » — miroir de `messageStoreShouldRefresh`
 * (`PersistenceNotifications.swift`, iOS).
 *
 * Émis UNE fois par écriture d'ingestion qui a modifié au moins une ligne, avec l'ensemble des
 * conversations touchées : une rafale coalescée de cinquante `message:new` sur cinq conversations
 * notifie une fois, cinq identifiants. Une réception redondante (rien n'a changé) ne notifie pas.
 * Un ensemble vide n'est jamais émis (côté iOS, c'est une erreur de programmation).
 */
@Singleton
class ConversationRefreshSignal @Inject constructor() {
    private val _changes = MutableSharedFlow<Set<String>>(extraBufferCapacity = BUFFER)

    /** Les ensembles de conversations écrites, dans l'ordre des transactions. */
    val changes: SharedFlow<Set<String>> = _changes.asSharedFlow()

    /** Signale [conversationIds] ; sans effet sur un ensemble vide. Ne suspend jamais. */
    fun notify(conversationIds: Set<String>) {
        if (conversationIds.isEmpty()) return
        _changes.tryEmit(conversationIds)
    }

    private companion object {
        const val BUFFER = 64
    }
}
