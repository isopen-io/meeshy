package me.meeshy.sdk.story

import me.meeshy.sdk.model.ApiPost
import me.meeshy.sdk.model.DeletionTombstones

/**
 * Une page de synchronisation par delta de la barre des stories (`?updatedSince=`) : les stories créées ou
 * modifiées depuis l'instant donné, et les disparitions que `meta.deletedStoryIds` annonce (`null` : le
 * serveur n'en a rien dit). Un tombstone [DeletionTombstones.Incomplete] oblige le client à une re-liste complète.
 */
data class StoryDelta(
    val posts: List<ApiPost>,
    val tombstones: DeletionTombstones?,
    val nextCursor: String?,
    val hasMore: Boolean,
)
