package me.meeshy.app.chat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import me.meeshy.app.chat.audio.AudioFullscreenAuthorVisual
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.fullscreen.AudioFullscreenStart
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.VoiceVariant
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.playback.ConversationAudioCoordinator
import me.meeshy.ui.component.audio.AudioFullscreenPlayer
import me.meeshy.ui.component.audio.AudioFullscreenScreen
import me.meeshy.ui.component.audio.AudioFullscreenSource
import me.meeshy.ui.component.bubble.BubbleContent
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.ui.Modifier
import me.meeshy.ui.component.viewer.viewerDialogProperties

/**
 * **Les pages du plein écran audio ouvert sur [startId]** (iOS `QuotedAudioFullscreen.sources`) :
 *
 * - la pièce est dans la fenêtre du fil ⇒ tous les vocaux du fil qui peuvent devenir une page, pour que le balayage
 *   continue sur les voisins (une pièce protégée, supprimée ou sans adresse n'en devient jamais une) ;
 * - elle n'y est pas mais un message de la fenêtre la cite ⇒ la seule pièce citée, l'auteur relu dans la citation ;
 * - sinon, ou si la pièce visée est protégée : `null`, rien ne s'ouvre.
 */
internal object ChatAudioFullscreenSources {

    fun of(startId: String, thread: List<BubbleContent>, conversationId: String, contextName: String): List<AudioFullscreenSource>? =
        pages(startId, thread, conversationId, contextName)?.let { AudioFullscreenAuthorVisual.withRings(it, thread) }

    private fun pages(startId: String, thread: List<BubbleContent>, conversationId: String, contextName: String): List<AudioFullscreenSource>? {
        val window = thread.flatMap { bubble -> bubble.audios.map { audio -> bubble to audio } }
        val hit = window.firstOrNull { (_, audio) -> audio.attachmentId == startId }
        if (hit != null) {
            AudioFullscreenSource.fromBubble(hit.first, hit.second, conversationId, contextName) ?: return null
            return window.mapNotNull { (bubble, audio) -> AudioFullscreenSource.fromBubble(bubble, audio, conversationId, contextName) }
        }
        return quoted(startId, thread, conversationId, contextName)?.let(::listOf)
    }

    private fun quoted(startId: String, thread: List<BubbleContent>, conversationId: String, contextName: String): AudioFullscreenSource? {
        val quoting = thread.firstOrNull { it.replyToAudio?.attachmentId == startId && !it.replyToDeleted } ?: return null
        val audio = quoting.replyToAudio ?: return null
        val url = audio.url?.takeIf { it.isNotBlank() } ?: return null
        if (audio.isProtected) return null
        val name = quoting.replyToSenderName.orEmpty()
        return AudioFullscreenSource(
            attachmentId = audio.attachmentId,
            url = url,
            durationMs = audio.declaredDurationMs,
            author = quoting.replyToAuthor ?: ProfileSheetUser(username = name, displayName = name.ifBlank { null }),
            createdAtEpochMs = 0L,
            carrierId = quoting.replyToId.orEmpty(),
            conversationId = conversationId,
            contextName = contextName,
            trackLanguage = audio.playedLanguage,
            isTranslatedTrack = audio.isAudioTranslated,
            servedConsumption = me.meeshy.sdk.model.playback.MediaConsumptionSeed.of(audio.lastPlayPositionMs, audio.listenedComplete),
        )
    }

    /** L'identifiant du vocal qu'une citation de [quoting] désigne : sa pièce citée, sinon le premier vocal du cité en fenêtre. */
    fun quotedVoiceId(quoting: BubbleContent?, quoted: BubbleContent?): String? =
        quoting?.replyToAudio?.attachmentId ?: quoted?.audios?.firstOrNull()?.attachmentId
}

/**
 * **Le plein écran audio branché sur le lecteur partagé de l'application** (le [ConversationAudioCoordinator] : file,
 * mini-lecteur, carte système). Démarrer une page suit [AudioFullscreenStart] — la page déjà jouée ne change que sa suite ;
 * une autre page de la même conversation garde la session ; sinon une session neuve, nommée par la conversation.
 */
