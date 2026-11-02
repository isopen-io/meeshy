package me.meeshy.sdk.outbox

import me.meeshy.core.database.entity.OutboxEntity
import me.meeshy.sdk.media.MediaLocationRefusal
import me.meeshy.sdk.media.MediaLoss
import me.meeshy.sdk.session.AccountFence
import me.meeshy.sdk.session.AccountTicket

/** Result of delivering one outbox mutation over the network. */
public sealed interface SendResult {

    /** Delivered and acknowledged (a 404 on a delete counts as success). */
    public data object Success : SendResult

    /**
     * Delivered, and the gateway returned a server id (an upload's real `mediaId`)
     * that must be grafted into every still-queued dependent before its gate opens.
     * Accounted as a delivery exactly like [Success].
     */
    public data class SuccessWithId(val producedId: String) : SendResult

    /** A retryable failure — network down, 5xx, timeout. */
    public data object TransientFailure : SendResult

    /**
     * A non-retryable failure — 4xx (other than 404), validation.
     *
     * @property unreadable the row's own payload cannot be decoded: it can never succeed, so the
     *   drainer deletes it once the outcome is published instead of keeping a dead row.
     */
    public data class PermanentFailure(val reason: String, val unreadable: Boolean = false) : SendResult

    /**
     * Not ready yet and not at fault — e.g. the origin of a transfer is not delivered. Costs no
     * attempt: the row waits (bounded by [OutboxDrainer.DEFERRED_MAX_WAIT_MS]) and is exhausted
     * cleanly beyond it.
     */
    public data class Deferred(val reason: String) : SendResult
}

/** Delivers a single [OutboxEntity] over the network; transient vs permanent is in the [SendResult]. */
public fun interface MutationSender {
    public suspend fun send(row: OutboxEntity): SendResult
}

/**
 * Summary of one [OutboxDrainer.drainLane] pass.
 *
 * @property heldBack an independent lane ([OutboxLanes.isIndependent]) drained PAST rows that must come back later — an
 *   upload waiting for its conversation's mode, or not yet due again (#13820): the lane did not stop, but a retry is owed.
 */
public data class DrainReport(
    val delivered: Int,
    val exhausted: Int,
    val stoppedOnTransientFailure: Boolean,
    val stoppedOnBlockedDependency: Boolean = false,
    val heldBack: Boolean = false,
)

/**
 * Drains one outbox lane in strict FIFO (ARCHITECTURE.md §5; ADR-006).
 *
 * A transient failure stops the lane immediately so message ordering holds —
 * a later message is never delivered ahead of an earlier, still-failing one.
 * A permanent failure (or a kind with no registered sender) exhausts that row
 * and the drain continues; an unreadable payload is deleted after its outcome is published.
 *
 * A row with a `dependsOn` prerequisite is gated on that prerequisite
 * ([OutboxDependencies]): a still-queued prerequisite **stops** the lane (the
 * dependent stays `PENDING` for the next pass), while an `EXHAUSTED` prerequisite
 * cascade-exhausts the dependent — it can never run. This is the durable
 * upload→publish chain primitive: a media publish waits for its upload to land
 * and is abandoned with it if the upload gives up.
 *
 * When a prerequisite delivers a [SendResult.SuccessWithId], its real id is
 * grafted into every still-queued dependent's payload via [graftProducedId]
 * (placeholder = the prerequisite's own `cmid`) **before** the row is deleted, so
 * a publish queued offline with a placeholder media id delivers with the real one.
 * The graft receives the dependent ROW, so the write-back of the dependent's own kind
 * rewrites it — a post payload is never re-encoded as a story (#13417).
 *
 * [currentOwner], when set, enforces [OutboxAuthorGuard]: a row never leaves under another
 * account than its author — it is skipped (no attempt charged) until its author is signed in.
 * A [SendResult.Deferred] row costs no attempt either: it is rescheduled and holds its lane.
 *
 * A row whose conversation's mode cannot be read ([OutboxAdmissionVerdict.WAIT], #13820) is rescheduled without an
 * attempt and exhausted once it has waited [DEFERRED_MAX_WAIT_MS] — its bubble and its bytes are kept for « Réessayer »,
 * and its dependents inherit [OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED]; once admitted, its wait starts over.
 * A message lane stops on it (FIFO). An INDEPENDENT lane ([OutboxLanes.isIndependent] — the media lane) holds no order
 * between its rows: the waiting upload waits ALONE, a row not yet due is passed over, and the lane drains on and reports
 * [DrainReport.heldBack] so a retry comes back for them.
 */
