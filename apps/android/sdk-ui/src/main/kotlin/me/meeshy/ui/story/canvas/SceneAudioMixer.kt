package me.meeshy.ui.story.canvas

import android.content.Context
import android.media.AudioManager
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalContext
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import kotlinx.coroutines.delay
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import me.meeshy.sdk.model.scene.AudioActivationPolicy
import me.meeshy.sdk.model.scene.SceneAudioLoopLaw
import me.meeshy.sdk.model.scene.SceneAudioMixerPlan
import me.meeshy.sdk.model.scene.SceneAudioTrack
import me.meeshy.sdk.model.scene.SceneAudioTrackFrame
import me.meeshy.sdk.model.scene.StoryVolume
import me.meeshy.sdk.playback.AndroidAudioFocusSystem
import me.meeshy.sdk.playback.AndroidNoisyRouteSource
import me.meeshy.ui.component.media.MeeshyMediaCache
import me.meeshy.ui.component.media.PlayerCensus

/** Ce que l'hôte sait de la lecture à chaque tick du mixeur. */
internal data class SceneAudioMixerInput(
    /** L'écoulé de la slide (secondes) : l'ancre COMMUNE de toutes les pistes, lue sur le playhead. */
    val elapsedSeconds: Double,
    val playing: Boolean,
    /** Mute global (ou verrouillé) : ramène toutes les pistes à 0. */
    val muted: Boolean = false,
    /** Mute par piste. */
    val mutedTrackIds: Set<String> = emptySet(),
    /** Gain d'enveloppe de l'hôte (la carte qu'on glisse pour fermer baisse le son). */
    val gain: Float = 1f,
    val isEditPreview: Boolean = false,
    /** Le tour d'une scène rejouée en boucle : un nouveau tour replanifie chaque piste à son entrée. */
    val lap: Int = 0,
)

/**
 * Le mixeur multipistes d'une scène (iOS `ReaderAudioMixer`) : N lecteurs préparés d'avance, planifiés sur une ancre
 * commune au playhead par [SceneAudioMixerPlan]. Chaque piste entre EN COURS de piste à sa position, boucle sans trou
 * (ExoPlayer reboucle sur la fenêtre), lit ses fondus sur le temps, et un mute ne l'arrête pas. Pause et reprise ne
 * replanifient rien : le lecteur garde sa position.
 *
 * [holdsFocus] : `false` quand une vidéo de la scène tient déjà le focus audio — une seconde demande la mettrait en pause.
 */
