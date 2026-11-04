package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity
import timber.log.Timber

/** Mutation kinds the outbox can carry (ARCHITECTURE.md §5). */
public enum class OutboxKind {
    SEND_MESSAGE,
    EDIT_MESSAGE,
    DELETE_MESSAGE,
    ADD_REACTION,
    REMOVE_REACTION,
    READ_RECEIPT,
    MARK_UNREAD,
    UPDATE_CONVERSATION_PREFS,
    UPDATE_PROFILE,
    UPDATE_SETTINGS,
    UPDATE_PRIVACY_SETTINGS,
    PUBLISH_STORY,
    UPLOAD_MEDIA,
    BLOCK_USER,
    UNBLOCK_USER,
    SEND_FRIEND_REQUEST,
    PIN_MESSAGE,
    UNPIN_MESSAGE,
    LIKE_POST,
    UNLIKE_POST,
    BOOKMARK_POST,
    UNBOOKMARK_POST,
    RESPOND_FRIEND_REQUEST,
    REPORT_ATTACHMENT_STATUS,
    UPDATE_AUDIO_SETTINGS,
    CREATE_POST,
    CREATE_COMMENT,
    CONSUME_AFTER_READ,
    CONSUME_VIEW_ONCE,

    /** Un message chiffré de bout en bout (#14591) : la ligne ne porte aucun clair, il attend au coffre E2EE. */
    SEND_E2EE_MESSAGE,

    /** Le thème du bloc application (`PATCH /me/preferences/application`) : jamais de consentement (#4180). */
    UPDATE_APPLICATION_SETTINGS,

    /** Une republication directe (#15067) : la story d'un autre repart en story, en post ou en réel, hors ligne comprise. */
    REPOST_POST,

    /** Une conversation créée hors ligne (#15179) : sa ligne optimiste `pending_<uuid>` est réconciliée avec l'id serveur. */
    CREATE_CONVERSATION,

    /** Titre, description et avatar d'une conversation (#15179) : fusionnés champ par champ, le dernier gagne. */
    UPDATE_CONVERSATION,

    /** Un réglage de compte générique (endpoint, méthode, corps) (#15179) : FIFO entre endpoints, fusion par couple. */
    SETTINGS_ACTION,

    /** Une réaction de story posée hors ligne : l'emoji affiché reste vrai, il part au retour du réseau. */
    REACT_STORY,

    /** « Supprimer pour moi » (#15415) : le message disparaît chez moi seul, le rejeu est sans effet de plus. */
    HIDE_FOR_ME,

    /** Le geste inverse de [HIDE_FOR_ME] : il s'annule avec lui s'ils sont encore en file. */
    RESTORE_FOR_ME,

    /** Une pièce retirée d'un message déjà accusé : le 404 d'un rejeu vaut succès. */
    REMOVE_ATTACHMENT,

    /** Un message retiré par la modération avec son motif : le 404 d'un rejeu vaut succès. */
    MODERATION_DELETE,

    /** L'accusé de RÉCEPTION de toute une conversation : informatif, jamais compté dans la pastille de synchronisation. */
    MARK_RECEIVED,

    /** Le repost PRIVÉ d'une story dans une conversation (iOS `repostStory`) : la cible est la story, la charge porte la conversation. */
    REPOST_STORY,

    /** Le « vu » d'une story : binaire, idempotent, coalescé par story, jamais compté dans la pastille de synchronisation. */
    MARK_STORY_VIEWED,

    /** Un commentaire supprimé hors ligne : il disparaît à l'instant, la suppression part au retour du réseau. */
    DELETE_COMMENT,

    /** Le coeur d'un commentaire posé ou retiré : l'état voulu voyage dans la charge, deux gestes opposés s'annulent. */
    TOGGLE_LIKE_COMMENT,

    /**
     * Le bloc de préférences d'UNE catégorie (`PATCH /me/preferences/{categorie}`), cliché complet : la catégorie est la
     * CIBLE de la ligne, donc deux écritures de la même catégorie ne font qu'une ligne et deux catégories ne se
     * supplantent jamais. Un seul type pour les sept catégories (iOS `updateSettings`).
     */
    UPDATE_PREFERENCE_CATEGORY,

