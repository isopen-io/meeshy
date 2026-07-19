package me.meeshy.app.feed

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

    /** Set the text, clamping to [MAX_CHARS] so the draft never holds an over-long body. */
    fun withText(value: String): StatusComposerDraft =
        copy(text = if (value.length <= MAX_CHARS) value else value.take(MAX_CHARS))

    /** Pick [emoji], or clear the selection when the already-selected one is tapped again. */
    fun toggleEmoji(emoji: String): StatusComposerDraft =
        copy(selectedEmoji = if (selectedEmoji == emoji) null else emoji)

    /** Choose the publish audience. */
    fun withVisibility(value: StatusVisibility): StatusComposerDraft = copy(visibility = value)

    companion object {
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
