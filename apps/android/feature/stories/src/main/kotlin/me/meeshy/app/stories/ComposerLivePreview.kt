package me.meeshy.app.stories

import android.net.Uri
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.compose.currentStateAsState
import me.meeshy.sdk.media.MediaUploadSource
import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryMediaLook
import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.composer.live.ComposerLiveFollow
import me.meeshy.sdk.model.composer.live.ComposerLiveKind
import me.meeshy.sdk.model.composer.live.ComposerLivePlayback
import me.meeshy.sdk.model.composer.live.ComposerLiveSubject
import me.meeshy.sdk.model.composer.live.ComposerLiveWindow
import me.meeshy.sdk.model.composer.look.StoryMediaLookMapping
import me.meeshy.sdk.model.composer.timeline.TrackBar
import me.meeshy.sdk.model.composer.sound.SoundTrimLaw
import me.meeshy.sdk.model.scene.SceneAudioChipClock
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.ui.component.media.ComposerLivePlayerState
import me.meeshy.ui.component.media.ComposerLiveVideo
import me.meeshy.ui.component.media.rememberComposerLivePlayer
import me.meeshy.ui.component.retouch.rememberComposerLookAuthor
import me.meeshy.ui.component.retouch.rememberStoryVideoLookEffects

/** Ce qu'un lecteur vivant de la scène joue : l'adresse du média, sa fenêtre, son volume et, pour une vidéo réglée, son look. */
internal data class ComposerLiveCue(
    val subject: ComposerLiveSubject,
    val url: String,
    val window: ComposerLiveWindow,
    val volume: Float,
    val look: ComposerLiveLook? = null,
)

/**
 * Le look d'une vidéo de la scène (#13841), que le lecteur vivant peint par le GPU : sa taille debout quand le serveur la
 * connaît, et son affiche, d'où certains cadres tirent leur fond.
 */
internal data class ComposerLiveLook(val look: StoryMediaLook, val size: Pair<Int, Int>?, val poster: Any?)

/** L'image vivante d'une vidéo de la scène, que la scène pose à la place de son affiche. */
internal class ComposerLiveSlot(val subject: ComposerLiveSubject, private val player: ComposerLivePlayerState) {
    @Composable
    fun Picture(fit: Boolean, modifier: Modifier = Modifier.fillMaxSize()) = ComposerLiveVideo(player, fit, modifier)
}

/**
 * La tête d'un son vivant de la scène, lue par le chrono de sa puce (#16293) : la position du lecteur, tenu sur la source
 * entière, ramenée au début de la fenêtre que joue le son.
 */
internal class ComposerLiveSoundClock(val id: String, private val player: ComposerLivePlayerState, private val windowStartMs: Long) {
    val chip: AudioChipClock = AudioChipClock.Live { SceneAudioChipClock.livePositionSeconds(player.positionMs, windowStartMs) }
}

/**
 * Les vidéos vivantes de la diapo, par identifiant d'objet (le fond par le sien) : la scène y cherche chacune. [sounds] : la
 * tête de chaque son vivant, par identifiant de piste.
 */
internal data class ComposerLiveStage(
    private val videos: Map<String, ComposerLiveSlot>,
    private val sounds: Map<String, ComposerLiveSoundClock> = emptyMap(),
) {
    val background: ComposerLiveSlot? get() = videos.values.firstOrNull { it.subject.background }

    fun placed(id: String): ComposerLiveSlot? = videos[id]?.takeUnless { it.subject.background }

    /** Le chrono de la puce du son [id] ; `null` : ce son ne joue pas. */
    fun soundClock(id: String): AudioChipClock? = sounds[id]?.chip

    /** Pendant « Comparer » sur [id], la vidéo cède la place à son affiche, qui montre l'original. */
    fun comparing(id: String?): ComposerLiveStage = if (id == null || id !in videos) this else copy(videos = videos - id)
}

/** La scène vivante tendue par l'hôte du compositeur à sa scène ; `null` : rien ne joue. */
internal val LocalComposerLive = compositionLocalOf<ComposerLiveStage?> { null }