    /** Quitter une conversation (#15920) : la ligne tombe à l'instant, la requête part au retour du réseau, jamais fusionnée. */
    LEAVE_CONVERSATION,

    /** « Supprimer pour moi » une conversation (#15920) : retrait optimiste, rejeu hors ligne, jamais fusionné. */
    DELETE_CONVERSATION_FOR_ME,

    /** Terminer une conversation pour tous (#15920) : retrait optimiste, rejeu hors ligne, jamais fusionné. */
    DELETE_CONVERSATION_FOR_ALL,

    /**
     * La déclaration d'une capture d'un contenu qui disparaît (#9617) : DURABLE, rejouée avec le recul exponentiel tant que la
     * passerelle l'accepte ; seul un refus FINAL la fait partir. Jamais comptée dans la pastille de synchronisation.
     */
    REPORT_CONTENT_CAPTURE,
}

/** Lifecycle of an outbox row; a succeeded mutation is deleted, never flagged. */
public enum class OutboxState {
    PENDING,
    INFLIGHT,
    EXHAUSTED,
}

/**
 * The row's kind, or `null` when a NEWER build wrote a kind this one does not know. Never
 * `OutboxKind.valueOf`, which throws: an unknown row is ignored (and logged), not a crash.
 */
public val OutboxEntity.kindEnum: OutboxKind?
    get() = OutboxKindCatalog.fromDiskValue(kind) ?: run {
        Timber.w("Outbox row %s has unknown kind %s: ignored", cmid, kind)
        null
    }

public val OutboxEntity.stateEnum: OutboxState
    get() = OutboxState.valueOf(state)

/**
 * Lane assignment (ARCHITECTURE.md §5): messages are strict FIFO per
 * conversation; everything else drains on its own independent lane so a stuck
 * row never head-of-line blocks unrelated mutations.
 */
public object OutboxLanes {
    public fun forMessage(conversationId: String): String = "message:$conversationId"
    public const val REACTION: String = "reaction"
    public const val READ_RECEIPT: String = "readReceipt"
    public const val CONVERSATION_PREFS: String = "conversationPrefs"
    public const val PRESENCE: String = "presence"
    public const val SOCIAL: String = "social"
    public const val STORY: String = "story"
    public const val MEDIA: String = "media"
    public const val PROFILE: String = "profile"
    public const val SETTINGS: String = "settings"
    public const val BLOCK: String = "block"
    public const val FRIEND: String = "friend"
    public const val PIN: String = "pin"
    public const val MEDIA_STATUS: String = "mediaStatus"
    public const val POST: String = "post"
    public const val COMMENT: String = "comment"
    public const val CONSUMPTION: String = "consumption"
    public const val CONVERSATION: String = "conversation"

    /** Les déclarations de capture : une lane à elles, un rapport coincé ne retient ni un accusé de lecture ni un message. */
    public const val CAPTURE: String = "capture"

    /** Quitter / supprimer une conversation (#15920) : une lane à elle, un retrait coincé ne retient ni une création ni un renommage. */
    public const val CONVERSATION_STATE: String = "conversationState"

    /** Les « vus » de story : une lane à eux, pour qu'un rapport coincé ne retienne jamais une publication. */
    public const val STORY_VIEW: String = "storyView"

    /**
     * #13820 — une lane dont les lignes ne s'ordonnent pas entre elles : chaque téléversement est indépendant (l'ordre d'un
     * message se tient par son `dependsOn`, jamais par la lane média), donc une pièce qui attend ne retient pas les suivantes.
     */
    public fun isIndependent(lane: String): Boolean = lane == MEDIA

    /**
     * #14697 — une lane de messages ne retient pas ses messages derrière une pièce qui se téléverse encore : le message qui
     * l'attend attend SEUL (son ordre se tient par son `dependsOn`), ceux composés après lui partent dans leur ordre. Un échec
     * transitoire ou une ligne pas encore due, eux, tiennent toujours la lane (FIFO).
     */
    public fun passesOverWaitingMedia(lane: String): Boolean = lane.startsWith(forMessage(""))
}

