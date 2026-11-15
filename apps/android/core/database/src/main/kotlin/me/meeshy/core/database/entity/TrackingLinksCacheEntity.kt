package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

/** Liste des liens de suivi en cache (SWR), une ligne par compte : [cacheKey] porte le compte, [cachedAt] l'âge. */
@Entity(tableName = "tracking_links_cache")
public data class TrackingLinksCacheEntity(
    @PrimaryKey val cacheKey: String,
    val payload: String,
    val cachedAt: Long,
)
