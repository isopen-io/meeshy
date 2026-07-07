package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Lightweight per-conversation message draft — port of ConversationDraft (ConversationDraft.swift).
 *
 * [replyToId] carries the reference to the message the half-typed draft is replying to (iOS
 * app-side `DraftStore` persists the reply reference alongside the text), so a reply armed but
 * not yet sent survives leaving and reopening the conversation. `null` = a plain (non-reply) draft.
 */
@Serializable
data class ConversationDraft(
    val conversationId: String,
    val text: String = "",
    val updatedAt: String? = null,
    val replyToId: String? = null,
)