/**
 * The lane category a mutation kind drains on. Message mutations share a
 * per-conversation FIFO lane whose concrete id is only known at enqueue time
 * (from the conversation id), so they carry no fixed lane string here; every
 * other kind drains on exactly one fixed shared lane.
 */
public sealed interface OutboxLaneAssignment {
    /** Drains on the dynamic per-conversation message lane ([OutboxLanes.forMessage]). */
    public data object PerConversation : OutboxLaneAssignment

    /** Drains on one fixed shared lane. */
    public data class Shared(val lane: String) : OutboxLaneAssignment
}

/**
 * Single source of truth mapping each [OutboxKind] to the lane it drains on.
 *
 * The worker derives its shared-lane drain sweep from [sharedDrainLanes] rather
 * than a hand-maintained list, so a kind that has a registered sender can never
 * again be enqueued onto a lane the worker forgets to drain — the BLOCK/FRIEND
 * omission bug (see NOTES 2026-07-04) is structurally impossible once every kind
 * has an assignment here (enforced by the exhaustive `when`).
 */
public object OutboxLaneMap {
    public fun assignmentFor(kind: OutboxKind): OutboxLaneAssignment = when (kind) {
        OutboxKind.SEND_MESSAGE,
        OutboxKind.EDIT_MESSAGE,
        OutboxKind.DELETE_MESSAGE,
        OutboxKind.SEND_E2EE_MESSAGE,
        -> OutboxLaneAssignment.PerConversation

        OutboxKind.ADD_REACTION,
        OutboxKind.REMOVE_REACTION,
        -> OutboxLaneAssignment.Shared(OutboxLanes.REACTION)

        OutboxKind.READ_RECEIPT,
        OutboxKind.MARK_UNREAD,
        -> OutboxLaneAssignment.Shared(OutboxLanes.READ_RECEIPT)

        OutboxKind.UPDATE_CONVERSATION_PREFS ->
            OutboxLaneAssignment.Shared(OutboxLanes.CONVERSATION_PREFS)
        OutboxKind.UPDATE_PROFILE -> OutboxLaneAssignment.Shared(OutboxLanes.PROFILE)
        OutboxKind.UPDATE_SETTINGS -> OutboxLaneAssignment.Shared(OutboxLanes.SETTINGS)
        OutboxKind.UPDATE_PRIVACY_SETTINGS -> OutboxLaneAssignment.Shared(OutboxLanes.SETTINGS)
        OutboxKind.UPDATE_AUDIO_SETTINGS -> OutboxLaneAssignment.Shared(OutboxLanes.SETTINGS)
        OutboxKind.UPDATE_APPLICATION_SETTINGS -> OutboxLaneAssignment.Shared(OutboxLanes.SETTINGS)
        OutboxKind.SETTINGS_ACTION -> OutboxLaneAssignment.Shared(OutboxLanes.SETTINGS)
        OutboxKind.CREATE_CONVERSATION,
        OutboxKind.UPDATE_CONVERSATION,
        -> OutboxLaneAssignment.Shared(OutboxLanes.CONVERSATION)
        OutboxKind.PUBLISH_STORY -> OutboxLaneAssignment.Shared(OutboxLanes.STORY)
        OutboxKind.UPLOAD_MEDIA -> OutboxLaneAssignment.Shared(OutboxLanes.MEDIA)

        OutboxKind.BLOCK_USER,
        OutboxKind.UNBLOCK_USER,
        -> OutboxLaneAssignment.Shared(OutboxLanes.BLOCK)

        OutboxKind.SEND_FRIEND_REQUEST,
        OutboxKind.RESPOND_FRIEND_REQUEST,
        -> OutboxLaneAssignment.Shared(OutboxLanes.FRIEND)

        OutboxKind.PIN_MESSAGE,
        OutboxKind.UNPIN_MESSAGE,
        -> OutboxLaneAssignment.Shared(OutboxLanes.PIN)

        OutboxKind.LIKE_POST,
        OutboxKind.UNLIKE_POST,
        OutboxKind.BOOKMARK_POST,
        OutboxKind.UNBOOKMARK_POST,
        OutboxKind.REPOST_POST,
        OutboxKind.REACT_STORY,
        -> OutboxLaneAssignment.Shared(OutboxLanes.SOCIAL)

        OutboxKind.REPORT_ATTACHMENT_STATUS -> OutboxLaneAssignment.Shared(OutboxLanes.MEDIA_STATUS)
        OutboxKind.CREATE_POST -> OutboxLaneAssignment.Shared(OutboxLanes.POST)
        OutboxKind.CREATE_COMMENT -> OutboxLaneAssignment.Shared(OutboxLanes.COMMENT)
        OutboxKind.CONSUME_AFTER_READ,
        OutboxKind.CONSUME_VIEW_ONCE,
        -> OutboxLaneAssignment.Shared(OutboxLanes.CONSUMPTION)

        OutboxKind.HIDE_FOR_ME,
        OutboxKind.RESTORE_FOR_ME,
        -> OutboxLaneAssignment.Shared(OutboxChatLanes.PERSONAL_HIDING)
        OutboxKind.REMOVE_ATTACHMENT,
        OutboxKind.MODERATION_DELETE,
        -> OutboxLaneAssignment.Shared(OutboxChatLanes.CONTENT_REMOVAL)
        OutboxKind.MARK_RECEIVED -> OutboxLaneAssignment.Shared(OutboxLanes.READ_RECEIPT)
        OutboxKind.REPOST_STORY -> OutboxLaneAssignment.Shared(OutboxLanes.SOCIAL)
        OutboxKind.MARK_STORY_VIEWED -> OutboxLaneAssignment.Shared(OutboxLanes.STORY_VIEW)
        OutboxKind.DELETE_COMMENT,
        OutboxKind.TOGGLE_LIKE_COMMENT,
        -> OutboxLaneAssignment.Shared(OutboxLanes.COMMENT)
        OutboxKind.UPDATE_PREFERENCE_CATEGORY -> OutboxLaneAssignment.Shared(OutboxLanes.SETTINGS)
        OutboxKind.LEAVE_CONVERSATION,
        OutboxKind.DELETE_CONVERSATION_FOR_ME,
        OutboxKind.DELETE_CONVERSATION_FOR_ALL,
        -> OutboxLaneAssignment.Shared(OutboxLanes.CONVERSATION_STATE)
        OutboxKind.REPORT_CONTENT_CAPTURE -> OutboxLaneAssignment.Shared(OutboxLanes.CAPTURE)
    }

