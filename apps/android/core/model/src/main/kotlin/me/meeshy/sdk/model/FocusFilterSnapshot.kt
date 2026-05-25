package me.meeshy.sdk.model

/**
 * Minimal snapshot of the user's Focus filter — port of FocusFilterSnapshot
 * (UserNotificationPreferences+Filter.swift). Carries which notification
 * categories are currently allowed.
 */
data class FocusFilterSnapshot(
    val allowDirectMessages: Boolean = true,
    val allowGroupMessages: Boolean = true,
    val allowMentions: Boolean = true,
    val allowReactions: Boolean = true,
    val allowSocial: Boolean = true,
    val allowCalls: Boolean = true,
    val isActive: Boolean = false,
) {
    companion object {
        val PERMISSIVE = FocusFilterSnapshot()
    }
}
