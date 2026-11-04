package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import me.meeshy.sdk.model.outbox.OutboxFieldMerge
import me.meeshy.sdk.net.MeeshyApi

/** Outcome of coalescing an incoming mutation against the pending queue (ARCHITECTURE.md §5). */
public sealed interface CoalesceDecision {

    /** Persist [row] as a new pending mutation. */
    public data class Enqueue(val row: OutboxEntity) : CoalesceDecision

    /** Persist [row] and remove the now-superseded [supersededCmids]. */
    public data class Replace(
        val supersededCmids: List<String>,
        val row: OutboxEntity,
    ) : CoalesceDecision

    /** The incoming mutation cancels [cancelledCmids]; nothing new is persisted. */
    public data class Annihilate(val cancelledCmids: List<String>) : CoalesceDecision
}

/**
 * In-queue coalescing (ARCHITECTURE.md §5):
 * - send + delete of the same unsent message cancels both;
 * - a repeated edit / read-receipt merges, keeping the latest;
 * - a delete supersedes pending edits of the same message;
 * - a reaction toggle (add then remove, or remove then add) cancels itself;
 * - a read-then-unread (or unread-then-read) toggle of the same conversation cancels
 *   itself — both are opposite terminal states of one read cursor, so the pair returns
 *   the target to the last-synced server state exactly like block/unblock; a repeated
 *   read receipt (or repeated mark-unread) keeps only the latest;
 * - a block/unblock toggle of the same user cancels itself, and a repeated
 *   block (or unblock) keeps only the latest (idempotent terminal state);
 * - a pin/unpin toggle of the same message cancels itself, and a repeated
 *   pin (or unpin) keeps only the latest (same idempotent-terminal rule);
 * - a like/unlike toggle of the same post cancels itself, and a repeated
 *   like (or unlike) keeps only the latest (same idempotent-terminal rule);
 * - a bookmark/unbookmark toggle of the same post cancels itself, and a repeated
 *   bookmark (or unbookmark) keeps only the latest (same idempotent-terminal rule);
 * - a repeated friend request to the same receiver keeps only the latest
 *   (only one request can exist — idempotent send, latest greeting wins);
 * - a repeated answer to the same friend request keeps only the latest (last answer wins);
 * - a repeated profile edit (same user id) keeps only the latest snapshot
 *   (each carries the full PATCH body — the newest edit subsumes the pending one);
 * - a repeated settings update (same user id) keeps only the latest snapshot
 *   (each carries the full preference block — an offline toggle burst collapses to one PATCH);
 *   notification and privacy settings coalesce independently (distinct kinds share the settings
 *   lane but never supersede one another);
 * - a repeated write of the same preference CATEGORY (target = the category's route name) keeps only the latest
 *   snapshot; two categories never supersede one another;
 * - an edit of a message still queued for sending is folded INTO that send (one request carrying the final text);
 *   a delete of it cancels the send and any edit, a delete after an edit replaces the edit;
 * - « supprimer pour moi » / « restaurer » du même message sont deux états terminaux opposés : ils s'annulent ; un
 *   masquage (ou une modération, ou un accusé de réception) répété ne garde que le dernier ;
 * - conversation details (title, description, avatar) and a generic settings action of the same (endpoint, method)
 *   merge field by field, the last write winning on each key; different endpoints never merge (FIFO);
 *
 * [pending] MUST contain only still-cancellable rows ([OutboxState.PENDING]);
 * an in-flight mutation cannot be undone.
 */
public object OutboxCoalescer {

