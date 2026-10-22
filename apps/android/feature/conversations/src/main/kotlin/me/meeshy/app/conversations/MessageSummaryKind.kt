package me.meeshy.app.conversations

import me.meeshy.sdk.model.ApiConversationLastMessage
import me.meeshy.sdk.model.isoToEpochMillisOrNull
import me.meeshy.sdk.model.media.MediaKindLabel
import me.meeshy.sdk.model.media.MediaKindStrings

/**
 * Classifies how the row should summarize a conversation's last message —
 * Android port of iOS `LastMessageSummaryKind` (SSOT:
 * `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`).
 *
 * Priority order — first match wins — mirrors iOS exactly:
 *   1. `expiresAt <= now`   → [EXPIRED] (the content is gone; every other flag
 *                             loses to it).
 *   2. `isBlurred`           → [HIDDEN] (moderation/blur outranks an active
 *                             ephemeral so blurred content never leaks).
 *   3. `isViewOnce`          → [VIEW_ONCE].
 *   4. `expiresAt` in future → [EPHEMERAL_ACTIVE].
 *   5. otherwise             → [STANDARD].
 *
 * The comparison is inclusive at the boundary (`<=`), matching iOS's
 * `expiresAt <= now`, so a message whose expiry hits precisely at the sampled
 * instant already reads as EXPIRED — one less way a row can flash old content.
 */
enum class MessageSummaryKind {
    STANDARD,
    HIDDEN,
    VIEW_ONCE,
    EPHEMERAL_ACTIVE,
    EXPIRED,
    ;

    companion object {
        fun of(message: ApiConversationLastMessage?, nowMillis: Long): MessageSummaryKind {
            if (message == null) return STANDARD
            val expiresAt = isoToEpochMillisOrNull(message.expiresAt)
            if (expiresAt != null && expiresAt <= nowMillis) return EXPIRED
            if (message.isBlurred) return HIDDEN
            if (message.isViewOnce) return VIEW_ONCE
            if (expiresAt != null) return EPHEMERAL_ACTIVE
            return STANDARD
        }
    }
}

/**
 * A row's summary line: the display [text] plus the classifier [kind] that drives
 * the Compose styling (icon, italic, colour). Typing/draft paths produce
 * `SummaryLine(text, kind = STANDARD)` — those live-activity signals are always
 * accent-styled by the row, not by the kind.
 */
data class SummaryLine(
    val text: String,
    val kind: MessageSummaryKind,
)

/**
 * Les cinq libellés de média de l'aperçu de liste, tous tirés de la source unique
 * [MediaKindLabel.summary] — aucune copie locale (« 📷 Photo », « 🎥 Vidéo »,
 * « 🎙️ Message vocal », « 📎 Fichier », « 📍 Position »).
 */
fun LastMessagePreviewLabels.withMediaKinds(strings: MediaKindStrings): LastMessagePreviewLabels = copy(
    photo = MediaKindLabel.summary(MediaKindLabel.Kind.PHOTO, strings),
    video = MediaKindLabel.summary(MediaKindLabel.Kind.VIDEO, strings),
    voice = MediaKindLabel.summary(MediaKindLabel.Kind.AUDIO, strings),
    file = MediaKindLabel.summary(MediaKindLabel.Kind.FILE, strings),
    location = MediaKindLabel.summary(MediaKindLabel.Kind.LOCATION, strings),
)
