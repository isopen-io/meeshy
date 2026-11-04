package me.meeshy.app.feed

import me.meeshy.sdk.model.PostMentionInput
import me.meeshy.sdk.model.StatusComposerDraftSnapshot
import me.meeshy.sdk.model.StatusEntry
import me.meeshy.sdk.model.composer.ComposerMoodRules

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
    /** Les personnes d'une audience `ONLY` / `EXCEPT`. */
    val visibilityUserIds: List<String>? = null,
    val mentions: List<PostMentionInput>? = null,
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

    /** Connaissances et au-dessus (#13939) — l'échelle des cercles, du plus large au plus étroit, comme le composeur. */
    ACQUAINTANCES("ACQUAINTANCES"),
    FRIENDS("FRIENDS"),

    /** Proches et au-dessus. */
    CLOSE("CLOSE"),

    /** Sang seul — jamais repartagé (RG-18). */
    BLOOD("BLOOD"),
    PRIVATE("PRIVATE"),

}

/** Une audience NOMINATIVE (iOS `ONLY` / `EXCEPT`) : seulement ces personnes, ou tout le monde sauf elles. */
enum class StatusRestriction(val wire: String) { ONLY("ONLY"), EXCEPT("EXCEPT") }

/** L'audience nominative choisie et ses personnes : sans personne elle ne part pas. */
data class StatusRestrictedAudience(val kind: StatusRestriction, val userIds: List<String>)

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
    /** Audiences the author may pick; `null` = every one. A republication is capped by its source (#13667). */
    val allowedVisibilities: List<StatusVisibility>? = null,
    /** Les personnes choisies pour `ONLY` / `EXCEPT` ; vide pour les autres audiences. */
    val restriction: StatusRestrictedAudience? = null,
    val mentions: List<PostMentionInput> = emptyList(),
) {
    /** The audiences the picker offers — the whole set, or the cap of a republication. Les nominatives viennent avec leur sélecteur. */
    val offeredVisibilities: List<StatusVisibility> get() = allowedVisibilities ?: StatusVisibility.entries
    /** The status body actually published — trimmed, `null` when nothing remains. */
    val trimmedContent: String? get() = text.trim().ifBlank { null }

    /** Characters left before the [MAX_CHARS] cap (0 at the limit; never negative once [withText] clamps). */
    val charactersRemaining: Int get() = MAX_CHARS - text.length

    /** True once the counter is in alert (101st character, [ComposerMoodRules.ALERT_FROM]). */
    val isNearLimit: Boolean get() = ComposerMoodRules.counter(text).alert

    /** The character counter is shown only once the user has typed something. */
    val showCounter: Boolean get() = ComposerMoodRules.counter(text).visible

    /** A status may be published as soon as a mood emoji is picked (the text is optional). */
    val canPublish: Boolean get() = selectedEmoji != null

    /** Whether Publish goes straight out or first asks for a word (iOS `ComposerMoodBarePublish.step`). */
    val publishStep: StatusBarePublish.Step get() = StatusBarePublish.step(text, isRepublish)

    /** Le geste Publier : sans emoji il s'annonce, sans mot il demande, sinon il part. */
    val publishDecision: ComposerMoodRules.PublishDecision
        get() = ComposerMoodRules.decide(selectedEmoji, text, isRepublish)

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
            visibility = activeRestriction?.kind?.wire ?: visibility.wire,
            audioUrl = repostAudioUrl,
            repostOfId = repostOfId,
            viaUsername = viaUsername,
            visibilityUserIds = activeRestriction?.userIds,
            mentions = mentions.takeIf { it.isNotEmpty() },
        )
    }

    /** L'audience nominative, seulement si elle a des personnes et que la republication ne la plafonne pas. */
    private val activeRestriction: StatusRestrictedAudience?
        get() = restriction?.takeIf { it.userIds.isNotEmpty() && allowedVisibilities == null }

    /** Choisit une audience nominative ; sans personne elle redevient l'audience simple. */
    fun withRestriction(kind: StatusRestriction, userIds: List<String>): StatusComposerDraft =
        copy(restriction = StatusRestrictedAudience(kind, userIds.distinct()).takeIf { it.userIds.isNotEmpty() })

    /** Set the text, clamping to [MAX_CHARS] so the draft never holds an over-long body. */
    fun withText(value: String): StatusComposerDraft =
        copy(text = ComposerMoodRules.clampWord(value))

    /** Pick [emoji], or clear the selection when the already-selected one is tapped again. */
    fun toggleEmoji(emoji: String): StatusComposerDraft =
        copy(selectedEmoji = ComposerMoodRules.toggled(selectedEmoji, emoji))

    /** Select the emoji the full picker returned — always selects (never toggles); refused when the gateway would 400. */
    fun withPickedEmoji(emoji: String): StatusComposerDraft =
        if (StatusBarePublish.acceptsPicked(emoji)) copy(selectedEmoji = emoji) else this

    /** Choose the publish audience. */
    fun withVisibility(value: StatusVisibility): StatusComposerDraft =
        if (value in offeredVisibilities) copy(visibility = value, restriction = null) else this

    companion object {
        /**
         * Seed a draft that republishes [source] — port of the iOS republish sheet
         * (`StatusComposerView(initialEmoji:initialText:viaUsername:repostOfId:repostAudioUrl:)`).
         * The source mood, body and voice-audio are pre-filled and the original author is
         * carried as the `via` attribution; a source with no mood emoji leaves nothing
         * selected (the user must pick one before it can publish). The body flows through
         * [withText] so the [MAX_CHARS] invariant always holds.
         *
         * The audience starts on the original's and may only narrow (#13667): the gateway answers a
         * wider repost with 403 `REPOST_AUDIENCE_WIDENING`. See [StatusRepostAudience].
         */
        fun republish(source: StatusEntry): StatusComposerDraft {
            val allowed = StatusRepostAudience.allowed(source.visibility)
            return StatusComposerDraft(
                selectedEmoji = source.moodEmoji.ifBlank { null },
                visibility = allowed.first(),
                repostOfId = source.id,
                viaUsername = source.username,
                repostAudioUrl = source.audioUrl,
                allowedVisibilities = allowed,
            ).withText(source.content.orEmpty())
        }

        /** Gateway content cap for a mood status (iOS clamps the field to 122). */
        const val MAX_CHARS = ComposerMoodRules.MAX_WORD_CHARS

        /** Past this the counter warns the user they are close to the cap (iOS `> 100`). */
        const val NEAR_LIMIT = ComposerMoodRules.ALERT_FROM - 1

        /** The mood emoji grid — SSOT mirroring iOS `StatusViewModel.moodOptions`. */
        val MOOD_OPTIONS: List<String> = listOf(
            "😴", "🎉", "💪", "☕", "🔥",
            "💭", "🎵", "📚", "✈️", "❤️",
        )
    }
}

/** The mood draft in its durable form (#13430). A republication carries its source: it is never kept. */
internal fun StatusComposerDraft.toSnapshot(nowMillis: Long): StatusComposerDraftSnapshot = StatusComposerDraftSnapshot(
    emoji = selectedEmoji,
    text = text,
    visibility = visibility.wire,
    updatedAtMillis = nowMillis,
)

internal fun StatusComposerDraftSnapshot.toComposerDraft(): StatusComposerDraft = StatusComposerDraft(
    selectedEmoji = emoji,
    visibility = StatusVisibility.entries.firstOrNull { it.wire == visibility } ?: StatusVisibility.PRIVATE,
).withText(text)
