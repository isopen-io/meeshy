package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/**
 * Le journal réseau et qualité d'un appel, gardé sur CET appareil seulement (miroir de `CallNetworkJournalStore` iOS, #8698).
 *
 * Une ligne par (compte, appel) : le journal suit le compte, il est purgé avec lui (déconnexion, retrait, changement de compte).
 * `payload` est le JSON des événements ; `startedAt` (epoch-millis) ordonne les appels pour la rétention de 30 jours et 200 appels.
 */
@Entity(
    tableName = "call_network_journal",
    primaryKeys = ["account", "callId"],
    indices = [Index(value = ["account", "startedAt"])],
)
public data class CallNetworkJournalEntity(
    val account: String,
    val callId: String,
    val startedAt: Long,
    val payload: String,
    val updatedAt: Long,
)
