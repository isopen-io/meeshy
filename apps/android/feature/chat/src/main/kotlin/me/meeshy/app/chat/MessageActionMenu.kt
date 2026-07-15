package me.meeshy.app.chat

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
    Pin,
    Unpin,
    Star,
    Unstar,
    Edit,
    DeleteForEveryone,
    DeleteForMe,
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
) {
    /**
     * A message is "actionable" — eligible for reply / forward / star / edit / delete —
     * only once it exists and is neither a still-in-flight nor a failed send. A deleted
     * tombstone, an optimistic pending bubble, or a failed send expose only the inert
     * affordances (copy on a still-present body, pin toggle).
     */
    val isActionable: Boolean
        get() = !isDeleted && !isPending && !isFailed
}

/**
 * Pure composition of the long-press overlay action menu — the single source of truth
 * for "which action, in what order". No UI dependency; exhaustively unit-tested. The
 * sheet is a dumb renderer over the [MessageAction] list this returns.
 */
object MessageActionMenu {
    fun actions(ctx: MessageActionContext): List<MessageAction> = buildList {
        if (ctx.isActionable) {
            add(MessageAction.Reply)
            add(MessageAction.Forward)
        }
        if (ctx.isTranslated) {
            add(if (ctx.isShowingOriginal) MessageAction.ShowTranslation else MessageAction.ShowOriginal)
            add(MessageAction.ExploreLanguages)
        }
        if (!ctx.isDeleted) {
            add(MessageAction.Copy)
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
    }
}