    /**
     * Every fixed shared lane at least one mutation kind drains on, in stable
     * enum-declaration order, deduplicated. The worker drains exactly these
     * (plus the dynamic per-conversation message lanes), so no registered kind
     * is ever stranded.
     */
    public val sharedDrainLanes: List<String> = OutboxKind.entries
        .asSequence()
        .map(::assignmentFor)
        .filterIsInstance<OutboxLaneAssignment.Shared>()
        .map { it.lane }
        .distinct()
        .toList()
}

/**
 * Whether a row's [OutboxEntity.dependsOn] prerequisite lets it run yet
 * (ARCHITECTURE.md §5). The dependency is resolved purely from the prerequisite
 * row's current state, so it is fully testable without a database.
 */
public enum class DependencyVerdict {
    /** No prerequisite, or the prerequisite was delivered (its row is gone). */
    SATISFIED,

    /** The prerequisite is still queued (`PENDING`/`INFLIGHT`) — hold the dependent. */
    BLOCKED,

    /** The prerequisite gave up (`EXHAUSTED`) — the dependent can never run. */
    FAILED,
}

/** Resolves a `dependsOn` gate from the prerequisite row's current state. */
public object OutboxDependencies {
    /**
     * @param prerequisiteState the [OutboxState] of the `dependsOn` row, or `null`
     *   when that row is no longer in the queue (delivered and deleted, or
     *   user-discarded). A gone prerequisite is treated as satisfied: a chain is
     *   always enqueued prerequisite-first, so by drain time an absent row has
     *   already succeeded.
     */
    public fun verdict(prerequisiteState: OutboxState?): DependencyVerdict =
        when (prerequisiteState) {
            null -> DependencyVerdict.SATISFIED
            OutboxState.EXHAUSTED -> DependencyVerdict.FAILED
            OutboxState.PENDING, OutboxState.INFLIGHT -> DependencyVerdict.BLOCKED
        }