/**
 * Ce que la scène joue en continu (#13863, loi 6 : le player est l'aperçu) : la vidéo du fond dans la fenêtre de son Couper,
 * chaque vidéo posée dans la sienne et à son volume d'auteur (#13973, A-E4), chaque son — de fond ou posé — dans sa fenêtre propre et à son volume ; sélectionnés
 * ou non — un son enregistré se joue depuis son média. Les vidéos au-delà de ce que l'appareil décode ensemble gardent leur image ([ComposerLivePlayback.playing]). Un
 * média sans adresse jouable (un envoi gardé en mémoire) ne joue pas.
 */
internal fun StoryComposerUiState.liveCues(mediaBaseUrl: String?, soundUrl: (StoryAudioPlayerObject) -> String?): List<ComposerLiveCue> {
    val cues = listOfNotNull(backgroundVideoCue(mediaBaseUrl)) + placedVideoCues(mediaBaseUrl) + soundCues(soundUrl)
    val playing = ComposerLivePlayback.playing(cues.map { it.subject }, selectedId = selectedMedia).toSet()
    return cues.filter { it.subject in playing }
}

private fun StoryComposerUiState.backgroundVideoCue(mediaBaseUrl: String?): ComposerLiveCue? {
    val id = selectedSlideBackdropMediaId?.takeIf(::placedMediaIsVideo) ?: return null
    val url = playableVideoUrl(id, mediaBaseUrl) ?: return null
    val volume = paintedBackgroundSetting.let { ComposerLivePlayback.volume(it.volume, it.isMuted) }
    return ComposerLiveCue(
        ComposerLiveSubject(id, ComposerLiveKind.VIDEO, background = true),
        url,
        ComposerLivePlayback.window(backgroundTrimOf(id)),
        volume,
        liveLookOf(id, mediaBaseUrl),
    )
}

private fun StoryComposerUiState.placedVideoCues(mediaBaseUrl: String?): List<ComposerLiveCue> =
    deck.selectedSlide.placedMedia.filter { placedMediaIsVideo(it.id) }.mapNotNull { placed ->
        playableVideoUrl(placed.id, mediaBaseUrl)?.let { url ->
            ComposerLiveCue(
                subject = ComposerLiveSubject(placed.id, ComposerLiveKind.VIDEO, background = false),
                url = url,
                window = ComposerLivePlayback.window(placedTrimOf(placed.id)),
                volume = ComposerLivePlayback.volume(placed.volume, placed.isMuted),
                look = liveLookOf(placed.id, mediaBaseUrl),
            )
        }
    }

private fun StoryComposerUiState.soundCues(soundUrl: (StoryAudioPlayerObject) -> String?): List<ComposerLiveCue> =
    deck.selectedSlide.audio.mapNotNull { sound ->
        (soundUrl(sound)?.takeIf { it.isNotBlank() } ?: playableFileUrl(sound.postMediaId, null))?.let { url ->
            ComposerLiveCue(ComposerLiveSubject(sound.id, ComposerLiveKind.AUDIO, background = false), url, soundWindow(sound), ComposerLivePlayback.volume(sound.volume, sound.isMuted))
        }
    }

/** Le look que la vidéo [id] peint, sa taille servie et son affiche ; `null` quand il ne peint rien sur une vidéo. */
private fun StoryComposerUiState.liveLookOf(id: String, mediaBaseUrl: String?): ComposerLiveLook? {
    val look = mediaLookOf(id)?.takeIf(StoryMediaLookMapping::videoPaints) ?: return null
    val file = deck.selectedSlide.mediaFileOf(id)
    val uploaded = attachments.firstOrNull { it.id == file }
    if (uploaded != null) {
        val size = uploaded.width?.let { width -> uploaded.height?.let { height -> width to height } }
        return ComposerLiveLook(look, size, ComposerPicture.of(uploaded, mediaBaseUrl))
    }
    return ComposerLiveLook(look, size = null, poster = pendingUploads.firstOrNull { it.cmid == file }?.item?.let { ComposerPicture.of(it) })
}

