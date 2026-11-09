package me.meeshy.sdk.model.relation

/** La marge au-delà de la durée maximale : le dernier fragment et `talkie:ended` voyagent encore. */
public const val TALKIE_EXPIRY_GRACE_MS: Long = 3_000L

/** Assez pour qu'un événement en retard d'une prise de parole close ne la rouvre pas ; borné, rien ne grossit. */
public const val TALKIE_CLOSED_CAP: Int = 64

/** Une prise de parole qui sort CHEZ MOI : qui, depuis quand (horloge de l'appareil), jusqu'à quand au plus. */
public data class TalkieSpeaker(
    val talkieId: String,
    val fromUserId: String,
    val openedAtMs: Long,
    val maxDurationMs: Long,
    val name: String? = null,
) {
    val deadlineMs: Long get() = openedAtMs + maxDurationMs + TALKIE_EXPIRY_GRACE_MS
}

/** Ce que le son doit faire après un pas de [TalkieFloor]. */
public sealed interface TalkieSound {
    /** Un fragment, à jouer À LA SUITE du précédent de la même prise de parole. */
    public class Play(public val talkieId: String, public val data: ByteArray) : TalkieSound

    /** `cut`, ou « Couper » : se taire sur-le-champ. */
    public data class Silence(val talkieId: String) : TalkieSound

    /** `sender` / `limit` / échéance : rien de plus n'arrivera, ce qui est en file finit de sonner. */
    public data class Release(val talkieId: String) : TalkieSound
}

/** L'état des prises de parole reçues : celles qui sortent, le dernier `seq` joué de chacune, celles déjà closes. */
public data class TalkieFloorState(
    val active: List<TalkieSpeaker> = emptyList(),
    val lastSeq: Map<String, Int> = emptyMap(),
    val closed: List<String> = emptyList(),
)

/** Un pas : l'état d'après, et ce que le son doit faire (rien, le plus souvent). */
public data class TalkieStep(val state: TalkieFloorState, val sounds: List<TalkieSound> = emptyList())

/**
 * LE TALKIE SUR ANDROID, côté RÉCEPTION (#16675, iso `TalkieCenter.swift`) — la loi PURE des prises de parole reçues,
 * app ouverte. Le serveur a déjà jugé (niveau ≥ Proche, réception non coupée, hors E2EE, hors appel) : rien n'est rejugé.
 *
 * - `talkie:incoming` ouvre ; un encodage illisible, ma propre voix (un autre de mes appareils), une prise de parole déjà
 *   ouverte ou déjà close n'ouvrent rien.
 * - `talkie:chunk` se JOUE dans l'ordre des `seq` : un doublon, un fragment en retard, un fragment d'un émetteur autre
 *   que celui annoncé ou d'une prise de parole inconnue ne jouent rien.
 * - `talkie:ended` ferme : `sender` / `limit` laissent finir la file, `cut` fait taire.
 * - Sans `talkie:ended` (socket coupée), la prise de parole se ferme passé sa durée maximale, comptée à l'horloge de
 *   l'APPAREIL depuis la réception — jamais à `startedAt`, qu'une horloge décalée fausserait.
 */
public object TalkieFloor {

    public fun open(state: TalkieFloorState, incoming: TalkieIncoming, viewerId: String?, nowMs: Long): TalkieFloorState {
        val refused = !incoming.isPlayable ||
            incoming.fromUserId == viewerId ||
            incoming.talkieId in state.closed ||
            state.active.any { it.talkieId == incoming.talkieId }
        if (refused) return state
        val speaker = TalkieSpeaker(
            talkieId = incoming.talkieId,
            fromUserId = incoming.fromUserId,
            openedAtMs = nowMs,
            maxDurationMs = incoming.boundedDurationMs,
        )
        return state.copy(active = state.active + speaker, lastSeq = state.lastSeq + (incoming.talkieId to -1))
    }

    public fun receive(state: TalkieFloorState, chunk: TalkieChunk): TalkieStep {
        val speaker = state.active.firstOrNull { it.talkieId == chunk.talkieId }
        val last = state.lastSeq[chunk.talkieId]
        if (speaker == null || speaker.fromUserId != chunk.fromUserId || last == null || chunk.seq <= last) {
            return TalkieStep(state)
        }
        return TalkieStep(
            state.copy(lastSeq = state.lastSeq + (chunk.talkieId to chunk.seq)),
            listOf(TalkieSound.Play(chunk.talkieId, chunk.data)),
        )
    }

    public fun end(state: TalkieFloorState, ended: TalkieEnded): TalkieStep {
        val sound = if (ended.silencesNow) TalkieSound.Silence(ended.talkieId) else TalkieSound.Release(ended.talkieId)
        return TalkieStep(close(state, ended.talkieId), listOf(sound))
    }

    /** « Couper » : cette prise de parole se tait ICI, sur-le-champ. L'émetteur n'en est pas prévenu. */
    public fun mute(state: TalkieFloorState, talkieId: String): TalkieStep {
        if (state.active.none { it.talkieId == talkieId }) return TalkieStep(state)
        return TalkieStep(close(state, talkieId), listOf(TalkieSound.Silence(talkieId)))
    }

    /** Ce qui a passé sa durée maximale se ferme, sans événement du serveur. */
    public fun expireDue(state: TalkieFloorState, nowMs: Long): TalkieStep {
        val due = state.active.filter { it.deadlineMs <= nowMs }.map { it.talkieId }
        val after = due.fold(state) { acc, talkieId -> close(acc, talkieId) }
        return TalkieStep(after, due.map { TalkieSound.Release(it) })
    }

    /**
     * « Lire » sur la notification de réveil (#17144) : une prise de parole CLOSE redevient ouvrable, pour que le
     * rattrapage rejoué par la passerelle après un nouveau `talkie:join` sorte encore. Une prise de parole qui sort ne
     * change pas.
     */
    public fun forget(state: TalkieFloorState, talkieId: String): TalkieFloorState {
        if (talkieId !in state.closed) return state
        return state.copy(closed = state.closed - talkieId)
    }

    /** Le nom venu des caches, posé sur la prise de parole si elle sort encore. */
    public fun named(state: TalkieFloorState, talkieId: String, name: String?): TalkieFloorState {
        if (name.isNullOrBlank()) return state
        return state.copy(active = state.active.map { if (it.talkieId == talkieId) it.copy(name = name) else it })
    }

    private fun close(state: TalkieFloorState, talkieId: String): TalkieFloorState {
        val closed = if (talkieId in state.closed) state.closed else (state.closed + talkieId).takeLast(TALKIE_CLOSED_CAP)
        return TalkieFloorState(
            active = state.active.filterNot { it.talkieId == talkieId },
            lastSeq = state.lastSeq - talkieId,
            closed = closed,
        )
    }
}