    /**
     * Resolves a gate over **several** prerequisites (a dependent enqueued behind
     * more than one upload — see [OutboxDependencyKey]). The dependent may only run
     * once **all** are satisfied, and is doomed the moment **any** is doomed:
     *
     * - any `EXHAUSTED` → [DependencyVerdict.FAILED] — a single dead prerequisite
     *   means the dependent can never run; cascade-exhaust now rather than wait.
     * - else any `PENDING`/`INFLIGHT` → [DependencyVerdict.BLOCKED] — still waiting.
     * - else (every prerequisite gone) → [DependencyVerdict.SATISFIED].
     *
     * An empty list is [DependencyVerdict.SATISFIED] — an unconstrained row.
     */
    public fun verdictAll(prerequisiteStates: List<OutboxState?>): DependencyVerdict {
        val verdicts = prerequisiteStates.map(::verdict)
        return when {
            verdicts.any { it == DependencyVerdict.FAILED } -> DependencyVerdict.FAILED
            verdicts.any { it == DependencyVerdict.BLOCKED } -> DependencyVerdict.BLOCKED
            else -> DependencyVerdict.SATISFIED
        }
    }
}

/**
 * Payload of an `ADD_REACTION` / `REMOVE_REACTION` outbox row. [conversationId] (#13790) lets the plaintext guard judge the
 * row even once its message left Room; a row queued by an older build carries none and is judged by its cached message.
 */
@kotlinx.serialization.Serializable
public data class ReactionPayload(val emoji: String, val conversationId: String? = null)

/**
 * Payload of an `UPLOAD_MEDIA` outbox row. [uploadContext] is the TUS
 * `uploadcontext` wire string (`me.meeshy.sdk.model.media.TusUploadContext.wire`,
 * e.g. `"story"`) the item was durably queued under, or `null` for a legacy
 * `MessageAttachment` upload (chat attachments — `POST /attachments/upload`, the
 * only path before TUS existed). Kept as a plain `String` rather than the enum
 * itself so a row enqueued by a newer app build with a context value an OLDER
 * build (mid-rollout, same device) doesn't know about still decodes — the drain
 * sender treats an unrecognised string the same as `null` (legacy path), never a
 * crash. An empty/blank row payload (every row enqueued before this field
 * existed) also decodes as "no context" — see `OutboxFlushWorker`'s `UPLOAD_MEDIA`
 * sender.
 *
 * [conversationId] is the chat conversation the upload is destined for (#12956), read by
 * `EndToEndOutboxAdmission` before the bytes leave: an upload drained before its message
 * row exists is still withheld from an end-to-end encrypted conversation. `null` for a
 * story/post/profile upload, and for every row enqueued before this field existed.
 */
@kotlinx.serialization.Serializable
public data class MediaUploadPayload(val uploadContext: String? = null, val conversationId: String? = null)

/**
 * Payload of a `CREATE_COMMENT` outbox row. The row's `targetId` is the post commented (a server id: the route
 * `POST /posts/:id/comments`), its `cmid` the idempotency key sent as `X-Client-Mutation-Id`. [parentId] is the comment
 * answered (`null` = root comment); [originalLanguage] is `null` when the author declared none (the gateway detects it).
 */
