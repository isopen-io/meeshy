package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A published story item — port of StoryItem (StoryModels.swift). */
@Serializable
data class StoryItem(
    val id: String,
    val content: String? = null,
    val media: List<FeedMedia> = emptyList(),
    val storyEffects: StoryEffects? = null,
    val createdAt: String? = null,
    val expiresAt: String? = null,
    val repostOfId: String? = null,
    val originalRepostOfId: String? = null,
    val repostAuthorName: String? = null,
    /**
     * `@handle` of the original author of a repost — shown after the author's name
     * in the viewer header (repost icon + `@handle`, no "via"). Optional: older
     * payloads decode as null and the UI falls back to [repostAuthorName]. Port of
     * `StoryItem.repostAuthorUsername` (StoryModels.swift).
     */
    val repostAuthorUsername: String? = null,
    val visibility: String? = null,
    val audioUrl: String? = null,
    val isViewed: Boolean = false,
    val translations: List<StoryTranslation>? = null,
    val backgroundAudio: StoryBackgroundAudioEntry? = null,
    val reactionCount: Int = 0,
    val commentCount: Int = 0,
)

/** A story content translation — port of StoryTranslation (StoryModels.swift). */
@Serializable
data class StoryTranslation(
    val language: String = "",
    val content: String = "",
)

/** A grouping of one author's stories — port of StoryGroup (StoryModels.swift). */
@Serializable
data class StoryGroup(
    val id: String,
    val username: String = "",
    val avatarColor: String = "",
    val avatarURL: String? = null,
    val stories: List<StoryItem> = emptyList(),
)

/** A mood/status entry — port of StatusEntry (StoryModels.swift). */
@Serializable
data class StatusEntry(
    val id: String,
    val userId: String = "",
    val username: String = "",
    val avatarColor: String = "",
    val moodEmoji: String = "",
    val content: String? = null,
    val audioUrl: String? = null,
    val createdAt: String? = null,
    val expiresAt: String? = null,
    val visibility: String? = null,
    val reactionSummary: Map<String, Int>? = null,
    val viaUsername: String? = null,
)