/** La fenêtre propre d'un son : celle de son rognage quand sa source est connue, sinon ses bornes servies, sinon entière. */
private fun StoryComposerUiState.soundWindow(sound: StoryAudioPlayerObject): ComposerLiveWindow {
    trimSourceOf(sound)?.let { source -> return ComposerLivePlayback.window(SoundTrimLaw.window(sound, source)) }
    val served = StorySourceWindow.clippingMs(sound.sourceStart, sound.sourceEnd) ?: return ComposerLiveWindow.WHOLE
    return ComposerLiveWindow(served.startMs, served.endMs)
}

/** L'adresse jouable de la vidéo [id] : celle de l'envoi servi, ou le fichier de l'appareil d'un envoi en attente. */
internal fun StoryComposerUiState.playableVideoUrl(id: String, mediaBaseUrl: String?): String? =
    playableFileUrl(deck.selectedSlide.mediaFileOf(id), mediaBaseUrl)

private fun StoryComposerUiState.playableFileUrl(file: String, mediaBaseUrl: String?): String? {
    if (file.isBlank()) return null
    attachments.firstOrNull { it.id == file }?.url?.takeIf { it.isNotBlank() }?.let { return ComposerMediaAddress.of(it, mediaBaseUrl) }
    val source = pendingUploads.firstOrNull { it.cmid == file }?.item?.source as? MediaUploadSource.OnDisk ?: return null
    return Uri.fromFile(source.file).toString()
}

/**
 * La scène vivante du compositeur, montée par son hôte : un lecteur par média que la diapo joue, tous ensemble, tant que
 * l'écran est au premier plan et l'étagère des sons fermée ; elle tend à la scène l'image de chaque vidéo
 * ([LocalComposerLive]). Changer de diapo change de lecteurs ; Couper, régler le volume ou sélectionner n'en recrée aucun.
 */
@Composable
internal fun rememberComposerLive(
    state: StoryComposerUiState,
    viewModel: StoryComposerViewModel,
    shelfOpen: Boolean,
    transport: FriseTransport? = null,
): ComposerLiveStage {
    val screen by LocalLifecycleOwner.current.lifecycle.currentStateAsState()
    val author = rememberComposerLookAuthor(viewModel.lookPerson)
    val plays = ComposerLivePlayback.plays(screen.isAtLeast(Lifecycle.State.RESUMED), shelfOpen)
    val windows = state.sceneWindows()
    val slots = state.liveCues(viewModel.mediaBaseUrl, viewModel::playableSoundUrl).map { cue ->
        key(cue.subject.id, cue.url) {
            val video = cue.subject.kind == ComposerLiveKind.VIDEO
            val poster = rememberComposerPicture(cue.look?.poster)
            val effects = rememberStoryVideoLookEffects(cue.look?.look, cue.url, cue.look?.size, poster, author)
            val player = rememberComposerLivePlayer(
                mediaUrl = cue.url,
                window = cue.window,
                volume = cue.volume,
                playing = plays,
                category = if (video) MediaCacheCategory.VIDEO else MediaCacheCategory.AUDIO,
                follow = transport?.takeIf { it.isOpen }?.let { frise ->
                    val (start, end) = windows[cue.subject.id] ?: (0f to null)
                    ComposerLiveFollow(ComposerLivePlayback.followed(cue.window, start, end, state.playheadSeconds), frise.playing)
                },
                effects = effects,
            )
            if (video) {
                remember(cue.subject, player) { ComposerLiveSlot(cue.subject, player) }
            } else {
                remember(cue.subject, player, cue.window.startMs) { ComposerLiveSoundClock(cue.subject.id, player, cue.window.startMs) }
            }
        }
    }
    return ComposerLiveStage(
        videos = slots.filterIsInstance<ComposerLiveSlot>().associateBy { it.subject.id },
        sounds = slots.filterIsInstance<ComposerLiveSoundClock>().associateBy { it.id },
    )
}

/** La fenêtre de SCÈNE de chaque objet (entrée, sortie ; `null` : jusqu'à la fin) — le fond n'en a pas, il couvre tout. */
internal fun StoryComposerUiState.sceneWindows(): Map<String, Pair<Float, Float?>> =
    sceneTracks.associate { track ->
        track.id to when (val bar = track.bar) {
            is TrackBar.Timed -> bar.start.toFloat() to bar.end.toFloat()
            else -> 0f to null
        }
    }

private const val FULL_VOLUME = 1f