@kotlinx.serialization.Serializable
public data class CommentPayload(
    val content: String,
    val parentId: String? = null,
    val originalLanguage: String? = null,
    /** Medias already uploaded under the `comment` context that leave with the comment (#15448). Absent on old rows. */
    val attachmentIds: List<String>? = null,
    val effectFlags: Int? = null,
    val location: me.meeshy.sdk.model.SharedPlace? = null,
    /** L'ancre du média cité du post commenté (#6578) ; absente sur une ancienne ligne. */
    val quotedPostMediaId: String? = null,
    /** Les pièces encore sur le disque et ce qui en est déjà téléversé (#9743) ; absent sans pièce et sur une ancienne ligne. */
    val media: me.meeshy.sdk.post.CommentMediaPayload? = null,
)

/**
 * Payload of a `REPOST_POST` outbox row (#15067). The row's `targetId` is the source post (a server id: the route
 * `POST /posts/:id/repost`), its `cmid` the idempotency key sent as `X-Client-Mutation-Id`. [targetType] is the wire type
 * of the destination (`STORY` | `POST` | `REEL`); a bare repost carries no quote and inherits the original's audience.
 */
@kotlinx.serialization.Serializable
public data class RepostPayload(val targetType: String, val content: String? = null, val isQuote: Boolean = false)

/**
 * Payload of a `REPOST_STORY` outbox row (iOS `RepostStoryPayload`). The row's `targetId` is the source story;
 * [targetConversationId] is the conversation the private repost lands in.
 */
@kotlinx.serialization.Serializable
public data class RepostStoryPayload(val targetConversationId: String)

/**
 * Payload of a `MARK_STORY_VIEWED` outbox row (iOS `MarkStoryViewedPayload`). The row's `targetId` is the story, so ten
 * views of the same story are one row. [provenance] and [origin] are raw strings: a value a newer build wrote reads back.
 */
@kotlinx.serialization.Serializable
public data class MarkStoryViewedPayload(val provenance: String? = null, val origin: String? = null)

/** Payload of a `DELETE_COMMENT` outbox row. The row's `targetId` is the comment; the route also needs its [postId]. */
@kotlinx.serialization.Serializable
public data class DeleteCommentPayload(val postId: String)

/**
 * Payload of a `TOGGLE_LIKE_COMMENT` outbox row. The row's `targetId` is the comment; [liked] is the state the author
 * wants, so a like then an unlike of the same comment cancel each other before any request leaves.
 */
@kotlinx.serialization.Serializable
public data class ToggleLikeCommentPayload(val postId: String, val liked: Boolean)

/**
 * Payload of a `REACT_STORY` outbox row. The row's `targetId` is the story (a server id: the route `POST /posts/:id/like`),
 * so two taps of the same emoji on the same story coalesce into one row.
 */
@kotlinx.serialization.Serializable
public data class StoryReactionPayload(val emoji: String)

/**
 * Payload of a `PIN_MESSAGE` / `UNPIN_MESSAGE` outbox row. The row's `targetId`
 * is the message id (so a pin+unpin of the same message coalesces per-message);
 * the pin/unpin REST route also needs the enclosing conversation id, which the
 * client already knows at enqueue time, so it travels here rather than being
 * re-derived from the cache at drain time.
 */
@kotlinx.serialization.Serializable
public data class PinPayload(val conversationId: String)

/**
 * Payload of a `CONSUME_AFTER_READ` outbox row (#13995, iOS `ConsumeAfterReadPayload`). The row's
 * `targetId` is the conversation; the flamme-œil messages the reader saw before leaving travel here.
 */
@kotlinx.serialization.Serializable
public data class ConsumeAfterReadPayload(val messageIds: List<String>)

/**
 * Payload of a `CONSUME_VIEW_ONCE` outbox row (#13995). The row's `targetId` is the message; the
 * route also needs its conversation.
 */
@kotlinx.serialization.Serializable
public data class ConsumeViewOncePayload(val conversationId: String)

/**
 * Payload of a `SEND_FRIEND_REQUEST` outbox row. The receiver is the row's
 * `targetId` (so a repeated send to the same receiver coalesces per-target); the
 * optional greeting travels here, and so does the level a circles raise aims at
 * ([targetLevel], #13938) — a row written before that field reads back without it
 * (`null` = Friend, the historical meaning).
 */
