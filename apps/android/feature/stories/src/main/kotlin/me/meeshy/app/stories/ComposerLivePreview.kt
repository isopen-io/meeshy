package me.meeshy.app.stories

import android.net.Uri
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.composer.live.ComposerLiveKind
import me.meeshy.sdk.model.composer.live.ComposerLivePlayback
import me.meeshy.sdk.model.composer.live.ComposerLiveSubject
import me.meeshy.sdk.model.composer.live.ComposerLiveWindow
import me.meeshy.sdk.model.composer.sound.SoundTrimLaw
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.ComposerLivePlayerState
import me.meeshy.ui.component.media.ComposerLiveVideo
import me.meeshy.ui.component.media.rememberComposerLivePlayer

/** Ce que le lecteur vivant joue pour la sélection : l'adresse du média, sa fenêtre et son volume. */
internal data class ComposerLiveCue(val subject: ComposerLiveSubject, val url: String, val window: ComposerLiveWindow, val volume: Float)

/** La vidéo vivante de la sélection, que la scène pose à la place de l'affiche du média sélectionné. */
internal class ComposerLiveSlot(val subject: ComposerLiveSubject, private val player: ComposerLivePlayerState) {
    @Composable
    fun Picture(fit: Boolean, modifier: Modifier = Modifier.fillMaxSize()) = ComposerLiveVideo(player, fit, modifier)
}

/** La vidéo vivante tendue par l'hôte du compositeur à sa scène ; `null` : aucune vidéo sélectionnée ne joue. */
internal val LocalComposerLive = compositionLocalOf<ComposerLiveSlot?> { null }

/** Le média que la sélection fait jouer (#13973, lot A-E3) : le son touché, sinon la vidéo touchée — le fond ou un média posé. */
internal val StoryComposerUiState.liveSubject: ComposerLiveSubject?
    get() {
        val media = selectedMedia
        val sound = selectedSound
        return ComposerLivePlayback.subject(
            ComposerLivePlayback.Selection(
                backgroundVideoId = selectedSlideBackdropMediaId?.takeIf(::placedMediaIsVideo),
                mediaId = media,
                mediaIsVideo = media?.let(::placedMediaIsVideo) == true,
                soundId = sound?.id,
                soundPlayable = !sound?.mediaURL.isNullOrEmpty(),
            ),
        )
    }

/**
 * Ce que le lecteur vivant joue : la vidéo du fond dans la fenêtre de son Couper, une vidéo posée dans la sienne, un son
 * dans sa fenêtre propre et à son volume. `null` quand le média n'a pas d'adresse jouable (un envoi gardé en mémoire).
 */
internal fun StoryComposerUiState.liveCue(mediaBaseUrl: String?, soundUrl: (StoryAudioPlayerObject) -> String?): ComposerLiveCue? {
    val subject = liveSubject ?: return null
    return when (subject.kind) {
        ComposerLiveKind.AUDIO -> selectedSound?.let { sound ->
            val window = trimSourceOf(sound)?.let { SoundTrimLaw.window(sound, it) }
            soundUrl(sound)?.let { ComposerLiveCue(subject, it, ComposerLivePlayback.window(window), ComposerLivePlayback.volume(sound.volume, sound.isMuted)) }
        }
        ComposerLiveKind.VIDEO -> playableVideoUrl(subject.id, mediaBaseUrl)?.let { url ->
            val window = if (subject.background) backgroundTrimOf(subject.id) else placedTrimOf(subject.id)
            ComposerLiveCue(subject, url, ComposerLivePlayback.window(window), ComposerLivePlayback.volume(1f, muted = false))
        }
    }
}

/** L'adresse jouable de la vidéo [id] : celle de l'envoi servi, ou le fichier de l'appareil d'un envoi en attente. */
private fun StoryComposerUiState.playableVideoUrl(id: String, mediaBaseUrl: String?): String? {
    val file = deck.selectedSlide.mediaFileOf(id)
    attachments.firstOrNull { it.id == file }?.url?.takeIf { it.isNotBlank() }?.let { return ComposerMediaAddress.of(it, mediaBaseUrl) }
    val source = pendingUploads.firstOrNull { it.cmid == file }?.item?.source as? MediaUploadSource.OnDisk ?: return null
    return Uri.fromFile(source.file).toString()
}

/**
 * Le lecteur vivant du compositeur, monté par son hôte : il joue ce que la sélection désigne tant que l'écran est au
 * premier plan et l'étagère des sons fermée, et tend à la scène l'image d'une vidéo ([LocalComposerLive]).
 */
@Composable
internal fun rememberComposerLive(state: StoryComposerUiState, viewModel: StoryComposerViewModel, shelfOpen: Boolean): ComposerLiveSlot? {
    val screen by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val cue = state.liveCue(viewModel.mediaBaseUrl, viewModel::playableSoundUrl) ?: return null
    val video = cue.subject.kind == ComposerLiveKind.VIDEO
    val player = rememberComposerLivePlayer(
        mediaUrl = cue.url,
        window = cue.window,
        volume = cue.volume,
        playing = ComposerLivePlayback.plays(cue.subject, screen.isAtLeast(Lifecycle.State.RESUMED), shelfOpen),
        category = if (video) MediaCacheCategory.VIDEO else MediaCacheCategory.AUDIO,
    )
    val slot = remember(cue.subject, player) { ComposerLiveSlot(cue.subject, player) }
    return slot.takeIf { video }
}
