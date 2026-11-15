package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Add/toggle a reaction request — port of ReactionRequest (StoryModels.swift). */
@Serializable
data class ReactionRequest(
    val emoji: String,
)

/** Repost a post/story/status request — port of RepostRequest (StoryModels.swift). */
@Serializable
data class RepostRequest(
    val content: String? = null,
    val isQuote: Boolean = false,
    val targetType: String? = null,
)

/** Create a mood status request — port of StatusCreateRequest (StoryModels.swift). */
@Serializable
data class StatusCreateRequest(
    val type: String = "STATUS",
    val moodEmoji: String,
    val content: String? = null,
    val visibility: String = "PUBLIC",
    val visibilityUserIds: List<String>? = null,
)

/** Mark a story as viewed request — port of StoryViewRequest (StoryModels.swift). */
@Serializable
data class StoryViewRequest(
    val viewed: Boolean = true,
)
