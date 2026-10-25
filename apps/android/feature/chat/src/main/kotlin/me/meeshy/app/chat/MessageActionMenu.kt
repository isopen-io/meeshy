package me.meeshy.app.chat

import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.PinAction

/**
 * A single action offered in the long-press message overlay menu (the "action grid").
 *
 * Port of the vertical action list iOS composes in `MessageActionResolver.primaryActions`
 * + `MessageActionsSheet`. Meeshy Android surfaces a single flat contextual list rather
 * than iOS's two-tier "primary + More…" split, so reply/forward live here directly.
 */
enum class MessageAction {
    Reply,
    Forward,
    ShowOriginal,
    ShowTranslation,
    ExploreLanguages,
    Copy,
    /** Downloads (if needed) and opens the message's FILE attachment via `ACTION_VIEW`.
     * Android's counterpart to iOS's `.saveMedia` for `saveableAttachmentCount == 1` —
     * except Android opens rather than saves, since there is no gallery-equivalent
     * destination for a document/code/archive. */
    OpenFile,
    ShareFile,
    Pin,
    Unpin,
    Star,
    Unstar,
    Edit,
    DeleteForEveryone,
    DeleteForMe,
    Report,
    /** Opens the read-status ("Vues") fiche. */
    Views,
    /** Opens the edit-history fiche — only for an edited message. */
    History,
    /** Opens the sentiment fiche — only for a message carrying text. */
    Sentiment,
    /** Enters multi-select mode starting from this message. */
    Select,
    /** Exports the message as a shareable card. */
    ExportCard,
}

/**
 * Immutable, UI-free description of a message used to compose its long-press overlay
 * action menu. Built at the call site from the bubble plus the already-resolved
 * editability / deletability / pin state — never reaches into UI types.
 */
data class MessageActionContext(
    val isDeleted: Boolean,
    val isPending: Boolean,
    val isFailed: Boolean,
    val isOutgoing: Boolean,
    val isTranslated: Boolean,
    val isShowingOriginal: Boolean,
    val isStarred: Boolean,
    val canEdit: Boolean,
    val canDeleteForEveryone: Boolean,
    val pinAction: PinAction,
    /** The message carries at least one non-image/location/audio (FILE) attachment —
     * `BubbleContent.files.isNotEmpty()`. Gates [MessageAction.OpenFile] / [MessageAction.ShareFile]
     * independently of [isActionable]: opening/sharing a received file doesn't depend on this
     * message's own send state. */
    val hasOpenableFile: Boolean = false,
    /** The message was edited after being sent (gates [MessageAction.History]). */
    val isEdited: Boolean = false,
    /** The message carries a non-blank text body (gates sentiment and card export). */
    val hasText: Boolean = false,
    /** Which of the detail/selection entries the host can actually serve; inert (empty) by default. */
    val hostedEntries: Set<MessageAction> = emptySet(),
    /** What the message lets out of Meeshy — an exit it refuses is absent from the menu, never greyed out. */
    val exitOffer: MessageExitOffer = MessageExitOffer.Unrestricted,
    /** A conversation notice (join, leave, call summary): nobody answers or forwards a notice. */
    val isNotice: Boolean = false,
    /** A view-once message: it is opened, never quoted. */
    val isViewOnce: Boolean = false,
    /** The bubble still carries a client id (`cid_…`): the server does not know it yet. */
    val isUnconfirmed: Boolean = false,
    /** The reader may write in this conversation (`viewerCanWrite`): replying IS writing. */
    val canWrite: Boolean = true,
) {
    /**
     * A message is "actionable" — eligible for reply / forward / star / edit / delete —
     * only once it exists and is neither a still-in-flight nor a failed send. A deleted
     * tombstone, an optimistic pending bubble, or a failed send expose only the inert
     * affordances (copy on a still-present body, pin toggle).
     */
    val isActionable: Boolean
        get() = !isDeleted && !isPending && !isFailed

    /** `canReply` of the shared law: a live, server-known message the reader may answer in writing. */
    val offersReply: Boolean
        get() = offersRelay && !isViewOnce && canWrite

    /** `forward` of the shared law, its exit verdict aside ([MessageExitOffer]). */
    val offersForward: Boolean
        get() = offersRelay && exitOffer.offers(MessageExit.FORWARD)

    private val offersRelay: Boolean
        get() = isActionable && !isNotice && !isUnconfirmed
}

/**
 * Pure composition of the long-press overlay action menu — the single source of truth
 * for "which action, in what order". No UI dependency; exhaustively unit-tested. The
 * sheet is a dumb renderer over the [MessageAction] list this returns.
 */
object MessageActionMenu {
    fun actions(ctx: MessageActionContext): List<MessageAction> = buildList {
        if (ctx.offersReply) add(MessageAction.Reply)
        if (ctx.offersForward) add(MessageAction.Forward)
        if (ctx.isTranslated) {
            add(if (ctx.isShowingOriginal) MessageAction.ShowTranslation else MessageAction.ShowOriginal)
            add(MessageAction.ExploreLanguages)
        }
        if (!ctx.isDeleted && ctx.exitOffer.offers(MessageExit.COPY)) {
            add(MessageAction.Copy)
        }
        if (ctx.hasOpenableFile && ctx.exitOffer.offers(MessageExit.SHARE)) {
            add(MessageAction.OpenFile)
            add(MessageAction.ShareFile)
        }
        if (!ctx.isDeleted) {
            if (MessageAction.Select in ctx.hostedEntries) add(MessageAction.Select)
            if (MessageAction.ExportCard in ctx.hostedEntries && ctx.hasText && ctx.exitOffer.offers(MessageExit.IMAGINE)) add(MessageAction.ExportCard)
        }
        when (ctx.pinAction) {
            PinAction.Pin -> add(MessageAction.Pin)
            PinAction.Unpin -> add(MessageAction.Unpin)
            PinAction.Unavailable -> Unit
        }
        if (ctx.isActionable) {
            add(if (ctx.isStarred) MessageAction.Unstar else MessageAction.Star)
        }
        if (ctx.isOutgoing && ctx.isActionable && ctx.canEdit) {
            add(MessageAction.Edit)
        }
        if (ctx.isOutgoing && ctx.isActionable && ctx.canDeleteForEveryone) {
            add(MessageAction.DeleteForEveryone)
        }
        if (ctx.isActionable) {
            add(MessageAction.DeleteForMe)
        }
        // Information entries come after every action.
        if (!ctx.isDeleted) {
            if (MessageAction.Views in ctx.hostedEntries) add(MessageAction.Views)
            if (MessageAction.History in ctx.hostedEntries && ctx.isEdited) add(MessageAction.History)
            if (MessageAction.Sentiment in ctx.hostedEntries && ctx.hasText) add(MessageAction.Sentiment)
        }
        // Report is a moderation action against *someone else's* content — offered last, and only
        // for an incoming, still-present message. Diverges from iOS (which appends `.report`
        // unconditionally): reporting your own message is meaningless, so Android hides it.
        if (ctx.isActionable && !ctx.isOutgoing) {
            add(MessageAction.Report)
        }
    }
}
