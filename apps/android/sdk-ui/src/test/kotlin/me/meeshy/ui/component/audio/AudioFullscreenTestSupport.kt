package me.meeshy.ui.component.audio

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import me.meeshy.sdk.model.QueuedAudio
import me.meeshy.sdk.model.media.PlaybackSpeed
import me.meeshy.sdk.model.playback.AudioPlaybackState
import me.meeshy.sdk.model.profile.ProfileSheetUser

/** Le lecteur partagé vu par le plein écran : il note ce qu'on lui demande et joue ce qu'on lui donne. */
internal class FakeAudioFullscreenPlayer : AudioFullscreenPlayer {
    val mutablePlayback = MutableStateFlow(AudioPlaybackState())
    val mutableActive = MutableStateFlow<String?>(null)
    override val playback: StateFlow<AudioPlaybackState> = mutablePlayback
    override val activeAttachmentId: StateFlow<String?> = mutableActive

    val starts = mutableListOf<String>()
    val upcomings = mutableListOf<List<String>>()
    val replaced = mutableListOf<List<String>>()
    val skips = mutableListOf<Double>()
    val speeds = mutableListOf<PlaybackSpeed>()
    var toggles = 0
    var stops = 0

    override fun start(source: AudioFullscreenSource, upcoming: List<QueuedAudio>) {
        starts += source.id
        upcomings += upcoming.map { it.attachmentId }
        mutableActive.value = source.id
        mutablePlayback.value = AudioPlaybackState(attachmentId = source.id, isPlaying = true, durationMs = source.durationMs)
    }

    override fun togglePlayPause() {
        toggles += 1
        mutablePlayback.value = mutablePlayback.value.copy(isPlaying = !mutablePlayback.value.isPlaying)
    }

    override fun skip(seconds: Double) { skips += seconds }

    override fun seek(fraction: Double) = Unit

    override fun setSpeed(speed: PlaybackSpeed) { speeds += speed }

    override fun replaceUpcoming(upcoming: List<QueuedAudio>) { replaced += upcoming.map { it.attachmentId } }

    override fun samples(source: AudioFullscreenSource): StateFlow<List<Float>> = MutableStateFlow(emptyList())
}

internal fun audioSource(id: String, receivedAt: Long, author: String = "Auteur $id") = AudioFullscreenSource(
    attachmentId = id,
    url = "https://cdn.meeshy.me/$id.m4a",
    durationMs = 10_000L,
    author = ProfileSheetUser(username = author, displayName = author),
    createdAtEpochMs = receivedAt,
    carrierId = "m$id",
    conversationId = "c1",
    contextName = "Famille",
)