@OptIn(UnstableApi::class)
internal class SceneAudioMixer(
    private val context: Context,
    private val holdsFocus: Boolean,
    onFocusLost: () -> Unit,
    onFocusGained: () -> Unit,
    onFocusLostForGood: () -> Unit,
) {
    private class Slot(
        val key: String,
        var track: SceneAudioTrack,
        val player: ExoPlayer,
        val releaseLease: () -> Unit,
    ) {
        var scheduled = false
        var appliedVolume = -1f
    }

    private val slots = LinkedHashMap<String, Slot>()
    private var lastElapsed = 0.0
    private var lastLap = 0
    private var wasPlaying = false
    private val focus = SceneAudioFocus(
        system = AndroidAudioFocusSystem(context.getSystemService(Context.AUDIO_SERVICE) as AudioManager),
        noisy = AndroidNoisyRouteSource(context),
        onLost = onFocusLost,
        onGained = onFocusGained,
        onLostForGood = onFocusLostForGood,
    )

    /** Les pistes de la composition : un lecteur naît pour une piste nouvelle, un lecteur dont la piste a disparu est libéré. */
    public fun configure(tracks: List<SceneAudioTrack>) {
        val wanted = tracks.associateBy(::identity)
        slots.keys.filter { it !in wanted }.forEach { slots.remove(it)?.let(::dispose) }
        wanted.forEach { (key, track) ->
            val existing = slots[key]
            if (existing != null) existing.track = track else slots[key] = open(key, track)
        }
    }

    /** Un tick : pose chaque piste selon l'ancre. Appelé à ~60 Hz, doit rester une poignée de comparaisons. */
    public fun tick(input: SceneAudioMixerInput) {
        val jumped = input.elapsedSeconds - lastElapsed
        if (jumped < -REWIND_SECONDS || jumped > SCRUB_SECONDS || input.lap != lastLap) slots.values.forEach { it.scheduled = false }
        lastElapsed = input.elapsedSeconds
        lastLap = input.lap

        val frames = slots.values.associateWith { slot ->
            SceneAudioMixerPlan.frame(
                track = slot.track,
                slideElapsed = input.elapsedSeconds,
                passLengthSeconds = passLength(slot),
                isEditPreview = input.isEditPreview,
                muted = input.muted || slot.track.id in input.mutedTrackIds,
            )
        }
        val audible = input.playing && !input.muted && frames.values.any { it is SceneAudioTrackFrame.Sounding }
        if (holdsFocus) {
            if (input.playing && !wasPlaying) focus.userResumed()
            // Une pause causée par une perte de focus garde le focus : c'est lui qui annonce son retour.
            if (audible && !focus.isHeld) focus.request() else if (!input.playing && !focus.isHeld) focus.release()
        }
        wasPlaying = input.playing
        val transport = input.playing && !(holdsFocus && focus.isHeld)
        val duck = if (holdsFocus && focus.isDucked) StoryVolume.DUCKING_FACTOR else 1f

        frames.forEach { (slot, frame) ->
            when (frame) {
                is SceneAudioTrackFrame.Sounding -> sound(slot, frame, transport, input.gain * duck)
                is SceneAudioTrackFrame.Waiting, SceneAudioTrackFrame.Ended -> {
                    slot.scheduled = false
                    slot.player.playWhenReady = false
                }
            }
        }
    }

    private fun sound(slot: Slot, frame: SceneAudioTrackFrame.Sounding, transport: Boolean, gain: Float) {
        val player = slot.player
        val repeat = if (frame.loops) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
        if (player.repeatMode != repeat) player.repeatMode = repeat
        if (!slot.scheduled) {
            slot.scheduled = true
            player.seekTo(frame.positionMs)
        }
        // ExoPlayer n'amplifie pas : le plafond de 2,0 du schéma reste une borne de modèle, l'oreille s'arrête à 1.
        val volume = (frame.volume * gain).coerceIn(0f, 1f)
        if (volume != slot.appliedVolume) {
            slot.appliedVolume = volume
            player.volume = volume
        }
        if (player.playWhenReady != transport) player.playWhenReady = transport
    }

    private fun passLength(slot: Slot): Double? {
        val windowed = slot.track.window?.let { SceneAudioLoopLaw.passLength(null, it.startMs, it.endMs) }
        val measured = slot.player.duration.takeIf { it != C.TIME_UNSET && it > 0 }?.let { it / 1000.0 }
        return windowed ?: measured
    }

    public fun release() {
        focus.release()
        slots.values.forEach(::dispose)
        slots.clear()
    }

    private fun dispose(slot: Slot) {
        slot.releaseLease()
        slot.player.release()
    }

    private fun open(key: String, track: SceneAudioTrack): Slot {
        PlayerCensus.record()
        val cache = MeeshyMediaCache.get(context)
        val player = ExoPlayer.Builder(context)
            .setMediaSourceFactory(cache.mediaSourceFactory(MediaCacheCategory.AUDIO, track.url))
            .build()
            .apply {
                // La fenêtre est portée par le MediaItem : la position 0 EST son début et la boucle reboucle dessus sans trou.
                setMediaItem(
                    MediaItem.Builder().setUri(track.url).apply {
                        track.window?.let { window ->
                            setClippingConfiguration(
                                MediaItem.ClippingConfiguration.Builder().setStartPositionMs(window.startMs)
                                    .apply { window.endMs?.let { setEndPositionMs(it) } }
                                    .build(),
                            )
                        }
                    }.build(),
                )
                repeatMode = Player.REPEAT_MODE_OFF
                playWhenReady = false
                volume = 0f
                prepare()
            }
        return Slot(key, track, player, cache.lease(track.url))
    }

    private fun identity(track: SceneAudioTrack): String = "${track.id}|${track.url}|${track.window?.startMs}|${track.window?.endMs}|${track.loop}"

    private companion object {
        const val REWIND_SECONDS = 0.25
        const val SCRUB_SECONDS = 1.0
        const val TICK_MS = 16L
        const val IDLE_MS = 100L
    }

    fun tickDelayMs(playing: Boolean): Long = if (playing) TICK_MS else IDLE_MS
}

