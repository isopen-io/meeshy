package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.toArgb
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.core.common.IoDispatcher
import me.meeshy.sdk.media.UploadedAttachmentIds
import me.meeshy.sdk.model.media.MediaPlayerContext
import me.meeshy.sdk.model.media.formatMediaDuration
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.BubbleVoiceLive
import me.meeshy.sdk.model.playback.BubbleVoiceProjection
import me.meeshy.sdk.model.playback.VoiceTap
import me.meeshy.sdk.model.waveform.WaveformBarsLayout
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.sdk.waveform.WaveformRepository
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleAudioPlayback
import me.meeshy.ui.component.bubble.BubbleCallbacks
import me.meeshy.ui.component.bubble.BubbleContent
import timber.log.Timber

/** La conversation dont les vocaux se jouent : ce que la file, le mini-lecteur et la carte système décrivent. */
internal data class ChatVoiceThread(
    val conversationId: String,
    val conversationName: String,
    val artworkUrl: String?,
    /** L'accent de la conversation (hex), calculé par l'hôte : le mini-lecteur le reprend. */
    val accentHex: String?,
    val messages: List<BubbleContent>,
)

/**
 * **Ce que le fil demande au lecteur partagé** (iOS `CoordinatedAudioPlayer` + `ConversationAudioCoordinator`) : un flux
 * PAR PIÈCE (une bulle inactive ne reçoit aucune émission quand une autre progresse), et les gestes de la bulle.
 * La lecture vit dans le coordinateur de l'application : quitter le fil ne la coupe pas.
 */
internal interface ChatVoicePlayback {
    /** Ce que montre la bulle qui porte [attachmentIds] ; `null` tant qu'aucune de ses pièces n'est chargée. */
    fun playbackFor(attachmentIds: List<String>): Flow<BubbleAudioPlayback?>

    /** La valeur présente de [playbackFor], pour que la bulle active ne clignote pas au premier rendu. */
    fun currentPlayback(attachmentIds: List<String>): BubbleAudioPlayback?

    /** Le fil sous les yeux : la file se reconstruit depuis lui au toucher d'un vocal. */
    fun bind(thread: ChatVoiceThread)

    /** Toucher un vocal : pause/reprise s'il est le courant, sinon la file démarre depuis lui. */
    fun tap(audio: BubbleAudio, bubble: BubbleContent)

    /** Un vocal du hub média, joué seul. */
    fun tapLone(audio: BubbleAudio, messageId: String, senderName: String, sentAtEpochMs: Long)

    fun seekFraction(audio: BubbleAudio, fraction: Double)

    fun seekSeconds(audio: BubbleAudio, seconds: Double)

    fun cycleSpeed()

    /** La vraie forme d'onde (niveaux 0…1), calculée une fois et mise en cache ; jamais pour un vocal protégé. */
    fun samples(audio: BubbleAudio): StateFlow<List<Float>>
}

/** Le lecteur partagé du fil, fourni par l'écran de conversation ; `null` hors d'un fil (aperçus, tests de rendu). */
internal val LocalChatVoicePlayback = staticCompositionLocalOf<ChatVoicePlayback?> { null }

/**
 * Le pont Hilt entre le fil et le [ConversationAudioCoordinator] singleton (qui possède le moteur, la file, le mini-lecteur
 * et la carte système). Il ne garde que les vocaux écoutés pendant la session, en mémoire, et ne coupe rien en mourant.
 */
