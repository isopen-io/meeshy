package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Une ligne de la liste des notifications, gardée pour s'afficher au premier cadre après un démarrage à froid ou hors
 * ligne. [payload] est l'`ApiNotification` sérialisé ; [createdAt] (époque, ms) ordonne la liste, [isRead] et
 * [scopeKey] la sélectionnent sans décoder. Seule la portée « all » est persistée : les autres vivent en mémoire.
 */
@Entity(
    tableName = "notifications",
    indices = [Index(value = ["scopeKey", "createdAt"])],
)
public data class NotificationEntity(
    @PrimaryKey val id: String,
    val scopeKey: String,
    val payload: String,
    val createdAt: Long,
    val isRead: Boolean,
    val cachedAt: Long,
)
