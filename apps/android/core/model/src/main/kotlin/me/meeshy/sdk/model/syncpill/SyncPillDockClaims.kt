package me.meeshy.sdk.model.syncpill

import kotlin.math.max
import kotlin.math.floor

/**
 * Qui déclare le chrome bas : le DERNIER écran monté (iOS `SyncPillDockClaims`, #10840). Une déclaration plus récente
 * décide, la retirer rend la précédente, et une mise à jour garde son rang (la barre qui grandit d'une ligne ne passe
 * pas devant l'écran monté après elle).
 */
data class SyncPillDockClaims(private val claims: List<Claim> = emptyList()) {
    data class Claim(val id: String, val height: Float)

    /** La hauteur du chrome sur lequel la pastille se pose ; 0 sans déclaration. */
    val height: Float get() = claims.lastOrNull()?.height ?: 0f

    /** Arrondie au demi-point : une mesure qui bouge d'une fraction ne republie rien. */
    fun claim(id: String, height: Float): SyncPillDockClaims {
        val rounded = floor(max(height, 0f) * 2f + 0.5f) / 2f
        val index = claims.indexOfFirst { it.id == id }
        return if (index >= 0) {
            SyncPillDockClaims(claims.toMutableList().also { it[index] = Claim(id, rounded) })
        } else {
            SyncPillDockClaims(claims + Claim(id, rounded))
        }
    }

    fun release(id: String): SyncPillDockClaims = SyncPillDockClaims(claims.filterNot { it.id == id })
}