public class OutboxDrainer(
    private val outbox: OutboxRepository,
    private val senders: Map<OutboxKind, MutationSender>,
    private val onExhausted: suspend (OutboxEntity) -> Unit = {},
    private val graftProducedId: (dependent: OutboxEntity, placeholder: String, realId: String) -> String? =
        { _, _, _ -> null },
    private val currentOwner: (() -> String?)? = null,
    private val now: () -> Long = System::currentTimeMillis,
    /** #12956 — never lets a plaintext row leave for a conversation this device knows end-to-end. */
    private val plaintextAdmission: OutboxPlaintextAdmission = OutboxPlaintextAdmission.AdmitAll,
    /**
     * #13555 — when set, the account a row is judged and SENT under is the fence's: the send runs inside
     * [AccountFence.guard], so closing the account cancels it before the next account can sign in, and its outcome is
     * never written once that account has closed.
     */
    private val fence: AccountFence? = null,
) {
    public suspend fun drainLane(lane: String): DrainReport {
        var delivered = 0
        var exhausted = 0
        var heldBack = false
        val independent = OutboxLanes.isIndependent(lane)
        val pending = outbox.deliverable(lane).filter { it.stateEnum == OutboxState.PENDING }

        for (row in pending) {
            val kind = row.kindEnum ?: continue
            val ticket = fence?.ticket()
            if (ticket != null || currentOwner != null) {
                when (OutboxAuthorGuard.verdict(row.ownerId, ticket?.ownerId ?: currentOwner?.invoke())) {
                    AuthorVerdict.SEND -> Unit
                    AuthorVerdict.WAIT -> continue
                    AuthorVerdict.EXHAUST_NO_AUTHOR -> {
                        outbox.markExhausted(row.cmid, OutboxAuthorGuard.REASON_NO_AUTHOR)
                        onExhausted(settled(row, OutboxAuthorGuard.REASON_NO_AUTHOR))
                        exhausted++
                        continue
                    }
                }
            }
            if ((row.nextAttemptAt ?: 0L) > now()) {
                if (!independent) return blocked(delivered, exhausted)
                heldBack = true
                continue
            }
            val prerequisites = OutboxDependencyKey.decode(row.dependsOn)
            if (prerequisites.isNotEmpty()) {
                val states = prerequisites.map { outbox.stateOf(it) }
                when (OutboxDependencies.verdictAll(states)) {
                    DependencyVerdict.BLOCKED -> return blocked(delivered, exhausted)
                    DependencyVerdict.FAILED -> {
                        val failed = prerequisites.filterIndexed { i, _ ->
                            states[i] == OutboxState.EXHAUSTED
                        }
                        val reason = cascadeReason(failed)
                        outbox.markExhausted(row.cmid, reason)
                        onExhausted(settled(row, reason))
                        exhausted++
                        continue
                    }
                    DependencyVerdict.SATISFIED -> Unit
                }
            }
            val sender = senders[kind]
            if (sender == null) {
                val reason = "No sender registered for ${row.kind}"
                outbox.markExhausted(row.cmid, reason)
                onExhausted(settled(row, reason))
                exhausted++
                continue
            }
            when (plaintextAdmission.judge(row)) {
                OutboxAdmissionVerdict.ADMIT ->
                    if (row.waitingSince != null && OutboxPlaintextAdmission.isModeUnconfirmed(row.lastError)) {
                        outbox.endWait(row.cmid, OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
                    }
                OutboxAdmissionVerdict.WITHHOLD -> {
                    outbox.markExhausted(row.cmid, OutboxPlaintextAdmission.REASON_END_TO_END)
                    onExhausted(settled(row, OutboxPlaintextAdmission.REASON_END_TO_END))
                    exhausted++
                    continue
                }
                // #13628 — mode inconnu et illisible : la ligne reste PENDING (aucun essai compté) et reprend au retour du réseau.
                // #13820 — l'attente est BORNÉE (DEFERRED_MAX_WAIT_MS) puis la ligne échoue, sa bulle et ses octets gardés pour
                // « Réessayer » ; une lane de messages s'arrête (FIFO), la lane indépendante (média) passe aux lignes suivantes.
                OutboxAdmissionVerdict.WAIT -> {
                    // La lane de messages reste due (le retour du réseau la relance aussitôt) ; seule la pièce attend son tour.
                    val retryAfter = if (independent) DEFERRED_RETRY_MS else 0L
                    val waits = outbox.defer(row.cmid, OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED, retryAfter, DEFERRED_MAX_WAIT_MS)
                    if (!independent) outbox.waitBehind(lane, row.cmid, OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED)
                    if (!waits) {
                        onExhausted(settled(row, null))
                        exhausted++
                        continue
                    }
                    if (!independent) return DrainReport(delivered, exhausted, stoppedOnTransientFailure = true)
                    heldBack = true
                    continue
                }
                // #13628 — la passerelle refuse de servir la conversation (403, 410, son 404 CONVERSATION_NOT_FOUND) : la ligne ne bloque pas sa file à jamais.
                OutboxAdmissionVerdict.UNREACHABLE -> {
                    outbox.markExhausted(row.cmid, OutboxPlaintextAdmission.REASON_CONVERSATION_UNREACHABLE)
                    onExhausted(settled(row, OutboxPlaintextAdmission.REASON_CONVERSATION_UNREACHABLE))
                    exhausted++
                    continue
                }
            }
            when (val result = sendUnder(ticket, sender, row) ?: return blocked(delivered, exhausted)) {
                SendResult.Success -> {
                    outbox.markSucceeded(row.cmid)
                    delivered++
                }
                is SendResult.SuccessWithId -> {
                    outbox.rewriteDependentRows(row.cmid) { dependent ->
                        graftProducedId(dependent, row.cmid, result.producedId)
                    }
                    outbox.markSucceeded(row.cmid)
                    delivered++
                }
                SendResult.TransientFailure -> {
                    if (outbox.markFailed(row.cmid, "Transient delivery failure") == OutboxState.EXHAUSTED) {
                        onExhausted(settled(row, "Transient delivery failure"))
                        exhausted++
                    }
                    return DrainReport(delivered, exhausted, stoppedOnTransientFailure = true)
                }
                is SendResult.Deferred -> {
                    if (outbox.defer(row.cmid, result.reason, DEFERRED_RETRY_MS, DEFERRED_MAX_WAIT_MS)) {
                        return blocked(delivered, exhausted)
                    }
                    onExhausted(settled(row, null))
                    exhausted++
                }
                is SendResult.PermanentFailure -> {
                    if (result.unreadable) {
                        outbox.discardUnreadable(row.cmid, result.reason)
                    } else {
                        outbox.markExhausted(row.cmid, result.reason)
                    }
                    onExhausted(settled(row, result.reason))
                    exhausted++
                }
            }
        }
        return DrainReport(delivered, exhausted, stoppedOnTransientFailure = false, heldBack = heldBack)
    }

    /**
     * #13820 — la ligne telle que son échec l'a laissée, relue après [OutboxRepository.markExhausted] : `onExhausted` décide sur
     * sa raison d'ÉCHEC (garder ou jeter des octets), jamais sur celle d'une attente antérieure. Une ligne déjà retirée garde
     * [reason] si elle est connue.
     */
    private suspend fun settled(row: OutboxEntity, reason: String?): OutboxEntity =
        outbox.row(row.cmid) ?: row.copy(lastError = reason ?: row.lastError)

    /**
     * Ce que dit un dépendant dont un prérequis a échoué : un média refusé pour son lieu (#13550) se transmet tel quel — la
     * bulle, la publication non envoyée le disent, et ne proposent pas un nouvel essai voué au même refus ; un média perdu sur
     * l'appareil ([MediaLoss], #13554) de même ; sinon, la liste.
     */
    private suspend fun cascadeReason(failed: List<String>): String {
        val reasons = failed.map { outbox.row(it)?.lastError }
        return when {
            reasons.any(MediaLocationRefusal::isReason) -> MediaLocationRefusal.REASON
            reasons.any(MediaLoss::isReason) -> MediaLoss.REASON
            reasons.any(OutboxPlaintextAdmission::isModeUnconfirmed) -> OutboxPlaintextAdmission.REASON_MODE_UNCONFIRMED
            else -> "Prerequisite(s) failed: ${failed.joinToString()}"
        }
    }

    /** The send, under [ticket]'s account when fenced; `null` once that account closed (the send was cancelled, or its outcome is moot). */
    private suspend fun sendUnder(ticket: AccountTicket?, sender: MutationSender, row: OutboxEntity): SendResult? {
        val send: suspend () -> SendResult = {
            outbox.markInflight(row.cmid)
            sender.send(row)
        }
        val fence = fence
        if (fence == null || ticket == null) return send()
        return fence.guard(ticket, send)?.takeIf { fence.isCurrent(ticket) }
    }

    private fun blocked(delivered: Int, exhausted: Int) = DrainReport(
        delivered,
        exhausted,
        stoppedOnTransientFailure = false,
        stoppedOnBlockedDependency = true,
    )

    public companion object {
        /** How long a deferred row waits before the drainer looks at it again. */
        public const val DEFERRED_RETRY_MS: Long = 15_000L

        /** Beyond this, a row that is still deferred gives up (an origin that never arrives). */
        public const val DEFERRED_MAX_WAIT_MS: Long = 60 * 60 * 1000L
    }
}
