package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/** A resolved mention candidate for the autocomplete panel — port of MentionCandidate (MentionCandidate.swift). */
@Serializable
data class MentionCandidate(
    val id: String,
    val username: String = "",
    val displayName: String = "",
    val avatarURL: String? = null,
)
