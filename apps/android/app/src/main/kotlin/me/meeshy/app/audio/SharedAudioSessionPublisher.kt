package me.meeshy.app.audio

import android.os.SystemClock
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import java.time.ZoneId
import java.util.Locale
import javax.inject.Inject
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.launch
import me.meeshy.app.startup.AppInitializer
import me.meeshy.sdk.call.CallActivityGate
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.model.playback.SharedVoiceCard
import me.meeshy.sdk.model.playback.SharedVoiceCardProjection
import me.meeshy.sdk.model.playback.VoicePlaybackCardRules
import me.meeshy.sdk.model.playback.VoicePlaybackCommand
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import timber.log.Timber

/**
 * **Le moteur partagé parle au système** (iOS `ConversationAudioCoordinator+NowPlaying`) : la file des vocaux
 * d'une conversation, jouée par [ConversationAudioCoordinator], devient la carte de lecture du système
 * (notification, écran verrouillé, casque) via [VoicePlaybackSessionBridge], et les ordres de cette carte
 * reviennent au coordinateur. Il ne dépend d'aucun écran : quitter la conversation ou l'app laisse jouer.
 *
 * La décision (quoi montrer, quand republier, quand se taire pendant un appel) est dans
 * [SharedVoiceCardProjection] ; ceci n'est que le câblage.
 */
internal class SharedAudioSessionPublisher(
    private val coordinator: ConversationAudioCoordinator,
    private val callGate: CallActivityGate,
    private val bridge: VoicePlaybackSessionBridge,
    private val scope: CoroutineScope,
    private val clock: () -> Long = SystemClock::elapsedRealtime,
    private val locale: () -> Locale = Locale::getDefault,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val formatSentAt: (epochMs: Long, locale: Locale, zone: ZoneId) -> String = { epochMs, locale, zone ->
        VoicePlaybackCardRules.sentAtLabel(epochMs, locale, zone)
    },
) {
    private class Published(val card: SharedVoiceCard, val atMs: Long)

    private data class SentAtKey(val epochMs: Long, val locale: Locale, val zone: ZoneId)

    private var published: Published? = null
    private var sentAt: Pair<SentAtKey, String>? = null

    fun start() {
        scope.launch {
            combine(coordinator.snapshot, coordinator.playback, callGate.isActiveFlow) { snapshot, playback, callActive ->
                val context = snapshot.context
                SharedVoiceCardProjection.of(
                    audio = context?.audio,
                    conversationName = context?.conversationName.orEmpty(),
                    conversationArtworkUrl = context?.conversationArtworkUrl,
                    playback = playback,
                    hasNext = snapshot.queue.hasNext,
                    hasPrevious = snapshot.queue.hasPrevious,
                    callActive = callActive,
                    locale = locale(),
                    zone = zone(),
                    sentAtLabel = ::sentAtLabel,
                )
            }.collect { card -> guarded("publication") { apply(card) } }
        }
        scope.launch {
            bridge.sharedCommands.collect { command -> guarded("ordre ${command::class.simpleName}") { route(command) } }
        }
    }

    /** La date d'un vocal ne se formate qu'une fois : la projection, elle, tourne à chaque tic du moteur. */
    private fun sentAtLabel(epochMs: Long): String {
        val key = SentAtKey(epochMs, locale(), zone())
        sentAt?.takeIf { it.first == key }?.let { return it.second }
        return formatSentAt(epochMs, key.locale, key.zone).also { sentAt = key to it }
    }

    private fun apply(card: SharedVoiceCard?) {
        if (card == null) {
            if (published != null) bridge.retireShared()
            published = null
            return
        }
        val now = clock()
        val last = published
        if (last != null && !SharedVoiceCardProjection.needsRepublish(last.card, last.atMs, card, now)) return
        published = Published(card, now)
        bridge.publishShared(card.card, card.transport, card.controls)
    }

    /** Les ordres du système sont des commandes d'écran verrouillé : la garde d'appel du moteur les juge comme toute autre. */
    private fun route(command: VoicePlaybackCommand) {
        val origin = PlaybackCommandOrigin.LockScreen
        val playing = coordinator.playback.value.isPlaying
        when (command) {
            VoicePlaybackCommand.Play -> if (!playing) coordinator.togglePlayPause(origin)
            VoicePlaybackCommand.Pause -> if (playing) coordinator.togglePlayPause(origin)
            VoicePlaybackCommand.Stop -> coordinator.stop()
            is VoicePlaybackCommand.SeekTo -> coordinator.seekToMs(command.positionMs)
            is VoicePlaybackCommand.Skip -> coordinator.skip(command.offsetMs / MS_PER_SECOND)
            VoicePlaybackCommand.Next -> coordinator.next(origin)
            VoicePlaybackCommand.Previous -> coordinator.previous(origin)
        }
    }

    private inline fun guarded(what: String, block: () -> Unit) {
        try {
            block()
        } catch (cancellation: CancellationException) {
            throw cancellation
        } catch (failure: Exception) {
            Timber.e(failure, "Carte du moteur partagé : %s mal traité", what)
        }
    }

    private companion object {
        const val MS_PER_SECOND = 1_000.0
    }
}

/** Lance le publieur au démarrage de l'app : le moteur partagé a sa carte dès son premier vocal. */
internal class SharedAudioSessionInitializer @Inject constructor(
    private val coordinator: ConversationAudioCoordinator,
    private val callGate: CallActivityGate,
    private val bridge: VoicePlaybackSessionBridge,
) : AppInitializer {
    override fun initialize() {
        SharedAudioSessionPublisher(
            coordinator = coordinator,
            callGate = callGate,
            bridge = bridge,
            scope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate),
        ).start()
    }
}

@Module
@InstallIn(SingletonComponent::class)
internal interface SharedAudioSessionModule {
    @Binds
    @IntoSet
    fun sharedAudioSessionInitializer(initializer: SharedAudioSessionInitializer): AppInitializer
}