/**
 * Monte le mixeur d'une scène. [tracks] ne relance rien tant que ses identités (id, URL, fenêtre, boucle) ne changent pas :
 * modifier un volume ou déplacer un objet pendant la composition ne coupe pas la musique. [editOwnerKey] non nul : la
 * scène est une COMPOSITION, dont le dernier canevas monté possède le son et le rend au précédent à sa fermeture, à la
 * phase partagée ([SceneEditAudioOwners]).
 */
@OptIn(UnstableApi::class)
@Composable
public fun SceneAudioMixerHost(
    tracks: List<SceneAudioTrack>,
    slideId: String,
    elapsedSeconds: () -> Double,
    playing: Boolean,
    muted: Boolean,
    mutedTrackIds: Set<String> = emptySet(),
    muteIsLocked: Boolean = false,
    gain: () -> Float = { 1f },
    holdsAudioFocus: Boolean = true,
    editOwnerKey: Any? = null,
    lap: Int = 0,
    onAudioFocusLost: () -> Unit = {},
    onAudioFocusGained: () -> Unit = {},
    onAudioFocusLostForGood: () -> Unit = {},
) {
    val context = LocalContext.current
    val lost by rememberUpdatedState(onAudioFocusLost)
    val gained by rememberUpdatedState(onAudioFocusGained)
    val lostForGood by rememberUpdatedState(onAudioFocusLostForGood)
    val mixer = remember(context, holdsAudioFocus) {
        SceneAudioMixer(context, holdsAudioFocus, { lost() }, { gained() }, { lostForGood() })
    }
    // Un mute verrouillé ne prépare rien : aucun lecteur, aucun focus.
    val prepared = if (AudioActivationPolicy.shouldPrepare(muted, muteIsLocked)) tracks else emptyList()
    DisposableEffect(mixer) { onDispose { mixer.release() } }
    DisposableEffect(editOwnerKey) {
        editOwnerKey?.let(SceneEditAudioOwners::claim)
        onDispose { editOwnerKey?.let(SceneEditAudioOwners::release) }
    }
    val ownerRevision = SceneEditAudioOwners.revision
    val mayPlay = editOwnerKey == null || (ownerRevision >= 0 && SceneEditAudioOwners.mayPlay(editOwnerKey))
    val latestElapsed by rememberUpdatedState(elapsedSeconds)
    val latestGain by rememberUpdatedState(gain)
    val latestPlaying by rememberUpdatedState(playing && mayPlay)
    val latestMuted by rememberUpdatedState(muted)
    val latestMutedIds by rememberUpdatedState(mutedTrackIds)
    LaunchedEffect(mixer, prepared) { mixer.configure(prepared) }
    val latestLap by rememberUpdatedState(lap)
    LaunchedEffect(mixer, slideId, editOwnerKey, prepared.isEmpty()) {
        if (prepared.isEmpty()) return@LaunchedEffect
        while (true) {
            val own = latestElapsed()
            val elapsed = if (editOwnerKey == null) own else SceneEditAudioOwners.elapsed(slideId, System.currentTimeMillis(), own)
            mixer.tick(SceneAudioMixerInput(elapsed, latestPlaying, latestMuted, latestMutedIds, latestGain(), editOwnerKey != null, latestLap))
            delay(mixer.tickDelayMs(latestPlaying))
        }
    }
}
