package me.meeshy.sdk.model.relation

import java.time.Instant
import kotlinx.serialization.Serializable

/**
 * Le Bring vu par l'EXPÉDITEUR (#13936, #16617) — le contrat de `packages/shared/types/bring.ts`, miroir de
 * `Relations/Bring.swift` du SDK iOS. La passerelle décide de tout (niveau, quota du jour du destinataire, blocage,
 * service coupé) : le client ne recalcule rien, il rend ce qui est servi.
 *
 * `GET /bring/:userId` : le bouton existe-t-il, et combien en reste-t-il aujourd'hui ? `available: false` ⇒ la ligne
 * DISPARAÎT, sans dire pourquoi : un blocage ne se devine pas. `perDay` / `remainingToday` nuls = illimité.
 */
@Serializable
public data class BringAvailability(
    val userId: String,
    val available: Boolean,
    val perDay: Int? = null,
    val remainingToday: Int? = null,
    val resetsAt: String? = null,
) {
    public val isExhausted: Boolean get() = remainingToday == 0

    /** La ligne est offerte, et il reste au moins un Bring aujourd'hui. */
    public val canSend: Boolean get() = available && !isExhausted

    /** La même disponibilité, recomptée par la réponse d'un envoi (sans relire). */
    public fun counted(perDay: Int?, remainingToday: Int?): BringAvailability =
        copy(perDay = perDay, remainingToday = remainingToday)

    /** Le bouton n'est plus offert : refus servi après coup (blocage, service coupé, lien baissé). */
    public val withdrawn: BringAvailability get() = copy(available = false, remainingToday = 0)
}

/** `POST /bring/:userId` (201, ou 200 et le MÊME Bring s'il sonne déjà). */
@Serializable
public data class BringSent(
    val bringId: String,
    val toUserId: String,
    val sentAt: String,
    val expiresAt: String,
    val perDay: Int? = null,
    val remainingToday: Int? = null,
) {
    /**
     * L'instant où la sonnerie cesse d'elle-même : `expiresAt`, borné à la fenêtre de 2 min depuis [nowMillis] — une
     * horloge serveur en avance ne fait pas durer « Ça sonne » au-delà de ce que le destinataire entend. Illisible ⇒
     * la fenêtre pleine.
     */
    public fun deadlineMillis(nowMillis: Long): Long {
        val ceiling = nowMillis + BringPushRouter.RING_WINDOW_MS
        val served = runCatching { Instant.parse(expiresAt).toEpochMilli() }.getOrNull() ?: return ceiling
        return minOf(served, ceiling)
    }
}

/** `bring:stopped` (room `user:<id>`, aux DEUX) : le Bring a cessé, arrêté par l'un ou l'autre. */
@Serializable
public data class BringStoppedEvent(
    val bringId: String,
    val fromUserId: String? = null,
    val toUserId: String? = null,
    val reason: String? = null,
    val stoppedAt: String? = null,
)

/**
 * `GET|PUT /relations/:userId/settings` — les réglages que JE pose pour l'autre. Ce lot ne lit que `bringBlocked` ; les
 * autres réglages arrivent avec leur lot, un champ absent valant son défaut.
 */
@Serializable
public data class RelationPersonSettings(
    val userId: String,
    val bringBlocked: Boolean = false,
)

/** Le corps de `PUT /relations/:userId/settings` pour le Bring : écriture partielle et stricte, un seul champ. */
@Serializable
public data class BringBlockBody(val bringBlocked: Boolean)