@HiltViewModel
internal class ChatAudioViewModel @Inject constructor(
    private val coordinator: ConversationAudioCoordinator,
    private val waveforms: WaveformRepository,
    private val uploads: UploadedAttachmentIds,
    @IoDispatcher private val io: CoroutineDispatcher,
) : ViewModel(), ChatVoicePlayback {

    private var thread: ChatVoiceThread? = null
    private val listened = MutableStateFlow<Set<String>>(emptySet())
    private val waveformByPiece = HashMap<String, StateFlow<List<Float>>>()
    private val acknowledgedIdOf: (String) -> String? = { cmid -> uploads.serverIdOf(cmid) }

    init {
        viewModelScope.launch {
            try {
                coordinator.attachmentFinished.collect { event ->
                    if (event.completed) listened.update { it + event.attachmentId }
                }
            } catch (failure: Exception) {
                Timber.e(failure, "Lecteur du fil : fin de vocal mal suivie")
            }
        }
    }

    override fun playbackFor(attachmentIds: List<String>): Flow<BubbleAudioPlayback?> =
        coordinator.playback.map { projectVoicePlayback(it, attachmentIds, acknowledgedIdOf) }.distinctUntilChanged()

    override fun currentPlayback(attachmentIds: List<String>): BubbleAudioPlayback? =
        projectVoicePlayback(coordinator.playback.value, attachmentIds, acknowledgedIdOf)

    override fun bind(thread: ChatVoiceThread) {
        this.thread = thread
        followAcknowledgedIn(thread.messages)
    }

    override fun tap(audio: BubbleAudio, bubble: BubbleContent) {
        follow(audio, bubble.messageId)
        when (VoiceTap.step(currentAttachmentId(), audio.attachmentId, audio.url, acknowledgedIdOf)) {
            VoiceTap.Step.REFUSE -> Unit
            VoiceTap.Step.TOGGLE -> coordinator.togglePlayPause()
            VoiceTap.Step.START_QUEUE -> {
                val bound = thread
                val start = ChatVoiceQueue.start(
                    tapped = audio,
                    bubble = bubble,
                    messages = bound?.messages.orEmpty(),
                    conversationId = bound?.conversationId.orEmpty(),
                    listenedAttachmentIds = listened.value,
                ) ?: return
                coordinator.play(start.current, start.tail, bound?.conversationName.orEmpty(), bound?.artworkUrl, bound?.accentHex)
            }
        }
    }

    override fun tapLone(audio: BubbleAudio, messageId: String, senderName: String, sentAtEpochMs: Long) {
        follow(audio, messageId)
        when (VoiceTap.step(currentAttachmentId(), audio.attachmentId, audio.url, acknowledgedIdOf)) {
            VoiceTap.Step.REFUSE -> Unit
            VoiceTap.Step.TOGGLE -> coordinator.togglePlayPause()
            VoiceTap.Step.START_QUEUE -> {
                val bound = thread
                val current = ChatVoiceQueue.lone(audio, messageId, senderName, sentAtEpochMs, bound?.conversationId.orEmpty()) ?: return
                coordinator.play(current, emptyList(), bound?.conversationName.orEmpty(), bound?.artworkUrl, bound?.accentHex)
            }
        }
    }

    override fun seekFraction(audio: BubbleAudio, fraction: Double) {
        follow(audio, null)
        if (coordinator.playback.value.attachmentId == audio.attachmentId) coordinator.seek(fraction)
    }

    override fun seekSeconds(audio: BubbleAudio, seconds: Double) {
        follow(audio, null)
        if (coordinator.playback.value.attachmentId == audio.attachmentId) coordinator.seekToMs((seconds * MS_PER_SECOND).toLong())
    }

    override fun cycleSpeed() = coordinator.cycleSpeed()

    override fun samples(audio: BubbleAudio): StateFlow<List<Float>> {
        val url = audio.url?.takeIf { it.isNotBlank() }
        if (audio.isProtected || url == null) return NO_WAVEFORM
        return waveformByPiece.getOrPut("${audio.attachmentId}|$url") {
            flow { emit(waveforms.bubbleLevels(url, BUBBLE_BAR_COUNT).values) }
                .catch { failure ->
                    Timber.w(failure, "Forme d'onde du vocal illisible : repli déterministe")
                    emit(emptyList())
                }
                .flowOn(io)
                .stateIn(viewModelScope, SharingStarted.WhileSubscribed(WAVEFORM_STOP_TIMEOUT_MS), emptyList())
        }
    }

    /**
     * #15969 — le vocal chargé sous le `cmid` de son téléversement a été accusé sous l'id de [audio] : la file, le moteur et
     * l'événement de fin prennent ce nom, et le moteur garde l'adresse servie pour reprendre si la copie locale disparaît.
     */
    private fun follow(audio: BubbleAudio, messageId: String?) {
        val loaded = coordinator.playback.value.attachmentId ?: return
        if (loaded == audio.attachmentId || acknowledgedIdOf(loaded) != audio.attachmentId) return
        val served = audio.url?.takeIf { it.isNotBlank() } ?: return
        coordinator.follow(loaded, audio.attachmentId, served, messageId)
    }

    /** Le fil sous les yeux montre-t-il la jumelle accusée du vocal chargé ? Retour immédiat dans le cas courant. */
    private fun followAcknowledgedIn(messages: List<BubbleContent>) {
        val loaded = coordinator.playback.value.attachmentId ?: return
        val server = acknowledgedIdOf(loaded) ?: return
        val message = messages.firstOrNull { bubble -> bubble.audios.any { it.attachmentId == server } } ?: return
        follow(message.audios.first { it.attachmentId == server }, message.messageId)
    }

    /** Le vocal que le coordinateur tient ET joue : un vocal terminé (file vidée) se rejoue avec sa file. */
    private fun currentAttachmentId(): String? {
        val loaded = coordinator.playback.value.attachmentId ?: return null
        return loaded.takeIf { coordinator.snapshot.value.queue.current?.attachmentId == it }
    }

    private companion object {
        const val MS_PER_SECOND = 1000.0

        /** La bulle sortie de l'écran laisse sa mesure s'annuler ; le relevé déjà rendu reste servi à son retour. */
        const val WAVEFORM_STOP_TIMEOUT_MS = 5_000L
        val NO_WAVEFORM: StateFlow<List<Float>> = MutableStateFlow(emptyList<Float>()).asStateFlow()
        val BUBBLE_BAR_COUNT: Int = WaveformBarsLayout.barCount(MediaPlayerContext.MESSAGE_BUBBLE.isCompact)
    }
}

