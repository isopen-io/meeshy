package me.meeshy.sdk.model

import kotlinx.serialization.Serializable

/**
 * Lightweight per-conversation message draft — port of ConversationDraft (ConversationDraft.swift)
 * plus the app-side `DraftStore` compose state (`MessageDraft`).
 *
 * [replyToId] carries the reference to the message the half-typed draft is replying to (iOS
 * app-side `DraftStore` persists the reply reference alongside the text), so a reply armed but
 * not yet sent survives leaving and reopening the conversation. `null` = a plain (non-reply) draft.
 *
 * [effects] carries the composer's armed message effects (the effect flag bitfield plus its
 * parameters — ephemeral duration, blur, view-once, appearance/persistent effects), so a
 * self-destruct duration or a confetti effect armed but not yet sent survives navigation
 * (iOS `MessageDraft.effectFlags` / `isBlurEnabled` / `ephemeralDurationRawValue`, folded here
 * into the single [MessageEffects] SSOT). Defaulted so legacy persisted blobs written before this
 * field existed decode to an empty selection.
 */
@Serializable
data class ConversationDraft(
    val conversationId: String,
    val text: String = "",
    val updatedAt: String? = null,
    val replyToId: String? = null,
    val effects: MessageEffects = MessageEffects(),
)

/**
 * Whether this draft is worth surfacing **in the conversation list** — the single source
 * of truth for the draft-aware ordering, the "Brouillon" badge and the draft preview line.
 * A draft counts when it carries non-blank text **or** an armed (non-blank) reply reference;
 * armed effects alone do NOT float or badge a row (parity with iOS's text-only `hasDraftText`
 * list rule). An empty draft with no reply is inert here.
 */
val ConversationDraft.isMeaningful: Boolean
    get() = text.isNotBlank() || !replyToId.isNullOrBlank()

/**
 * Whether the composer holds unsent state worth **persisting** across navigation — the broader
 * predicate `DraftAutosave` uses to decide save-vs-purge and whether a stored draft is restored.
 * A draft is worth keeping when it is [isMeaningful] **or** carries any armed effect (an armed
 * self-destruct duration / blur / view-once / appearance effect on an otherwise empty composer is
 * still unsent state the user would want back). Mirrors iOS `MessageDraft.isEffectivelyEmpty`,
 * which weighs `effectFlags` / `isBlurEnabled` / `ephemeralDurationRawValue` on top of text/reply —
 * kept separate from [isMeaningful] so effects never leak into the list surfaces.
 */
val ConversationDraft.isWorthPersisting: Boolean
    get() = isMeaningful || effects.hasAnyEffect
