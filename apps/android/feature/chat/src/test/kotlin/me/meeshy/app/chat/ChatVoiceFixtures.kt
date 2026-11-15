package me.meeshy.app.chat

import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.playback.PlaybackCommandOrigin
import me.meeshy.sdk.playback.AudioEngineEvent
import me.meeshy.sdk.playback.AudioPlaybackEngine
import me.meeshy.ui.component.bubble.BubbleAudio
import me.meeshy.ui.component.bubble.BubbleContent

/** Une bulle à vocaux du fil — la fabrique des témoins du lecteur partagé du fil. */
internal fun voiceMessage(
    id: String,
    createdAtIso: String,
    vararg audios: BubbleAudio,
    isOutgoing: Boolean = false,
    isViewOnce: Boolean = false,
): BubbleContent = BubbleContent(
    messageId = id,
    text = "",
    isOutgoing = isOutgoing,
    isTranslated = false,
    originalText = null,
    senderName = if (isOutgoing) "Moi" else "Nour",
    showSenderName = false,
    isEdited = false,
    isDeleted = false,
    createdAtIso = createdAtIso,
    senderId = if (isOutgoing) "me" else "nour",
    audios = audios.toList(),
    isViewOnce = isViewOnce,
)

internal fun voice(
    id: String,
    url: String? = "https://cdn.meeshy.me/$id.m4a",
    seconds: Int = 12,
    listenedComplete: Boolean = false,
    isProtected: Boolean = false,
    audioLanguage: String? = null,
): BubbleAudio = BubbleAudio(
    attachmentId = id,
    url = url,
    durationSeconds = seconds,
    listenedComplete = listenedComplete,
    isProtected = isProtected,
    audioLanguage = audioLanguage,
    isAudioTranslated = audioLanguage != null,
)

/** Un moteur partagé de doublure : il retient ce qu'on lui demande et publie l'état qu'on lui pose. */
internal class FakeVoiceEngine : AudioPlaybackEngine {
    val mutable = MutableStateFlow(AudioPlaybackState())
    val mutableEvents = MutableSharedFlow<AudioEngineEvent>(extraBufferCapacity = 8)
    override val state: StateFlow<AudioPlaybackState> = mutable
    override val events: SharedFlow<AudioEngineEvent> = mutableEvents
    val played = mutableListOf<String>()
    val protections = mutableListOf<Boolean>()
    val locals = mutableListOf<String>()
    val fractions = mutableListOf<Double>()
    val seeks = mutableListOf<Long>()
    var toggles = 0

    override fun play(attachmentId: String, url: String, origin: PlaybackCommandOrigin, isProtected: Boolean): Boolean {
        played += attachmentId
        protections += isProtected
        mutable.value = AudioPlaybackState(attachmentId = attachmentId, isLoading = true, speed = mutable.value.speed)
        return true
    }

    override fun playLocal(attachmentId: String, fileUri: String, origin: PlaybackCommandOrigin): Boolean {
        locals += fileUri
        played += attachmentId
        mutable.value = AudioPlaybackState(attachmentId = attachmentId, isLoading = true, speed = mutable.value.speed)
        return true
    }

    override fun togglePlayPause(origin: PlaybackCommandOrigin) { toggles += 1 }
    override fun pause() = Unit
    override fun resumeFromInterruption() = Unit
    override fun stop() { mutable.value = AudioPlaybackState(speed = mutable.value.speed) }
    override fun seek(fraction: Double) { fractions += fraction }
    override fun seekToMs(positionMs: Long) { seeks += positionMs }
    override fun skip(seconds: Double) = Unit
    override fun setSpeed(speed: PlaybackSpeed) { mutable.value = mutable.value.copy(speed = speed) }
    override fun cycleSpeed() = setSpeed(mutable.value.speed.next())
    override fun setLoop(loop: Boolean) = Unit
    override fun setServedConsumption(attachmentId: String, consumption: MeeshyMediaConsumption?) = Unit
    override fun setConsumedLanguageProvider(provider: (() -> String?)?) = Unit

    val follows = mutableListOf<List<Any>>()
    override fun follow(fromAttachmentId: String, toAttachmentId: String, servedUrl: String, isProtected: Boolean) {
        follows += listOf(fromAttachmentId, toAttachmentId, servedUrl, isProtected)
        if (mutable.value.attachmentId == fromAttachmentId) mutable.value = mutable.value.copy(attachmentId = toAttachmentId)
    }

    fun playingAt(id: String, positionMs: Long, durationMs: Long = 12_000) {
        mutable.value = AudioPlaybackState(attachmentId = id, isPlaying = true, currentTimeMs = positionMs, durationMs = durationMs, speed = mutable.value.speed)
    }
}
