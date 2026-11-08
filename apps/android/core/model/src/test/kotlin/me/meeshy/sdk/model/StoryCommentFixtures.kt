package me.meeshy.sdk.model

import me.meeshy.sdk.lang.LanguageResolver

internal fun storyComment(
    id: String,
    parentId: String? = null,
    replyCount: Int = 0,
    likeCount: Int = 0,
    likedByMe: Boolean = false,
    content: String = "texte $id",
) = StoryComment(
    id = id,
    clientId = null,
    authorName = "Alice",
    avatarUrl = null,
    content = content,
    isTranslated = false,
    createdAt = null,
    status = StoryCommentStatus.Sent,
    parentId = parentId,
    replyCount = replyCount,
    likeCount = likeCount,
    likedByMe = likedByMe,
)

internal fun storyPage(vararg comments: StoryComment, next: String? = null, more: Boolean = next != null) =
    StoryCommentPage(comments.toList(), next, more)

internal data class StoryPrefs(
    override val systemLanguage: String? = null,
    override val regionalLanguage: String? = null,
    override val customDestinationLanguage: String? = null,
) : LanguageResolver.ContentLanguagePreferences