    public fun decide(incoming: OutboxEntity, pending: List<OutboxEntity>): CoalesceDecision {
        val sameTarget = pending.filter { it.targetId == incoming.targetId }
        return when (incoming.kindEnum) {
            OutboxKind.DELETE_MESSAGE -> onDelete(incoming, sameTarget, pending)
            OutboxKind.EDIT_MESSAGE -> foldIntoQueuedSend(incoming, pending)
                ?: replaceSameKind(incoming, sameTarget, OutboxKind.EDIT_MESSAGE)
            OutboxKind.UPDATE_CONVERSATION -> mergeFieldByField(incoming, sameTarget, OutboxKind.UPDATE_CONVERSATION, BODY_ROOT)
            OutboxKind.SETTINGS_ACTION -> mergeFieldByField(incoming, sameTarget, OutboxKind.SETTINGS_ACTION, SETTINGS_BODY)
            OutboxKind.READ_RECEIPT -> terminalToggle(incoming, sameTarget, OutboxKind.MARK_UNREAD, OutboxKind.READ_RECEIPT)
            OutboxKind.MARK_UNREAD -> terminalToggle(incoming, sameTarget, OutboxKind.READ_RECEIPT, OutboxKind.MARK_UNREAD)
            OutboxKind.UPDATE_CONVERSATION_PREFS -> replaceSameKind(
                carryPrefsGrafts(incoming, sameTarget.filter { it.kindEnum == OutboxKind.UPDATE_CONVERSATION_PREFS }),
                sameTarget,
                OutboxKind.UPDATE_CONVERSATION_PREFS,
            )
            OutboxKind.UPDATE_PROFILE ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_PROFILE)
            OutboxKind.UPDATE_SETTINGS ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_SETTINGS)
            OutboxKind.UPDATE_PRIVACY_SETTINGS ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_PRIVACY_SETTINGS)
            OutboxKind.UPDATE_AUDIO_SETTINGS ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_AUDIO_SETTINGS)
            OutboxKind.UPDATE_APPLICATION_SETTINGS ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_APPLICATION_SETTINGS)
            OutboxKind.UPDATE_PREFERENCE_CATEGORY ->
                replaceSameKind(incoming, sameTarget, OutboxKind.UPDATE_PREFERENCE_CATEGORY)
            OutboxKind.REACT_STORY -> replaceSameStoryEmoji(incoming, sameTarget)
            OutboxKind.ADD_REACTION -> annihilateOpposite(incoming, sameTarget, OutboxKind.REMOVE_REACTION)
            OutboxKind.REMOVE_REACTION -> annihilateOpposite(incoming, sameTarget, OutboxKind.ADD_REACTION)
            OutboxKind.BLOCK_USER -> terminalToggle(incoming, sameTarget, OutboxKind.UNBLOCK_USER, OutboxKind.BLOCK_USER)
            OutboxKind.UNBLOCK_USER -> terminalToggle(incoming, sameTarget, OutboxKind.BLOCK_USER, OutboxKind.UNBLOCK_USER)
            OutboxKind.PIN_MESSAGE -> terminalToggle(incoming, sameTarget, OutboxKind.UNPIN_MESSAGE, OutboxKind.PIN_MESSAGE)
            OutboxKind.UNPIN_MESSAGE -> terminalToggle(incoming, sameTarget, OutboxKind.PIN_MESSAGE, OutboxKind.UNPIN_MESSAGE)
            OutboxKind.LIKE_POST -> terminalToggle(incoming, sameTarget, OutboxKind.UNLIKE_POST, OutboxKind.LIKE_POST)
            OutboxKind.UNLIKE_POST -> terminalToggle(incoming, sameTarget, OutboxKind.LIKE_POST, OutboxKind.UNLIKE_POST)
            OutboxKind.BOOKMARK_POST ->
                terminalToggle(incoming, sameTarget, OutboxKind.UNBOOKMARK_POST, OutboxKind.BOOKMARK_POST)
            OutboxKind.UNBOOKMARK_POST ->
                terminalToggle(incoming, sameTarget, OutboxKind.BOOKMARK_POST, OutboxKind.UNBOOKMARK_POST)
            OutboxKind.SEND_FRIEND_REQUEST ->
                replaceSameKind(incoming, sameTarget, OutboxKind.SEND_FRIEND_REQUEST)
            OutboxKind.RESPOND_FRIEND_REQUEST ->
                replaceSameKind(incoming, sameTarget, OutboxKind.RESPOND_FRIEND_REQUEST)
            OutboxKind.HIDE_FOR_ME -> terminalToggle(incoming, sameTarget, OutboxKind.RESTORE_FOR_ME, OutboxKind.HIDE_FOR_ME)
            OutboxKind.RESTORE_FOR_ME -> terminalToggle(incoming, sameTarget, OutboxKind.HIDE_FOR_ME, OutboxKind.RESTORE_FOR_ME)
            OutboxKind.MODERATION_DELETE -> replaceSameKind(incoming, sameTarget, OutboxKind.MODERATION_DELETE)
            OutboxKind.MARK_RECEIVED -> replaceSameKind(incoming, sameTarget, OutboxKind.MARK_RECEIVED)
            OutboxKind.MARK_STORY_VIEWED -> replaceSameKind(incoming, sameTarget, OutboxKind.MARK_STORY_VIEWED)
            OutboxKind.TOGGLE_LIKE_COMMENT -> toggleCommentLike(incoming, sameTarget)
            OutboxKind.DELETE_COMMENT -> deleteComment(incoming, sameTarget)
            else -> CoalesceDecision.Enqueue(incoming)
        }
    }

    private fun queuedSendsOf(messageId: String, pending: List<OutboxEntity>): List<OutboxEntity> =
        pending.filter { it.kindEnum == OutboxKind.SEND_MESSAGE && (it.cmid == messageId || it.targetId == messageId) }

    /**
     * L'édition d'un message encore en file n'est pas une seconde requête : son texte final prend la place du texte de
     * l'envoi (le clair d'un envoi chiffré n'existe pas en ligne, il n'est jamais touché). `null` quand aucun envoi ne
     * l'attend, ou que sa charge ne se lit pas.
     */
    private fun foldIntoQueuedSend(incoming: OutboxEntity, pending: List<OutboxEntity>): CoalesceDecision? {
        val send = queuedSendsOf(incoming.targetId, pending).firstOrNull() ?: return null
        val content = parseObject(incoming.payload)?.get("content") ?: return null
        val sendBody = parseObject(send.payload) ?: return null
        val folded = JsonObject(sendBody + ("content" to content))
        return CoalesceDecision.Replace(emptyList(), send.copy(payload = MeeshyApi.json.encodeToString(JsonObject.serializer(), folded)))
    }

    private fun parseObject(raw: String): JsonObject? =
        runCatching { MeeshyApi.json.parseToJsonElement(raw).jsonObject }.getOrNull()

    /**
     * Fusionne [incoming] avec les écritures [kind] en attente pour la même cible, champ par champ ([OutboxFieldMerge]) :
     * [select] dit où vit l'objet à fusionner dans la charge (la racine, ou le sous-objet `body`).
     */
    private fun mergeFieldByField(
        incoming: OutboxEntity,
        sameTarget: List<OutboxEntity>,
        kind: OutboxKind,
        select: BodySlot,
    ): CoalesceDecision {
        val older = sameTarget.filter { it.kindEnum == kind }
        if (older.isEmpty()) return CoalesceDecision.Enqueue(incoming)
        val newest = parseObject(incoming.payload) ?: return CoalesceDecision.Replace(older.map { it.cmid }, incoming)
        val priorBodies = older.mapNotNull { parseObject(it.payload) }.map(select::read)
        val merged = OutboxFieldMerge.merge(OutboxFieldMerge.mergeAll(priorBodies), select.read(newest))
        val payload = MeeshyApi.json.encodeToString(JsonObject.serializer(), select.write(newest, merged))
        return CoalesceDecision.Replace(older.map { it.cmid }, incoming.copy(payload = payload))
    }

    private interface BodySlot {
        fun read(payload: JsonObject): JsonObject
        fun write(payload: JsonObject, body: JsonObject): JsonObject
    }

    private val BODY_ROOT = object : BodySlot {
        override fun read(payload: JsonObject): JsonObject = payload
        override fun write(payload: JsonObject, body: JsonObject): JsonObject = body
    }

    private val SETTINGS_BODY = object : BodySlot {
        override fun read(payload: JsonObject): JsonObject = (payload["body"] as? JsonObject) ?: JsonObject(emptyMap())
        override fun write(payload: JsonObject, body: JsonObject): JsonObject =
            JsonObject(payload + ("body" to (body as JsonElement)))
    }

    private fun onDelete(incoming: OutboxEntity, sameTarget: List<OutboxEntity>, pending: List<OutboxEntity>): CoalesceDecision {
        val sends = queuedSendsOf(incoming.targetId, pending).map { it.cmid }
        if (sends.isNotEmpty()) {
            val edits = sameTarget.filter { it.kindEnum == OutboxKind.EDIT_MESSAGE }.map { it.cmid }
            return CoalesceDecision.Annihilate(sends + edits)
        }
        val supersededEdits = sameTarget.filter { it.kindEnum == OutboxKind.EDIT_MESSAGE }.map { it.cmid }
        return if (supersededEdits.isEmpty()) {
            CoalesceDecision.Enqueue(incoming)
        } else {
            CoalesceDecision.Replace(supersededEdits, incoming)
        }
    }

    private fun replaceSameKind(
        incoming: OutboxEntity,
        sameTarget: List<OutboxEntity>,
        kind: OutboxKind,
    ): CoalesceDecision {
        val superseded = sameTarget.filter { it.kindEnum == kind }.map { it.cmid }
        return if (superseded.isEmpty()) {
            CoalesceDecision.Enqueue(incoming)
        } else {
            CoalesceDecision.Replace(superseded, incoming)
        }
    }

    /**
     * A prefs snapshot carries `appearance` and `clearCategory` only when it made that change
     * ([ConversationPrefsPayload.appearance], [ConversationPrefsPayload.clearCategory]); a later snapshot that
     * supersedes a pending one must not drop it, so the newest pending appearance is grafted on, and a pending
     * category removal survives unless the later snapshot files the row in a category again.
     */
    private fun carryPrefsGrafts(incoming: OutboxEntity, superseded: List<OutboxEntity>): OutboxEntity {
        val next = decodePrefs(incoming.payload) ?: return incoming
        val pending = superseded.asReversed().mapNotNull { decodePrefs(it.payload) }
        val appearance = next.appearance ?: pending.firstNotNullOfOrNull { it.appearance }
        val clearCategory = next.clearCategory || (next.categoryId == null && pending.any { it.clearCategory })
        val previous = pending.lastOrNull { it.previous != null }?.previous ?: next.previous
        val grafted = next.copy(appearance = appearance, clearCategory = clearCategory, previous = previous)
        if (grafted == next) return incoming
        return incoming.copy(payload = MeeshyApi.json.encodeToString(ConversationPrefsPayload.serializer(), grafted))
    }

    private fun decodePrefs(payload: String): ConversationPrefsPayload? =
        runCatching { MeeshyApi.json.decodeFromString(ConversationPrefsPayload.serializer(), payload) }.getOrNull()

    /** La même réaction de story deux fois en file est UNE écriture : la dernière remplace la première. */
    private fun replaceSameStoryEmoji(incoming: OutboxEntity, sameTarget: List<OutboxEntity>): CoalesceDecision {
        val emoji = parseObject(incoming.payload)?.get("emoji") ?: return CoalesceDecision.Enqueue(incoming)
        val superseded = sameTarget
            .filter { it.kindEnum == OutboxKind.REACT_STORY && parseObject(it.payload)?.get("emoji") == emoji }
            .map { it.cmid }
        return if (superseded.isEmpty()) CoalesceDecision.Enqueue(incoming) else CoalesceDecision.Replace(superseded, incoming)
    }

    /**
     * Le coeur d'un commentaire est un ÉTAT voulu ([ToggleLikeCommentPayload.liked]) : le geste inverse en file l'annule
     * (le serveur n'a jamais rien su), le même geste répété ne garde que le dernier.
     */
    private fun toggleCommentLike(incoming: OutboxEntity, sameTarget: List<OutboxEntity>): CoalesceDecision {
        val wanted = parseObject(incoming.payload)?.get("liked") ?: return CoalesceDecision.Enqueue(incoming)
        val toggles = sameTarget.filter { it.kindEnum == OutboxKind.TOGGLE_LIKE_COMMENT }
        val opposite = toggles.filter { parseObject(it.payload)?.get("liked") != wanted }.map { it.cmid }
        if (opposite.isNotEmpty()) return CoalesceDecision.Annihilate(opposite)
        val same = toggles.map { it.cmid }
        return if (same.isEmpty()) CoalesceDecision.Enqueue(incoming) else CoalesceDecision.Replace(same, incoming)
    }

    /** Supprimer un commentaire rend ses coeurs en file sans objet : ils partent avec lui, un second ordre de suppression aussi. */
    private fun deleteComment(incoming: OutboxEntity, sameTarget: List<OutboxEntity>): CoalesceDecision {
        val superseded = sameTarget
            .filter { it.kindEnum == OutboxKind.TOGGLE_LIKE_COMMENT || it.kindEnum == OutboxKind.DELETE_COMMENT }
            .map { it.cmid }
        return if (superseded.isEmpty()) CoalesceDecision.Enqueue(incoming) else CoalesceDecision.Replace(superseded, incoming)
    }

    private fun annihilateOpposite(
        incoming: OutboxEntity,
        sameTarget: List<OutboxEntity>,
        opposite: OutboxKind,
    ): CoalesceDecision {
        val cancelled = sameTarget.filter { it.kindEnum == opposite }.map { it.cmid }
        return if (cancelled.isEmpty()) {
            CoalesceDecision.Enqueue(incoming)
        } else {
            CoalesceDecision.Annihilate(cancelled)
        }
    }

    /**
     * Coalesces a terminal-state toggle (block/unblock of a user, pin/unpin of a
     * message). The two kinds are opposite terminal states (not deltas), so a
     * queued opposite for the same target annihilates — the pair returns the
     * target to the last-synced server state, exactly like a reaction toggle.
     * Failing that, a pending same-kind row is superseded (a repeated
     * block/unblock or pin/unpin is idempotent). Otherwise it enqueues.
     */
    private fun terminalToggle(
        incoming: OutboxEntity,
        sameTarget: List<OutboxEntity>,
        opposite: OutboxKind,
        same: OutboxKind,
    ): CoalesceDecision {
        val cancelled = sameTarget.filter { it.kindEnum == opposite }.map { it.cmid }
        if (cancelled.isNotEmpty()) return CoalesceDecision.Annihilate(cancelled)
        val superseded = sameTarget.filter { it.kindEnum == same }.map { it.cmid }
        return if (superseded.isEmpty()) {
            CoalesceDecision.Enqueue(incoming)
        } else {
            CoalesceDecision.Replace(superseded, incoming)
        }
    }
}
