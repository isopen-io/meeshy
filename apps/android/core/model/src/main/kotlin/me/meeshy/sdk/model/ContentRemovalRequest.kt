package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Le corps d'un retrait par la modération : `{ "reason": … }` (port de `ContentRemovalBody`, iOS).
 *
 * Il n'existe QUE quand un motif est fourni. Sans motif, la requête part SANS corps — celle que
 * l'auteur d'un contenu envoyait déjà en le supprimant lui-même, à l'octet près (rétrocompatibilité
 * avec les passerelles qui ne lisent pas de corps sur un DELETE).
 */
@Serializable
data class ContentRemovalRequest(val reason: String) {
    companion object {
        /** Motif normalisé (rogné) ; `null` quand il est absent ou blanc, donc aucun corps ne part. */
        fun forReason(reason: String?): ContentRemovalRequest? =
            reason?.trim()?.takeIf { it.isNotEmpty() }?.let(::ContentRemovalRequest)
    }
}
