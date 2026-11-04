package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StorySourceWindow
import me.meeshy.sdk.model.StorySourceWindowMs
import me.meeshy.sdk.model.composer.AudioEnvelope

/** Une piste sonore de la scène, résolue (URL jouable) : tout ce que le mixeur lit pour la planifier. */
public data class SceneAudioTrack(
    val id: String,
    val url: String,
    val isBackground: Boolean,
    val startTime: Double = 0.0,
    val duration: Double? = null,
    val volume: Float = 1f,
    val keyframes: List<StoryKeyframe>? = null,
    val fadeIn: Double = 0.0,
    val fadeOut: Double = 0.0,
    val loop: Boolean? = null,
    val window: StorySourceWindowMs? = null,
)

/** Ce que le mixeur doit faire d'UNE piste à un instant de la slide. */
public sealed interface SceneAudioTrackFrame {
    /** La piste n'a pas commencé : elle démarre dans [startsInMs]. */
    public data class Waiting(val startsInMs: Long) : SceneAudioTrackFrame

    /** La piste sonne : à [positionMs] dans sa passe — RELATIVE à la fenêtre de rognage, que le lecteur porte lui-même —, à [volume]. */
    public data class Sounding(val positionMs: Long, val volume: Float, val loops: Boolean) : SceneAudioTrackFrame

    /** La piste est finie (ou son créneau est épuisé) : plus rien à planifier. */
    public data object Ended : SceneAudioTrackFrame
}

/**
 * Le cerveau pur du mixeur multipistes (miroir de `ReaderAudioMixer`) : à partir d'une ANCRE commune — l'écoulé de la
 * slide, lu sur l'horloge du playhead — chaque piste sait si elle attend, où elle entre (en cours de piste, sans retour
 * à zéro) et à quel volume. Le volume est un produit LU sur le temps : automation de keyframes x enveloppe (fondus,
 * rejoués à chaque tour d'une boucle) x mute. Aucune minuterie ne le pose : pause et reprise ne replanifient rien.
 */
public object SceneAudioMixerPlan {

    /** Les pistes d'une slide : le fond d'abord, puis les clips de premier plan — l'ordre de pose de la scène. */
    public fun tracks(effects: me.meeshy.sdk.model.StoryEffects, urlOf: (StoryAudioPlayerObject) -> String?): List<SceneAudioTrack> =
        (listOfNotNull(AudioDuckingLaw.resolvedBackgroundAudio(effects)) + AudioDuckingLaw.resolvedForegroundAudio(effects))
            .mapNotNull { audio -> urlOf(audio)?.let { track(audio, it) } }

    public fun track(audio: StoryAudioPlayerObject, url: String): SceneAudioTrack = SceneAudioTrack(
        id = audio.id,
        url = url,
        isBackground = audio.isBackground == true || audio.id == LEGACY_BACKGROUND_ID,
        startTime = (audio.startTime ?: 0f).toDouble().coerceAtLeast(0.0),
        duration = audio.duration?.toDouble()?.takeIf { it.isFinite() && it > 0 },
        volume = StoryVolume.clamp(audio.volume),
        keyframes = audio.keyframes,
        fadeIn = (audio.fadeIn ?: 0f).toDouble(),
        fadeOut = (audio.fadeOut ?: 0f).toDouble(),
        loop = audio.loop,
        window = StorySourceWindow.clippingMs(audio.sourceStart, audio.sourceEnd),
    )

    /**
     * L'état d'une piste à [slideElapsed] secondes. [passLengthSeconds] : la longueur d'une passe quand le lecteur la
     * connaît (source mesurée) — `null` tant qu'elle est inconnue. [isEditPreview] : l'aperçu d'édition n'a pas de
     * durée, chaque clip y boucle. [muted] : mute global OU de la piste — le mute ramène à 0 sans arrêter le fil.
     */
    public fun frame(
        track: SceneAudioTrack,
        slideElapsed: Double,
        passLengthSeconds: Double?,
        isEditPreview: Boolean = false,
        muted: Boolean = false,
    ): SceneAudioTrackFrame {
        val elapsed = slideElapsed - track.startTime
        if (!slideElapsed.isFinite()) return SceneAudioTrackFrame.Ended
        if (elapsed < 0) return SceneAudioTrackFrame.Waiting(((-elapsed) * MS).toLong().coerceAtLeast(1L))

        val loops = SceneAudioLoopLaw.loops(track.loop, track.isBackground, isEditPreview)
        val pass = passLengthSeconds?.takeIf { it.isFinite() && it > 0 }
        val occupied = track.duration
        val end = when {
            isEditPreview && loops -> null
            loops -> occupied
            else -> listOfNotNull(occupied, pass).minOrNull()
        }
        if (end != null && elapsed >= end) return SceneAudioTrackFrame.Ended

        val inPass = if (loops) SceneAudioLoopLaw.elapsedInPass(elapsed, pass ?: 0.0) else elapsed
        val positionMs = (inPass * MS).toLong()
        val auto = VolumeAutomation.effectiveVolume(track.volume, track.keyframes, elapsed.toFloat())
        val gain = if (muted) 0f else auto * envelope(track, elapsed, loops, pass, isEditPreview)
        return SceneAudioTrackFrame.Sounding(positionMs, StoryVolume.clamp(gain), loops)
    }

    private fun envelope(track: SceneAudioTrack, elapsed: Double, loops: Boolean, pass: Double?, isEditPreview: Boolean): Float {
        if (track.fadeIn <= 0.0 && track.fadeOut <= 0.0) return 1f
        if (!loops) {
            val span = track.duration ?: pass ?: return 1f
            return AudioEnvelope.plan(elapsed, track.fadeIn, track.fadeOut, span, 1f).initialVolume
        }
        val declared = track.loop ?: track.isBackground
        val cycle = SceneAudioLoopLaw.envelopeCycle(declared && !isEditPreview, track.duration ?: 0.0, pass ?: 0.0)
        return SceneAudioLoopLaw.envelopeGain(elapsed, cycle, track.fadeIn, track.fadeOut)
    }

    private const val MS = 1000.0
    private const val LEGACY_BACKGROUND_ID = "legacy-bg-audio"
}
