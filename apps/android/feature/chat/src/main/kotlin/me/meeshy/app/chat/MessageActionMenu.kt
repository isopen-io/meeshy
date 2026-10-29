package me.meeshy.app.chat

import me.meeshy.sdk.model.ConversationClearance
import me.meeshy.sdk.model.MessageExit
import me.meeshy.sdk.model.MessageExitOffer
import me.meeshy.sdk.model.MessageMenuEntries
import me.meeshy.sdk.model.PinAction
import me.meeshy.sdk.model.PlainSignalAdmission

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
    /** Opens the map fiche — only for a message carrying a shared place. */
    Map,
    /** Enters multi-select mode starting from this message. */
    Select,
    /** Exports the message as a shareable card. */
    ExportCard,
    /** Opens the message's first link (iOS `.openLink`). */
    OpenLink,
    /** Copies the message's first link (iOS `.copyLink`). */
    CopyLink,
    /** Opens the reply thread of the message (iOS `.thread`). */
    Thread,
    /** Opens the language explorer on an untranslated text, which translates on demand (iOS `.translate`). */
    Translate,
    /** Saves the message's only photo or video to the gallery (iOS `.saveMedia`). */
    SaveMedia,
    /** Hands the message's text, or its only photo or sound, to the system share sheet (iOS `.share`). */
    Share,
    /** Opens the transcription fiche of an audio or video message (iOS `.transcription`). */
    Transcription,
    /** Opens the who-reacted fiche (iOS `.reactions`). */
    Reactions,
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
    /** The bubble carries a shared place the map fiche can show. */
    val hasPlace: Boolean = false,
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
    /** End-to-end encrypted and unopened here (#13110): nothing of it is copied or forwarded. */
    val isEndToEndSealed: Boolean = false,
    /** The iOS entries the law offers ([MessageMenuEntries]) — each still needs its host ([hostedEntries]). */
    val entries: Set<MessageMenuEntries.Entry> = emptySet(),
    /**
     * What the device knows of the conversation's mode, the thread included (#13790): reacting, pinning and deleting for
     * everyone are offered only when it is known clear ([PlainSignalAdmission]). Closed (unknown) until the host says.
     */
    val signalClearance: ConversationClearance = ConversationClearance.UNKNOWN,
) {
    /** The gestures an end-to-end conversation carries as encrypted signals, which this device cannot seal yet. */
    val offersPlainSignals: Boolean
        get() = PlainSignalAdmission.offers(signalClearance)

    /** The quick reaction strip of the menu (and its full picker). */
    val offersReaction: Boolean
        get() = isActionable && offersPlainSignals

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
        get() = offersRelay && !isEndToEndSealed && exitOffer.offers(MessageExit.FORWARD)

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
        fun addEntry(action: MessageAction) {
            if (action in ctx.hostedEntries && ENTRY_OF.getValue(action) in ctx.entries) add(action)
        }
        if (ctx.offersReply) add(MessageAction.Reply)
        addEntry(MessageAction.OpenLink)
        addEntry(MessageAction.CopyLink)
        if (ctx.offersForward) add(MessageAction.Forward)
        addEntry(MessageAction.Thread)
        if (ctx.isTranslated) {
            add(if (ctx.isShowingOriginal) MessageAction.ShowTranslation else MessageAction.ShowOriginal)
            add(MessageAction.ExploreLanguages)
        }
        addEntry(MessageAction.Translate)
        if (!ctx.isDeleted && !ctx.isEndToEndSealed && ctx.exitOffer.offers(MessageExit.COPY)) {
            add(MessageAction.Copy)
        }
        addEntry(MessageAction.SaveMedia)
        addEntry(MessageAction.Share)
        if (ctx.hasOpenableFile && ctx.exitOffer.offers(MessageExit.SHARE)) {
            add(MessageAction.OpenFile)
            add(MessageAction.ShareFile)
        }
        if (!ctx.isDeleted) {
            if (MessageAction.Select in ctx.hostedEntries) add(MessageAction.Select)
            if (MessageAction.ExportCard in ctx.hostedEntries && ctx.hasText && ctx.exitOffer.offers(MessageExit.IMAGINE)) add(MessageAction.ExportCard)
        }
        if (ctx.offersPlainSignals) {
            when (ctx.pinAction) {
                PinAction.Pin -> add(MessageAction.Pin)
                PinAction.Unpin -> add(MessageAction.Unpin)
                PinAction.Unavailable -> Unit
            }
        }
        if (ctx.isActionable) {
            add(if (ctx.isStarred) MessageAction.Unstar else MessageAction.Star)
        }
        if (ctx.isOutgoing && ctx.isActionable && ctx.canEdit) {
            add(MessageAction.Edit)
        }
        if (ctx.isOutgoing && ctx.isActionable && ctx.canDeleteForEveryone && ctx.offersPlainSignals) {
            add(MessageAction.DeleteForEveryone)
        }
        if (ctx.isActionable) {
            add(MessageAction.DeleteForMe)
        }
        // Information entries come after every action, in iOS's order: transcription, reactions, views…
        addEntry(MessageAction.Transcription)
        addEntry(MessageAction.Reactions)
        if (!ctx.isDeleted) {
            if (MessageAction.Views in ctx.hostedEntries) add(MessageAction.Views)
            if (MessageAction.History in ctx.hostedEntries && ctx.isEdited) add(MessageAction.History)
            if (MessageAction.Sentiment in ctx.hostedEntries && ctx.hasText) add(MessageAction.Sentiment)
            if (MessageAction.Map in ctx.hostedEntries && ctx.hasPlace) add(MessageAction.Map)
        }
        // Report is a moderation action against *someone else's* content — offered last, and only
        // for an incoming, still-present message. Diverges from iOS (which appends `.report`
        // unconditionally): reporting your own message is meaningless, so Android hides it.
        if (ctx.isActionable && !ctx.isOutgoing) {
            add(MessageAction.Report)
        }
    }

    private val ENTRY_OF: Map<MessageAction, MessageMenuEntries.Entry> = mapOf(
        MessageAction.OpenLink to MessageMenuEntries.Entry.OPEN_LINK,
        MessageAction.CopyLink to MessageMenuEntries.Entry.COPY_LINK,
        MessageAction.Thread to MessageMenuEntries.Entry.THREAD,
        MessageAction.Translate to MessageMenuEntries.Entry.TRANSLATE,
        MessageAction.SaveMedia to MessageMenuEntries.Entry.SAVE_MEDIA,
        MessageAction.Share to MessageMenuEntries.Entry.SHARE,
        MessageAction.Transcription to MessageMenuEntries.Entry.TRANSCRIPTION,
        MessageAction.Reactions to MessageMenuEntries.Entry.REACTIONS,
    )
}