internal class CoordinatorAudioFullscreenPlayer(
    private val coordinator: ConversationAudioCoordinator,
    private val artworkUrl: () -> String?,
    private val accentHex: () -> String?,
    private val samplesOf: (AudioFullscreenSource) -> StateFlow<List<Float>>,
    private val restingOf: (String) -> Long?,
    scope: CoroutineScope,
) : AudioFullscreenPlayer {

    override val playback: StateFlow<AudioPlaybackState> get() = coordinator.playback

    override val activeAttachmentId: StateFlow<String?> = coordinator.snapshot
        .map { it.queue.current?.attachmentId }
        .distinctUntilChanged()
        .stateIn(scope, SharingStarted.Eagerly, coordinator.snapshot.value.queue.current?.attachmentId)

    override fun start(source: AudioFullscreenSource, upcoming: List<QueuedAudio>) {
        val snapshot = coordinator.snapshot.value
        val step = AudioFullscreenStart.step(
            pageAttachmentId = source.id,
            activeAttachmentId = snapshot.queue.current?.attachmentId,
            activeConversationId = snapshot.context?.audio?.conversationId,
            pageConversationId = source.conversationId,
        )
        val context = snapshot.context
        when {
            step == AudioFullscreenStart.Step.ALREADY_ACTIVE -> coordinator.replaceUpcoming(upcoming)
            step == AudioFullscreenStart.Step.KEEP_SESSION && context != null -> coordinator.play(
                source.queuedAudio(),
                upcoming,
                context.conversationName,
                context.conversationArtworkUrl,
                context.accentHex,
            )
            else -> coordinator.play(source.queuedAudio(), upcoming, source.contextName, artworkUrl(), accentHex())
        }
    }

    override fun togglePlayPause() = coordinator.togglePlayPause()

    override fun skip(seconds: Double) = coordinator.skip(seconds)

    override fun seek(fraction: Double) = coordinator.seek(fraction)

    override fun setSpeed(speed: PlaybackSpeed) = coordinator.setSpeed(speed)

    override fun replaceUpcoming(upcoming: List<QueuedAudio>) = coordinator.replaceUpcoming(upcoming)

    override fun restingPositionMs(attachmentId: String): Long? = restingOf(attachmentId)

    override fun samples(source: AudioFullscreenSource): StateFlow<List<Float>> = samplesOf(source)

    /** Une langue de piste choisie : le moteur recharge la piste servie de CE vocal au même point, la file et le contexte la reprennent. */
    override fun switchTrack(source: AudioFullscreenSource): Boolean {
        val playing = coordinator.snapshot.value.queue.current ?: return false
        val served = source.queuedAudio()
        if (!VoiceVariant.isStale(playing, served)) return false
        coordinator.switchVariant(served)
        return true
    }
}

/**
 * Le plein écran audio du fil, ouvert par la bulle d'un vocal ou par un vocal cité — l'hôte unique des présentations
 * ([ChatMediaHost]) garantit qu'un seul est ouvert. Sans page possible (pièce protégée, disparue), il se referme.
 *
 * Télécharger passe par [onDownload] (le circuit « Enregistrer » du fil, qui revérifie la loi de sortie) ; l'avancement
 * et les échecs d'un enregistrement d'une de SES pages se peignent DANS la fenêtre ([download]), sans quoi le bandeau
 * du fil resterait caché derrière elle.
 */
@Composable
internal fun ChatAudioFullscreen(
    attachmentId: String,
    thread: List<BubbleContent>,
    conversationId: String,
    conversationName: String,
    voice: ChatVoicePlayback?,
    accent: Color,
    onDismiss: () -> Unit,
    onDismissToMessage: (String) -> Unit = {},
    conversationIsEndToEnd: Boolean = true,
    onDownload: ((AudioFullscreenSource) -> Unit)? = null,
    download: FileAttachmentDownloadUiState? = null,
    onDismissDownload: () -> Unit = {},
    onRetryDownload: () -> Unit = {},
    actions: me.meeshy.ui.component.audio.AudioFullscreenActionPort? = null,
    languages: ChatAudioFullscreenLanguages? = null,
    /** #16420 — la note de consentement de la feuille des langues : la configuration de la voix s'ouvre. */
    onOpenConsent: () -> Unit = {},
    transcription: AudioFullscreenViewModel = hiltViewModel(),
) {
    val player = voice?.fullscreenPlayer()
    val sources = remember(attachmentId, thread, conversationId, conversationName) {
        ChatAudioFullscreenSources.of(attachmentId, thread, conversationId, conversationName)
    }
    if (voice == null || player == null || sources.isNullOrEmpty()) {
        androidx.compose.runtime.LaunchedEffect(attachmentId) { onDismiss() }
        return
    }
    val pageIds = remember(sources) { sources.map { it.id }.toSet() }
    var languagesOf by remember { mutableStateOf<String?>(null) }
    val latestThread by rememberUpdatedState(thread)
    val transcripts = remember(transcription, languages, conversationIsEndToEnd) {
        ChatAudioFullscreenTranscripts(
            transcription = transcription,
            languages = languages,
            isEndToEnd = conversationIsEndToEnd,
            readerLanguages = transcription::readerLanguages,
            thread = { latestThread },
            onOpenLanguages = { source -> languagesOf = source.carrierId },
        )
    }
    Dialog(onDismissRequest = onDismiss, properties = viewerDialogProperties(secure = false)) {
        Box(Modifier.fillMaxSize()) {
            AudioFullscreenScreen(
                sources = sources,
                startAttachmentId = attachmentId,
                player = player,
                accent = accent,
                onDismiss = onDismiss,
                conversationTail = voice::conversationTail,
                onDismissToMessage = onDismissToMessage,
                onDownload = onDownload,
                conversationIsEndToEnd = conversationIsEndToEnd,
                actions = actions,
                transcripts = transcripts,
            )
            languagesOf?.let { messageId ->
                val input = remember(messageId, thread, languages) { transcripts.sheetInput(messageId) }
                if (input != null && languages != null) {
                    AudioTranslationSheet(
                        input = input,
                        accentColor = accent,
                        onPlayTrack = languages.onAudioLanguage,
                        onOpenConsent = {
                            languagesOf = null
                            onOpenConsent()
                        },
                        onDismiss = { languagesOf = null },
                    )
                }
            }
            FileAttachmentDownloadBanner(
                download = download?.takeIf { it.attachmentId in pageIds },
                onDismiss = onDismissDownload,
                onRetry = { onRetryDownload() },
            )
        }
    }
}
