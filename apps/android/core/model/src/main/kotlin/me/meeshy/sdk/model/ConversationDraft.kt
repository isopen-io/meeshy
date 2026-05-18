package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** Lightweight per-conversation message draft — port of ConversationDraft (ConversationDraft.swift). */
@Serializable
data class ConversationDraft(
    val conversationId: String,
    val text: String = "",
    val updatedAt: String? = null,
)