/** La projection d'un état moteur sur la bulle qui porte [attachmentIds] (loi pure : [BubbleVoiceProjection.live]). */
internal fun projectVoicePlayback(
    state: AudioPlaybackState,
    attachmentIds: List<String>,
    acknowledgedIdOf: (String) -> String? = { null },
): BubbleAudioPlayback? = BubbleVoiceProjection.live(state, attachmentIds, acknowledgedIdOf)?.toBubblePlayback()

private fun BubbleVoiceLive.toBubblePlayback(): BubbleAudioPlayback = BubbleAudioPlayback(
    attachmentId = attachmentId,
    isPlaying = isPlaying,
    isLoading = isLoading,
    progress = fraction.toFloat(),
    timeLabel = "${formatMediaDuration(elapsedSeconds).orEmpty()} / ${formatMediaDuration(durationSeconds).orEmpty()}",
    currentSeconds = elapsedSeconds,
    speed = speed,
    durationSeconds = durationSeconds,
)

/** Les gestes vocaux d'une bulle, routés vers le lecteur partagé ; sans lecteur, la bulle se lit mais ne se joue pas. */
internal fun BubbleCallbacks.withVoice(voice: ChatVoicePlayback?, bubble: BubbleContent): BubbleCallbacks =
    if (voice == null) {
        this
    } else {
        copy(
            onAudioClick = { audio -> voice.tap(audio, bubble) },
            onAudioSeek = { audio, seconds -> voice.seekSeconds(audio, seconds) },
            onAudioSeekFraction = { audio, fraction -> voice.seekFraction(audio, fraction) },
            onAudioCycleSpeed = voice::cycleSpeed,
            audioSamples = voice::samples,
        )
    }

/** L'état vocal de la bulle qui porte [audios] : seule la bulle active se recompose quand la progression bouge. */
@Composable
internal fun rememberBubbleVoicePlayback(voice: ChatVoicePlayback?, audios: List<BubbleAudio>): State<BubbleAudioPlayback?> {
    val ids = remember(audios) { audios.map { it.attachmentId } }
    val flow: Flow<BubbleAudioPlayback?> = remember(voice, ids) {
        if (voice == null || ids.isEmpty()) flowOf(null) else voice.playbackFor(ids)
    }
    val initial: BubbleAudioPlayback? = remember(voice, ids) { if (ids.isEmpty()) null else voice?.currentPlayback(ids) }
    return flow.collectAsStateWithLifecycle(initialValue = initial)
}

/** L'accent de la conversation en hex `#RRGGBB`, tel que le mini-lecteur et la carte système le reprennent. */
internal fun androidx.compose.ui.graphics.Color.voiceHex(): String = "#%06X".format(toArgb() and 0xFFFFFF)
