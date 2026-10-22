package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.PostType

/** The format an author composes — port of iOS `ComposerFormat`. A FIELD of the composer, never a door. */
enum class ComposerFormat {
    STORY, POST, REEL, STATUS;

    val postType: PostType
        get() = when (this) {
            STORY -> PostType.STORY
            POST -> PostType.POST
            REEL -> PostType.REEL
            STATUS -> PostType.STATUS
        }

    companion object {
        val allComposable: List<ComposerFormat> = listOf(POST, STORY, REEL, STATUS)

        fun from(postType: PostType): ComposerFormat = when (postType) {
            PostType.STORY -> STORY
            PostType.POST -> POST
            PostType.REEL -> REEL
            PostType.STATUS -> STATUS
        }

        /** Unknown or missing wire type reads as a plain post, like iOS `init(postType:)`. */
        fun from(postType: String?): ComposerFormat = when ((postType ?: "").uppercase()) {
            "STORY" -> STORY
            "REEL" -> REEL
            "STATUS" -> STATUS
            else -> POST
        }
    }
}

/** The nine doors through which the composer opens — port of iOS `ComposerOrigin`. */
sealed interface ComposerOrigin {
    data object StoryTray : ComposerOrigin
    data object FeedComposer : ComposerOrigin
    data object MoodChip : ComposerOrigin
    data class Repost(val ofPostId: String, val sourceFormat: ComposerFormat) : ComposerOrigin
    data class Edit(val postId: String, val documentFormat: ComposerFormat) : ComposerOrigin
    data class Draft(val id: String) : ComposerOrigin
    data object Share : ComposerOrigin
    data class ConversationMedia(val messageId: String, val attachmentId: String? = null) : ComposerOrigin
    data class SocialMedia(val postId: String, val mediaId: String? = null) : ComposerOrigin

    val repostedPostId: String? get() = (this as? Repost)?.ofPostId

    val resumedDraftId: String? get() = (this as? Draft)?.id
}

/** What the composer shows first once opened. */
enum class ComposerOpening { CAMERA_READY, KEYBOARD_ON_CONTENT, VIDEO_CAMERA_READY, MOOD_GRID, RESUME, MEDIA_SEEDED }

/** The legacy composer an origin still routes to while the unified one is not complete. */
enum class LegacyComposer { STATUS_COMPOSER, REPOST_COMPOSER, STORY_EDIT, EDIT_POST_SHEET, FEED_COMPOSER, FEED_INLINE_COMPOSER }