@kotlinx.serialization.Serializable
public data class FriendRequestPayload(val message: String? = null, val targetLevel: String? = null)

/**
 * Payload of a `RESPOND_FRIEND_REQUEST` outbox row. The row's `targetId` is the request id
 * (so two answers to the same request coalesce, the last one winning); [action] is the wire
 * value (`accept` | `reject`) and [userId] the OTHER user, needed to roll the optimistic
 * friendship state back without a lookup.
 */
@kotlinx.serialization.Serializable
public data class FriendRespondPayload(val action: String, val userId: String)

/**
 * Payload of a `READ_RECEIPT` outbox row: what the reader saw and in which language, resolved when the receipt was
 * COMPOSED (never at send time). Every field is optional — a row queued before this payload (`"{}"`) is a plain
 * conversation-wide receipt.
 */
@kotlinx.serialization.Serializable
public data class ReadReceiptPayload(
    val messageIds: List<String>? = null,
    val language: String? = null,
    val messageLanguages: Map<String, String>? = null,
    val caughtUpToMessageId: String? = null,
)

/**
 * Payload of an `UPDATE_CONVERSATION_PREFS` outbox row — the full desired
 * per-user preference snapshot at enqueue time. Carrying the complete snapshot
 * (computed from the already-mutated cache) makes coalescing a plain
 * latest-wins replace: a later pin+mute snapshot subsumes an earlier pin-only
 * one without losing either field.
 */
@kotlinx.serialization.Serializable
public data class ConversationPrefsPayload(
    val isPinned: Boolean,
    val isMuted: Boolean,
    val isArchived: Boolean,
    val mentionsOnly: Boolean,
    /**
     * The conversation's assigned user category (`null` = uncategorized), carried
     * so a drag-to-category reassignment persists through the same snapshot lane.
     * A `null` value serializes away (the shared `explicitNulls = false` JSON), so
     * an unrelated pin/mute snapshot of an uncategorized row never blanks a category
     * server-side — the gateway leaves an omitted `categoryId` untouched.
     */
    val categoryId: String? = null,
    /**
     * The conversation's per-user nickname — `null` here means "unrelated
     * snapshot, leave the name untouched" (same `explicitNulls = false`
     * omission trick as [categoryId]). Clearing an EXISTING name is therefore
     * NEVER represented as `null`: [ConversationRepository.setCustomNameOptimistic]
     * stores an explicit empty string, which serializes as `"customName":""`
     * (empty string is not null — the encoder does not drop it) and reaches
     * the gateway as a real clear. The read side already treats a blank name
     * the same as absent ([ApiConversation.displayTitle]/[ConversationFilter]).
     */
    val customName: String? = null,
    /**
     * The conversation's favorite-reaction emoji (drives the FAVORITES filter
     * tab). Same null-vs-empty-string convention as [customName]: `null` means
     * "unrelated snapshot", an explicit `""` means "clear the favorite" and
     * reaches the gateway as a real clear rather than being dropped by the
     * shared `explicitNulls = false` encoder.
     */
    val reaction: String? = null,
    /**
     * The conversation's full personal tag set — `null` means "unrelated
     * snapshot, leave the tags untouched"; an explicit (possibly empty) list
     * is the new desired set. Unlike [customName]/[reaction], no
     * empty-string sentinel is needed here: `[]` is a real, non-null JSON
     * array the `explicitNulls = false` encoder never drops.
     */
    val tags: List<String>? = null,
    /**
     * The reader's personal background + accent (`ConversationAppearance.toWire`); `null` leaves it untouched
     * server-side. Unlike the other fields it is NOT part of every snapshot: it rides only the snapshot that
     * changed it (the gateway re-validates a background — pack owned, photo still readable — and a stale one
     * would refuse an unrelated pin), and [OutboxCoalescer] carries it onto any snapshot that supersedes it.
     */
    val appearance: kotlinx.serialization.json.JsonElement? = null,
    /**
     * This snapshot takes the conversation OUT of its category (#13784, iOS `category.remove`). A `null`
     * [categoryId] alone means "leave it untouched" (the encoder drops it), so a removal needs this flag,
     * which the sender turns into an explicit `"categoryId": null`. Like [appearance] it rides only the
     * snapshot that made the change, and [OutboxCoalescer] carries it onto an uncategorized snapshot that
     * supersedes it.
     */
    val clearCategory: Boolean = false,
    /**
     * Ce que la ligne valait AVANT l'application optimiste : de quoi la restaurer si la file abandonne (retour arrière).
     * Absent d'une ligne écrite avant ce champ ; [OutboxCoalescer] garde celui de la plus ancienne ligne remplacée,
     * car c'est l'état que le serveur connaît encore.
     */
    val previous: ConversationPrefsPrevious? = null,
)

