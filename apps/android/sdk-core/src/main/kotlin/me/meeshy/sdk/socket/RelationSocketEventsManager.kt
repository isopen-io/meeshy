package me.meeshy.sdk.socket

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.util.concurrent.atomic.AtomicBoolean
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.relation.BringStoppedEvent
import me.meeshy.sdk.model.relation.RelationLevelRaisedEvent
import me.meeshy.sdk.model.relation.RelationRitualCompletedEvent
import me.meeshy.sdk.model.relation.RelationRitualProgressEvent
import me.meeshy.sdk.model.relation.RelationRitualStartedEvent
import me.meeshy.sdk.model.relation.TalkieChunk
import me.meeshy.sdk.model.relation.TalkieEnded
import me.meeshy.sdk.model.relation.TalkieEvent
import me.meeshy.sdk.model.relation.TalkieIncoming
import me.meeshy.sdk.model.socket.SocketEventNames
import org.json.JSONObject

/**
 * Les quatre événements du LIEN entre deux personnes (#13933, #13938), l'arrêt d'un Bring (#13936) et le talkie reçu
 * (#16675) — miroir de `MessageSocketManager+Relations.swift` et `MessageSocketManager+Talkie.swift`.
 *
 * Tous serveur → client, tous sur la room `user:<id>` (`packages/shared/types/socketio-events/relation-event-names.ts`).
 * Chaque charge nomme `userId` = l'AUTRE personne, du point de vue du destinataire. Il n'existe AUCUN événement de baisse,
 * de sortie ni de refus : ce sont des gestes silencieux (RG-07), et le client n'en écoute donc aucun.
 *
 * Patron de [ConversationSocketEventsManager] : ses propres routes, installées sur le MÊME [SocketEventRouter] (même voie
 * série, ordre d'arrivée), attachées par `RealtimeSessionCoordinator` au titre de [RealtimeBinding].
 */
@Singleton
class RelationSocketEventsManager @Inject constructor(
    private val router: SocketEventRouter,
    private val json: Json,
) : RealtimeBinding {

    private val installed = AtomicBoolean(false)

    private val _levelRaised = SocketInboundRoute.subject<RelationLevelRaisedEvent>()
    private val _ritualStarted = SocketInboundRoute.subject<RelationRitualStartedEvent>()
    private val _ritualProgress = SocketInboundRoute.subject<RelationRitualProgressEvent>()
    private val _ritualCompleted = SocketInboundRoute.subject<RelationRitualCompletedEvent>()
    private val _bringStopped = SocketInboundRoute.subject<BringStoppedEvent>()
    private val _talkie = SocketInboundRoute.subject<TalkieEvent>()

    /** `relation:level-raised` — le niveau effectif de la paire a monté (aux DEUX). */
    val levelRaised: SharedFlow<RelationLevelRaisedEvent> = _levelRaised.exposed()

    /** `relation:ritual-started` — l'autre a ouvert (ou rejoint) le rituel du Sang. */
    val ritualStarted: SharedFlow<RelationRitualStartedEvent> = _ritualStarted.exposed()

    /** `relation:ritual-progress` — l'autre a tenu l'écran, confirmé, ou lâché. */
    val ritualProgress: SharedFlow<RelationRitualProgressEvent> = _ritualProgress.exposed()

    /** `relation:ritual-completed` — les deux ont confirmé : le lien vaut Sang. */
    val ritualCompleted: SharedFlow<RelationRitualCompletedEvent> = _ritualCompleted.exposed()

    /**
     * `bring:stopped` — un Bring a cessé (aux DEUX, #13936). L'expéditeur y lit la fin de « Ça sonne chez X » ; le
     * destinataire Android s'arrête par le push `bring_stopped`, qui atteint aussi une app tuée.
     */
    val bringStopped: SharedFlow<BringStoppedEvent> = _bringStopped.exposed()

    /**
     * Le talkie reçu (#16675), sur UN flux dans l'ordre du fil : `talkie:incoming` (une prise de parole commence, aucun
     * nom ne voyage), `talkie:chunk` (un fragment, à jouer dès son arrivée — le son voyage en binaire Socket.IO natif, que
     * la bibliothèque replace en `ByteArray` dans la charge) et `talkie:ended` (`sender` / `limit` laissent finir, `cut`
     * fait taire).
     */
    val talkie: SharedFlow<TalkieEvent> = _talkie.exposed()

    override fun attach() {
        if (installed.compareAndSet(false, true)) router.install(routes())
    }

    override fun detach() {
        installed.set(false)
    }

    internal fun routes(): List<SocketInboundRoute> = listOf(
        SocketInboundRoute.decoding(SocketEventNames.RELATION_LEVEL_RAISED, json, _levelRaised),
        SocketInboundRoute.decoding(SocketEventNames.RELATION_RITUAL_STARTED, json, _ritualStarted),
        SocketInboundRoute.decoding(SocketEventNames.RELATION_RITUAL_PROGRESS, json, _ritualProgress),
        SocketInboundRoute.decoding(SocketEventNames.RELATION_RITUAL_COMPLETED, json, _ritualCompleted),
        SocketInboundRoute.decoding(SocketEventNames.BRING_STOPPED, json, _bringStopped),
        SocketInboundRoute.decoding(SocketEventNames.TALKIE_INCOMING, json, TalkieIncoming.serializer()) {
            publishTalkie(SocketEventNames.TALKIE_INCOMING, TalkieEvent.Opened(it))
        },
        SocketInboundRoute.raw(SocketEventNames.TALKIE_CHUNK) { raw ->
            raw.talkieChunk()?.let { publishTalkie(SocketEventNames.TALKIE_CHUNK, TalkieEvent.Spoken(it)) }
        },
        SocketInboundRoute.decoding(SocketEventNames.TALKIE_ENDED, json, TalkieEnded.serializer()) {
            publishTalkie(SocketEventNames.TALKIE_ENDED, TalkieEvent.Closed(it))
        },
    )

    private fun publishTalkie(event: String, value: TalkieEvent) {
        SocketInboundRoute.run { _talkie.emitOrLog(event, value) }
    }

    private fun JSONObject.talkieChunk(): TalkieChunk? = TalkieChunk.of(
        talkieId = optString("talkieId").takeIf { it.isNotEmpty() },
        fromUserId = optString("fromUserId").takeIf { it.isNotEmpty() },
        seq = (opt("seq") as? Number)?.toInt(),
        data = opt("data") as? ByteArray,
    )
}

@Module
@InstallIn(SingletonComponent::class)
internal interface RelationSocketEventsModule {
    @Binds
    @IntoSet
    fun bindRealtime(manager: RelationSocketEventsManager): RealtimeBinding
}
