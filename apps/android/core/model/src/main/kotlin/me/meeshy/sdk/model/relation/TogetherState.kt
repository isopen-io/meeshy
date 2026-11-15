package me.meeshy.sdk.model.relation

/** La séance ouverte, vue par CE compte : l'autre est l'invité quand je suis l'hôte, l'hôte sinon. */
public data class TogetherSession(
    val started: TogetherStarted,
    val partnerId: String,
    val playback: TogetherPlayback,
) {
    val sessionId: String get() = started.sessionId
}

/** Une invitation reçue, et l'instant (horloge de l'APPAREIL, ms) où elle l'a été. */
public data class TogetherInvitation(val invited: TogetherInvited, val receivedAtMs: Long) {
    val sessionId: String get() = invited.sessionId

    /** Elle s'éteint [TogetherContract.INVITE_TTL_MS] après sa réception, jamais à `expiresAt`. */
    val deadlineMs: Long get() = receivedAtMs + TogetherContract.INVITE_TTL_MS
}

/** Une invitation envoyée, qui attend que l'autre rejoigne. */
public data class TogetherOutgoing(val sessionId: String, val toUserId: String, val media: TogetherMediaKind)

/**
 * L'ÉTAT D'« ENSEMBLE » SUR CET APPAREIL (#17100) — portage de `TogetherState.swift` (iOS) et de `createTogetherStore`
 * (web), en valeur : chaque événement rend l'état suivant.
 *
 * - `invited` propose ; `started` ouvre la séance chez l'hôte et l'invité, et retire l'invitation ou l'attente qui la
 *   portait ; `synced` fait suivre la lecture (un `rev` déjà appliqué ne rejoue rien) ; `ended` ferme.
 * - Une séance close ne se rouvre pas sur un événement en retard : sa trace est gardée, bornée.
 * - Chaque `at` reçu mesure l'écart entre l'horloge du serveur et celle de l'appareil.
 */
public data class TogetherState(
    val invitation: TogetherInvitation? = null,
    val outgoing: TogetherOutgoing? = null,
    val session: TogetherSession? = null,
    /** Horloge du serveur − horloge de l'appareil (ms), ou `null` avant tout échantillon. */
    val clockOffsetMs: Double? = null,
    private val closed: List<String> = emptyList(),
) {
    public fun invited(data: TogetherInvited, viewerId: String?, nowMs: Long): TogetherState {
        if (data.fromUserId == viewerId || data.sessionId in closed) return this
        return copy(invitation = TogetherInvitation(data, nowMs))
    }

    public fun waiting(outgoing: TogetherOutgoing): TogetherState =
        if (outgoing.sessionId in closed) this else copy(outgoing = outgoing)

    public fun started(data: TogetherStarted, viewerId: String?, nowMs: Long): TogetherState {
        if (data.sessionId in closed || viewerId == null) return this
        val partnerId = data.partner(viewerId) ?: return this
        return copy(
            session = TogetherSession(data, partnerId, data.playback),
            invitation = invitation?.takeUnless { it.sessionId == data.sessionId },
            outgoing = outgoing?.takeUnless { it.sessionId == data.sessionId },
            clockOffsetMs = measured(data.playback.at, nowMs),
        )
    }

    public fun synced(data: TogetherSynced, nowMs: Long): TogetherState {
        val current = session ?: return this
        if (current.sessionId != data.sessionId || data.playback.rev <= current.playback.rev) return this
        return copy(session = current.copy(playback = data.playback), clockOffsetMs = measured(data.playback.at, nowMs))
    }

    /** Ferme la séance, l'invitation ou l'attente [sessionId] ICI ; elle ne se rouvrira pas. */
    public fun ended(sessionId: String): TogetherState = copy(
        closed = (closed.filter { it != sessionId } + sessionId).takeLast(CLOSED_MEMORY),
        session = session?.takeUnless { it.sessionId == sessionId },
        invitation = invitation?.takeUnless { it.sessionId == sessionId },
        outgoing = outgoing?.takeUnless { it.sessionId == sessionId },
    )

    /** L'invitation sans réponse passé son terme s'éteint. */
    public fun expiringInvitation(nowMs: Long): TogetherState {
        val pending = invitation ?: return this
        return if (nowMs > pending.deadlineMs) ended(pending.sessionId) else this
    }

    private fun measured(serverAt: Double, nowMs: Long): Double =
        TogetherSync.estimateClockOffset(current = clockOffsetMs, serverAt = serverAt, localAt = nowMs.toDouble())

    public companion object {
        public const val CLOSED_MEMORY: Int = 32
    }
}