/**
 * L'état des préférences avant l'écriture optimiste d'un instantané ([ConversationPrefsPayload.previous]).
 * [baseVersion] est la version des préférences à cet instant : une diffusion plus récente depuis a déjà fait
 * foi, et le retour arrière ne la défait pas.
 */
@kotlinx.serialization.Serializable
public data class ConversationPrefsPrevious(
    val baseVersion: Int = 0,
    val isPinned: Boolean = false,
    val isMuted: Boolean = false,
    val isArchived: Boolean = false,
    val mentionsOnly: Boolean = false,
    val categoryId: String? = null,
    val customName: String? = null,
    val reaction: String? = null,
    val tags: List<String>? = null,
)

/**
 * Input to [OutboxRepository.enqueue] — a mutation to deliver.
 *
 * [dependsOn] is the **set** of prerequisite `cmid`s this row must wait for; it is
 * persisted as one encoded column ([OutboxDependencyKey]). An empty set is an
 * unconstrained row. Most mutations have no prerequisite (the default).
 */
public data class OutboxMutation(
    val kind: OutboxKind,
    val lane: String,
    val targetId: String,
    val payload: String,
    val dependsOn: Set<String> = emptySet(),
    val cmid: String = OutboxIds.cmid(),
)

internal fun OutboxMutation.toEntity(now: Long, ownerId: String? = null): OutboxEntity = OutboxEntity(
    cmid = cmid,
    lane = lane,
    kind = kind.name,
    targetId = targetId,
    payload = payload,
    dependsOn = OutboxDependencyKey.encode(dependsOn),
    attempts = 0,
    state = OutboxState.PENDING.name,
    createdAt = now,
    updatedAt = now,
    ownerId = ownerId,
)

/** Terminal (or near-terminal) signal for a queued mutation, keyed by [cmid]. */
/** Ce que « Supprimer » a fait d'une ligne ([OutboxRepository.withdrawUnlessInflight]). */
public sealed interface OutboxWithdrawal {
    /** Aucune ligne : elle a déjà été livrée (ou retirée). */
    public data object Absent : OutboxWithdrawal

    /** Un drainer l'a réservée : la marque d'annulation est posée, la ligne reste. */
    public data object Marked : OutboxWithdrawal

    /** Retirée avant tout envoi ; [row] est la ligne telle qu'elle était, pour nettoyer ce qui en dépendait. */
    public data class Removed(val row: OutboxEntity) : OutboxWithdrawal
}

public sealed interface OutboxOutcome {
    public val cmid: String

    /** Delivered and acknowledged by the gateway. */
    public data class Succeeded(override val cmid: String) : OutboxOutcome

    /** Gave up after the maximum number of attempts — surfaced to the user. */
    public data class Exhausted(override val cmid: String, val reason: String) : OutboxOutcome

    /** Replaced by a newer mutation of the same target (coalesced). */
    public data class Superseded(override val cmid: String) : OutboxOutcome

    /** Annihilated before delivery (e.g. send + delete, reaction toggle). */
    public data class Cancelled(override val cmid: String) : OutboxOutcome
}
