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
 * `GET|PUT /relations/:userId/settings` — les réglages que JE pose pour l'autre. Deux familles sont lues : les préférences de
 * RÉCEPTION (`bringBlocked`, #13936 ; `talkieBlocked`, #13935), ouvertes par défaut, et le partage de MON écoute
 * (`listeningCategoryShared`, #16836), REFUSÉ par défaut. Un champ absent (serveur plus ancien) vaut son défaut. Iso
 * `RelationPersonSettings` du SDK iOS.
 */
@Serializable
public data class RelationPersonSettings(
    val userId: String,
    val bringBlocked: Boolean = false,
    val talkieBlocked: Boolean = false,
    val listeningCategoryShared: Boolean = false,
) {
    public fun isBlocked(setting: RelationReceptionSetting): Boolean = when (setting) {
        RelationReceptionSetting.BRING -> bringBlocked
        RelationReceptionSetting.TALKIE -> talkieBlocked
    }

    public fun isGranted(grant: RelationShareGrant): Boolean = when (grant) {
        RelationShareGrant.LISTENING_CATEGORY -> listeningCategoryShared
    }
}

/**
 * Une préférence de RÉCEPTION posée pour une personne (iso `RelationReceptionSetting`, SDK iOS) : ouverte par défaut, son
 * réglage est un BLOCAGE de ce que JE reçois d'elle, qui n'en est pas prévenue. « Bloquer ses Bring » dès Ami, « Couper son
 * talkie » dès Proche.
 */
public enum class RelationReceptionSetting { BRING, TALKIE }

/**
 * Un partage de MON activité que J'ACCORDE à une personne, hors rituel (iso `RelationShareGrant`, SDK iOS) : refusé par
 * défaut, accordé et retiré d'un geste, sans que l'autre en soit prévenu. Le titre de l'écoute n'y figure pas : il ne
 * s'accorde qu'au rituel du Sang.
 */
public enum class RelationShareGrant { LISTENING_CATEGORY }

/**
 * UN interrupteur de la fiche d'un lien, écrit seul (iso `CirclePersonSwitch`, iOS) : allumé, une [Reception] est un
 * BLOCAGE, un [Share] est un ACCORD.
 */
public sealed interface RelationPersonSwitch {
    public fun isOn(settings: RelationPersonSettings): Boolean

    public data class Reception(val setting: RelationReceptionSetting) : RelationPersonSwitch {
        override fun isOn(settings: RelationPersonSettings): Boolean = settings.isBlocked(setting)
    }

    public data class Share(val grant: RelationShareGrant) : RelationPersonSwitch {
        override fun isOn(settings: RelationPersonSettings): Boolean = settings.isGranted(grant)
    }
}

/** Le corps de `PUT /relations/:userId/settings` pour le Bring : écriture partielle et stricte, un seul champ. */
@Serializable
public data class BringBlockBody(val bringBlocked: Boolean)

/** Le corps de `PUT /relations/:userId/settings` pour le talkie : écriture partielle et stricte, un seul champ. */
@Serializable
public data class TalkieBlockBody(val talkieBlocked: Boolean)

/** Le corps de `PUT /relations/:userId/settings` pour « Ce que j'écoute » (#16836) : écriture partielle et stricte, un seul champ. */
@Serializable
public data class ListeningCategoryShareBody(val listeningCategoryShared: Boolean)
