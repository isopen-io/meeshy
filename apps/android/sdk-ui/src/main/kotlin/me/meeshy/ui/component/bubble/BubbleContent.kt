package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable

/**
 * Everything [MessageBubble] needs to render, fully precomputed by
 * [BubbleContentBuilder] (ARCHITECTURE.md §11). Keeping the bubble fed by an
 * `@Immutable` value keeps the composable skippable on recomposition.
 *
 * @property text the content to display — Prisme-resolved (translated or original).
 * @property isTranslated true when [text] is a translation, not the original.
 * @property originalText the untranslated content, for an "see original" gesture;
 *   null when [text] already is the original.
 */
@Immutable
public data class BubbleContent(
    val messageId: String,
    val text: String,
    val isOutgoing: Boolean,
    val isTranslated: Boolean,
    val originalText: String?,
    val senderName: String?,
    val showSenderName: Boolean,
    val isEdited: Boolean,
    val isDeleted: Boolean,
    val createdAtIso: String?,
)
