package me.meeshy.app.talkie

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import me.meeshy.sdk.model.relation.TalkieEvent
import me.meeshy.sdk.model.relation.TalkieFloor
import me.meeshy.sdk.model.relation.TalkieFloorState
import me.meeshy.sdk.model.relation.TalkieSound
import me.meeshy.sdk.model.relation.TalkieStep
import me.meeshy.sdk.relation.CirclesGateway
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.socket.RelationSocketEventsManager

/** Ce qui fait (et cesse de faire) sortir la voix d'un talkie. Le vrai son est [TalkieVoicePlayer] ; un double le remplace dans les tests. */
interface TalkieSink {
    /** Un fragment, à jouer À LA SUITE du précédent de la même prise de parole. */
    fun play(talkieId: String, data: ByteArray)

    /** `cut`, ou « Couper » : se taire sur-le-champ. */
    fun silence(talkieId: String)

    /** `sender` / `limit` / échéance : rien de plus n'arrivera, ce qui est en file finit de sonner. */
    fun release(talkieId: String)
}

/**
 * LE TALKIE SUR ANDROID, côté RÉCEPTION (#16675, iso `TalkieCenter.swift`) — les prises de parole reçues, app ouverte,
 * pour toute la durée de l'app. La loi est [TalkieFloor] (pure) ; ce centre la nourrit du flux ordonné de la socket, nomme
 * l'émetteur par les caches des cercles (aucun nom ne voyage) et ferme à l'échéance une prise de parole dont la fin n'est
 * jamais arrivée. Le serveur a déjà jugé (niveau ≥ Proche, réception non coupée, hors E2EE, hors appel) : rien n'est
 * rejugé ici.
 */
@Singleton
class TalkieCenter internal constructor(
    private val sink: TalkieSink,
    private val nameOf: suspend (String) -> String?,
    private val viewerId: () -> String?,
    events: Flow<TalkieEvent>,
    private val scope: CoroutineScope,
    private val now: () -> Long,
) {
    @Inject
    constructor(
        player: TalkieVoicePlayer,
        circles: CirclesGateway,
        session: SessionRepository,
        sockets: RelationSocketEventsManager,
    ) : this(
        sink = player,
        nameOf = { userId -> circles.people(listOf(userId))[userId]?.name },
        viewerId = { session.currentUserId },
        events = sockets.talkie,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        now = System::currentTimeMillis,
    )

    private val _floor = MutableStateFlow(TalkieFloorState())

    /** Les prises de parole qui sortent CHEZ MOI ; l'indicateur montre la première. */
    val floor: StateFlow<TalkieFloorState> = _floor.asStateFlow()

    init {
        scope.launch { events.collect(::handle) }
    }

    /** « Couper » : cette prise de parole se tait ICI, sur-le-champ. L'émetteur n'en est pas prévenu. */
    fun mute(talkieId: String) {
        apply(TalkieFloor.mute(_floor.value, talkieId))
    }

    /**
     * « Lire » sur la notification de réveil (#17144) : une prise de parole close redevient ouvrable, pour que le
     * rattrapage rejoué après un nouveau `talkie:join` sorte encore.
     */
    fun forget(talkieId: String) {
        _floor.value = TalkieFloor.forget(_floor.value, talkieId)
    }

    private fun handle(event: TalkieEvent) {
        when (event) {
            is TalkieEvent.Opened -> open(event)
            is TalkieEvent.Spoken -> apply(TalkieFloor.receive(_floor.value, event.chunk))
            is TalkieEvent.Closed -> apply(TalkieFloor.end(_floor.value, event.ended))
        }
    }

    private fun open(event: TalkieEvent.Opened) {
        val before = _floor.value
        val after = TalkieFloor.open(before, event.incoming, viewerId(), now())
        if (after == before) return
        _floor.value = after
        val speaker = after.active.last()
        scope.launch {
            delay((speaker.deadlineMs - now()).coerceAtLeast(0L))
            apply(TalkieFloor.expireDue(_floor.value, now()))
        }
        scope.launch {
            _floor.value = TalkieFloor.named(_floor.value, speaker.talkieId, nameOf(speaker.fromUserId))
        }
    }

    private fun apply(step: TalkieStep) {
        _floor.value = step.state
        step.sounds.forEach { sound ->
            when (sound) {
                is TalkieSound.Play -> sink.play(sound.talkieId, sound.data)
                is TalkieSound.Silence -> sink.silence(sound.talkieId)
                is TalkieSound.Release -> sink.release(sound.talkieId)
            }
        }
    }
}
