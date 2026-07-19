package me.meeshy.app.feed

import me.meeshy.sdk.model.StatusEntry

/**
 * The exact payload a publish/republish carries to [StatusesViewModel.setStatus] —
 * the pure projection of a ready [StatusComposerDraft]. Keeping this a value type
 * lets the composer glue stay dumb (it just forwards the request) and lets the
 * republish attribution (`repostOfId`/`viaUsername`/`audioUrl`) be unit-tested.
 */
data class StatusPublishRequest(
    val emoji: String,
    val content: String?,
    val visibility: String,
    val audioUrl: String?,
    val repostOfId: String?,
    val viaUsername: String?,
)

/**
 * Audience a mood status is visible to — mirrors the gateway `Visibility` enum
 * (`packages/shared`) carried on the status create request. [wire] is the exact
 * string the API expects; the UI never hardcodes the literal.
 *
 * iOS also offers `EXCEPT`/`ONLY` (audience-picker cases). Those need a user
 * picker that Android does not have yet, so they are deferred to a follow-up
 * (feature-parity §G) — this composer ships the four cases that publish without
 * a per-user selection, matching the story composer's `StoryVisibility`.
 */
enum class StatusVisibility(val wire: String) {
    PUBLIC("PUBLIC"),
    COMMUNITY("COMMUNITY"),
    FRIENDS("FRIENDS"),
    PRIVATE("PRIVATE"),
}

/**
 * Pure, immutable model of an in-progress mood status — the Android port of the
 * local `@State` in iOS `StatusComposerView`. It owns the product rules the
 * Composable must not re-implement:
 *
 * - the **publish gate** (`canPublish`): a mood emoji must be selected (iOS
 *   `disabled(selectedEmoji == nil)`),
 * - the **122-char cap** (`withText` clamps, mirroring iOS's `onChange` prefix),
 * - the **body actually sent** (`trimmedContent`): whitespace-stripped, `null`
 *   when blank (iOS `statusText.isEmpty ? nil : statusText`),
 * - the emoji **toggle** (tap the selected one to clear it) and visibility change.
 *
 * The Composable holds one of these in `remember` and stays glue; every decision
 * here is unit-tested.
 */
data class StatusComposerDraft(
    val selectedEmoji: String? = null,
    val text: String = "",
    val visibility: StatusVisibility = StatusVisibility.PUBLIC,
    val repostOfId: String? = null,
    val viaUsername: String? = null,
    val repostAudioUrl: String? = null,
) {
    /** The status body actually published — trimmed, `null` when nothing remains. */
    val trimmedContent: String? get() = text.trim().ifBlank { null }

    /** Characters left before the [MAX_CHARS] cap (0 at the limit; never negative once [withText] clamps). */
    val charactersRemaining: Int get() = MAX_CHARS - text.length

    /** True once the text passes [NEAR_LIMIT] — the counter turns to a warning colour. */
    val isNearLimit: Boolean get() = text.length > NEAR_LIMIT

    /** The character counter is shown only once the user has typed something. */
    val showCounter: Boolean get() = text.isNotEmpty()

    /** A status may be published as soon as a mood emoji is picked (the text is optional). */
    val canPublish: Boolean get() = selectedEmoji != null

    /** True when this draft republishes another status — drives the "via @…" line + repost header. */
    val isRepublish: Boolean get() = repostOfId != null

    /**
     * The payload to publish, or `null` when the draft is not yet publishable (no emoji).
     * Carries the trimmed body, the wire visibility, and — for a republish — the source
     * post id, its author attribution and any voice-mood audio (iOS `repostOfId`/
     * `viaUsername`/`repostAudioUrl`).
     */
    fun publishRequest(): StatusPublishRequest? {
        val emoji = selectedEmoji ?: return null
        return StatusPublishRequest(
            emoji = emoji,
            content = trimmedContent,
            visibility = visibility.wire,
            audioUrl = repostAudioUrl,
            repostOfId = repostOfId,
            viaUsername = viaUsername,
        )
    }

    /** Set the text, clamping to [MAX_CHARS] so the draft never holds an over-long body. */
    fun withText(value: String): StatusComposerDraft =
        copy(text = if (value.length <= MAX_CHARS) value else value.take(MAX_CHARS))

    /** Pick [emoji], or clear the selection when the already-selected one is tapped again. */
    fun toggleEmoji(emoji: String): StatusComposerDraft =
        copy(selectedEmoji = if (selectedEmoji == emoji) null else emoji)

    /** Choose the publish audience. */
    fun withVisibility(value: StatusVisibility): StatusComposerDraft = copy(visibility = value)

    companion object {
        /**
         * Seed a draft that republishes [source] — port of the iOS republish sheet
         * (`StatusComposerView(initialEmoji:initialText:viaUsername:repostOfId:repostAudioUrl:)`).
         * The source mood, body and voice-audio are pre-filled and the original author is
         * carried as the `via` attribution; a source with no mood emoji leaves nothing
         * selected (the user must pick one before it can publish). The body flows through
         * [withText] so the [MAX_CHARS] invariant always holds.
         */
        fun republish(source: StatusEntry): StatusComposerDraft =
            StatusComposerDraft(
                selectedEmoji = source.moodEmoji.ifBlank { null },
                repostOfId = source.id,
                viaUsername = source.username,
                repostAudioUrl = source.audioUrl,
            ).withText(source.content.orEmpty())

        /** Gateway content cap for a mood status (iOS clamps the field to 122). */
        const val MAX_CHARS = 122

        /** Past this the counter warns the user they are close to the cap (iOS `> 100`). */
        const val NEAR_LIMIT = 100

        /** The mood emoji grid — SSOT mirroring iOS `StatusViewModel.moodOptions`. */
        val MOOD_OPTIONS: List<String> = listOf(
            "😴", "🎉", "💪", "☕", "🔥",
            "💭", "🎵", "📚", "✈️", "❤️",
        )
    }
}
