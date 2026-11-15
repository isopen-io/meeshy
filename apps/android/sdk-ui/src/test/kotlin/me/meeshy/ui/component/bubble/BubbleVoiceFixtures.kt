package me.meeshy.ui.component.bubble

/** Une bulle reçue qui ne porte que des vocaux — la fabrique des témoins de la bulle vocale et de sa pile. */
internal fun voiceBubble(
    audios: List<BubbleAudio>,
    voiceConsentMissing: Boolean = false,
    isOutgoing: Boolean = false,
): BubbleContent = BubbleContent(
    messageId = "m1",
    text = "",
    isOutgoing = isOutgoing,
    isTranslated = false,
    originalText = null,
    senderName = "Nour",
    showSenderName = false,
    isEdited = false,
    isDeleted = false,
    createdAtIso = "2026-11-04T08:00:00Z",
    audios = audios,
    voiceConsentMissing = voiceConsentMissing,
)

internal fun voiceNote(id: String, seconds: Int = 30): BubbleAudio = BubbleAudio(
    attachmentId = id,
    url = "https://cdn.meeshy.me/$id.m4a",
    durationSeconds = seconds,
    sizeBytes = 48_000,
)
