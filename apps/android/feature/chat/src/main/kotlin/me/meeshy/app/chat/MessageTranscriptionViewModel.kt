package me.meeshy.app.chat

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import me.meeshy.sdk.attachment.TranscriptionRequestTracker
import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.MessageTranscriptionFiche.Request
import me.meeshy.sdk.net.MeeshyConfig
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.util.resolveMediaUrl

/**
 * La demande de transcription de la fiche (#13779) : au repos, en cours, en échec. L'état n'est plus local : il vient du
 * [TranscriptionRequestTracker], le MÊME que celui de la bulle — « Transcription… » reste tant que la tâche tourne
 * (jusqu'au plafond de 90 s de silence, puis « Transcrire » revient), `audio:transcription-failed` met la demande en
 * échec, réessayable. Le résultat, lui, arrive par le cache du fil.
 */
@HiltViewModel
class MessageTranscriptionViewModel @Inject constructor(
    private val tracker: TranscriptionRequestTracker,
    private val playback: AudioPlaybackEngine,
    sessionRepository: SessionRepository,
    private val config: MeeshyConfig,
) : ViewModel() {

    private val user = sessionRepository.currentUser

    val preferences: LanguageResolver.ContentLanguagePreferences
        get() = user.value ?: EmptyContentPreferences

    /** L'état de la demande de la pièce [attachmentId] du message [messageId], tenu à jour. */
    fun requestState(messageId: String, attachmentId: String): Flow<Request> = tracker.observe(messageId, attachmentId)

    fun transcribe(messageId: String, attachmentId: String) {
        viewModelScope.launch { tracker.request(messageId, attachmentId) }
    }

    /**
     * Joue la piste parlée d'une traduction au toucher ; une autre piste en cours s'arrête (le moteur est unique).
     * [isProtected] est la protection RÉELLE du message ([me.meeshy.sdk.model.MessageTranscriptionFiche.playbackIsProtected]) :
     * protégée, la piste ne s'écrit jamais sur le disque. [url] est celle que la passerelle sert, souvent RELATIVE
     * (`/api/v1/attachments/file/translated/…`) : elle se résout comme celle de la bulle ([resolveMediaUrl]).
     */
    fun playTranslation(messageId: String, language: String, url: String, isProtected: Boolean) {
        val played = playback.play(
            attachmentId = "$messageId:tts:$language",
            url = resolveMediaUrl(url, config.apiBaseUrl),
            isProtected = isProtected,
        )
        startedPlayback = played || startedPlayback
    }

    private var startedPlayback = false

    override fun onCleared() {
        if (startedPlayback) playback.stop()
    }
}
