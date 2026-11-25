package me.meeshy.sdk.lock

import timber.log.Timber

/**
 * Le verrou PIN scelle-t-il le CONTENU de [conversationId] venu d'un push (bannière, pré-enregistrement,
 * préchargement) ? Miroir de `NSEConversationLock.sealsContent` (iOS) : un verrou illisible scelle — mieux vaut une
 * bannière muette et un message non écrit qu'un secret en clair — qu'il lève ou que le coffre réponde « illisible »
 * ([ConversationLockStore.isLockedOrUnknown], #19088). L'UNIQUE lecture fail-closed du verrou côté push.
 */
fun ConversationLockStore.sealsContentOf(conversationId: String): Boolean = try {
    isLockedOrUnknown(conversationId)
} catch (failure: Exception) {
    Timber.w(failure, "Conversation lock unreadable, content sealed")
    true
}
