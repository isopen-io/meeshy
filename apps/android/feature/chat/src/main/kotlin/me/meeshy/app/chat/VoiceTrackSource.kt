package me.meeshy.app.chat

import me.meeshy.ui.component.bubble.BubbleContent

/**
 * Ce que la bulle d'un vocal sait de lui pour la carte de lecture du système : l'auteur, son avatar,
 * la date, et si le vocal est protégé (éphémère, à vue unique, flouté ou chiffré — la carte ne dit
 * alors que son auteur).
 */
internal data class VoiceTrackSource(
    val sender: String?,
    val avatarUrl: String?,
    val createdAtIso: String?,
    val isProtected: Boolean,
)

internal fun BubbleContent.voiceTrackSource(): VoiceTrackSource = VoiceTrackSource(
    sender = senderName,
    avatarUrl = senderAvatarUrl,
    createdAtIso = createdAtIso,
    isProtected = isViewOnce || isBlurred || isEndToEndSealed || expiresAtIso != null,
)
