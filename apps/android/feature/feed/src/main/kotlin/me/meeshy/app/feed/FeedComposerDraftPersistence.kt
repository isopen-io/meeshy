package me.meeshy.app.feed

import me.meeshy.sdk.model.ComposerLanguage
import me.meeshy.sdk.model.PostComposerDraftSnapshot

/**
 * The feed composer's draft and its durable form (#13417) — one projection each way, so the
 * autosave, the draft parked with a queued post and « Rouvrir » all speak the same shape.
 */
internal fun FeedComposerDraft.toSnapshot(nowMillis: Long): PostComposerDraftSnapshot = PostComposerDraftSnapshot(
    text = text,
    visibility = visibility.wire,
    media = media,
    forcePlainPost = forcePlainPost,
    location = location,
    language = language,
    mediaAlt = mediaAlt,
    background = background,
    updatedAtMillis = nowMillis,
)

internal fun PostComposerDraftSnapshot.toComposerDraft(): FeedComposerDraft = FeedComposerDraft(
    text = text,
    visibility = FeedPostVisibility.entries.firstOrNull { it.wire == visibility } ?: FeedPostVisibility.PUBLIC,
    media = media.take(FeedComposerDraft.MAX_MEDIA),
    forcePlainPost = forcePlainPost,
    location = location,
    language = language ?: ComposerLanguage.DEFAULT,
    mediaAlt = mediaAlt,
    background = background,
)
