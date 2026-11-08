package me.meeshy.app.stories

import javax.inject.Inject
import me.meeshy.sdk.outbox.OutboxIds

/**
 * L'identifiant qu'un média reçoit en se posant sur la scène (#15598) : un `cmid`, le même que sa file durable prendra si
 * son envoi de fond échoue ou si une publication doit l'attendre — il ne change donc jamais avant d'être reçu.
 */
class ComposerMediaIds(private val mint: () -> String) {
    @Inject constructor() : this(OutboxIds::cmid)

    fun next(): String = mint()
}
