package me.meeshy.sdk.model.scene.export

import kotlin.math.ceil
import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StorySlideDuration
import me.meeshy.sdk.model.scene.AudioDuckingLaw
import me.meeshy.sdk.model.scene.StoryMediaFadeResolver

/** Ce qu'un son de la slide EST, du point de vue de l'export : fond (piste ou vidéo) ou premier plan (vocal ou vidéo). */
public enum class StoryExportSoundRole { BACKGROUND_TRACK, BACKGROUND_VIDEO, FOREGROUND_AUDIO, FOREGROUND_VIDEO }

/**
 * Une slide à exporter : ses effets, l'adresse résolue de chaque objet sonore (identifiant d'objet → adresse, voir
 * [StoryExportTimeline.soundObjects]) et, pour une story héritée qui ne nomme aucune piste, l'adresse de sa piste de fond.
 */
public data class StoryExportSlideSource(
    val effects: StoryEffects?,
    val soundSources: Map<String, String> = emptyMap(),
    val legacyBackgroundTrack: String? = null,
    val legacyBackgroundVideo: String? = null,
)

/** Un objet de la slide qui fait du son, tel que l'appelant doit en résoudre l'adresse. */
public data class StoryExportSoundObject(val id: String, val role: StoryExportSoundRole, val postMediaId: String, val mediaUrl: String?)

/** Un point de la courbe de volume d'un son, en millisecondes de la timeline commune. */
public data class StoryExportVolumePoint(val atMillis: Long, val gain: Float)

/**
 * Un son placé sur la timeline commune de l'export : il joue de [startMillis] à [endMillis], lit son fichier depuis
 * [trimStartMillis] (jusqu'à [trimEndMillis], sinon la fin du fichier), boucle ou non, à [gain] — ou en suivant
 * [envelope] quand l'auteur a posé une courbe ou des fondus.
 */
public data class StoryExportSound(
    val src: String,
    val role: StoryExportSoundRole,
    val objectId: String,
    val startMillis: Long,
    val endMillis: Long,
    val trimStartMillis: Long,
    val trimEndMillis: Long?,
    val loop: Boolean,
    val gain: Float,
    val envelope: List<StoryExportVolumePoint> = emptyList(),
)

public data class StoryExportSlide(val index: Int, val startMillis: Long, val durationMillis: Long) {
    val endMillis: Long get() = startMillis + durationMillis
}

/** Le plan d'un export : les slides bout à bout, chacune à sa durée, et les sons à leur place. [still] : peut sortir en image. */
public data class StoryExportTimelinePlan(val slides: List<StoryExportSlide>, val sounds: List<StoryExportSound>, val still: Boolean) {
    val totalMillis: Long get() = slides.lastOrNull()?.endMillis ?: 0L

    /** Le plan rendu sur ses [lengthMillis] premières millisecondes (« Imager » 1/4…4/4) : la suite tombe, les sons sont taillés. */
    public fun cut(lengthMillis: Long): StoryExportTimelinePlan {
        if (lengthMillis >= totalMillis) return this
        val length = lengthMillis.coerceAtLeast(0L)
        return copy(
            slides = slides.filter { it.startMillis < length }.map { it.copy(durationMillis = minOf(it.durationMillis, length - it.startMillis)) },
            sounds = sounds.filter { it.startMillis < length }.map { sound ->
                val end = minOf(sound.endMillis, length)
                sound.copy(endMillis = end, envelope = StoryExportVolumeCurve.clipped(sound.envelope, end))
            },
        )
    }
}

/**
 * **LE PLAN D'UN EXPORT DE SCÈNE** (#13872 ; miroir de `planSceneExport`, web #13873, et de `StoryVideoExportService` iOS) — ce
 * qu'« Enregistrer », « Partager » et « Imager » rendent d'une story ou d'une publication à scène : chaque slide à sa durée,
 * l'une après l'autre, et chaque son à sa place sur la timeline commune (piste de fond, vidéo de fond, vocaux et vidéos
 * posés), avec son gain, sa coupe et sa courbe. Les muets de l'auteur sont respectés ; la piste d'une vidéo passe sous un son
 * de fond comme le lecteur l'atténue ([AudioDuckingLaw]).
 *
 * La durée d'une slide : la durée épinglée de l'auteur fait autorité ; sinon la loi du lecteur ([StorySlideDuration]), la fin
 * du dernier objet temporisé, et la fin NATURELLE de chaque son — un vocal de 4 min fait une slide de 4 min. Loi pure : les
 * durées des fichiers sont REÇUES ([plan] `mediaDurationsSeconds`, par adresse).
 */
public object StoryExportTimeline {

    /** Les objets sonores que le plan écoute, dans l'ordre où il les place : l'appelant résout leur adresse. */
    public fun soundObjects(effects: StoryEffects): List<StoryExportSoundObject> {
        val videos = effects.mediaObjects.orEmpty().filter { it.mediaType.equals(VIDEO, ignoreCase = true) }
        val track = AudioDuckingLaw.resolvedBackgroundAudio(effects)
            ?.let { StoryExportSoundObject(it.id, StoryExportSoundRole.BACKGROUND_TRACK, it.postMediaId, it.mediaURL) }
        val video = videos.firstOrNull { it.isBackground }
            ?.let { StoryExportSoundObject(it.id, StoryExportSoundRole.BACKGROUND_VIDEO, it.postMediaId, it.mediaURL) }
        val voices = AudioDuckingLaw.resolvedForegroundAudio(effects)
            .map { StoryExportSoundObject(it.id, StoryExportSoundRole.FOREGROUND_AUDIO, it.postMediaId, it.mediaURL) }
        val clips = videos.filterNot { it.isBackground }
            .map { StoryExportSoundObject(it.id, StoryExportSoundRole.FOREGROUND_VIDEO, it.postMediaId, it.mediaURL) }
        return listOfNotNull(track, video) + voices + clips
    }

    public fun plan(slides: List<StoryExportSlideSource>, mediaDurationsSeconds: Map<String, Double> = emptyMap()): StoryExportTimelinePlan {
        var cursor = 0L
        val placedSlides = mutableListOf<StoryExportSlide>()
        val placedSounds = mutableListOf<StoryExportSound>()
        slides.forEachIndexed { index, source ->
            val sounds = sceneSounds(source)
            val slide = StoryExportSlide(index, cursor, slideDurationMillis(source.effects, sounds, mediaDurationsSeconds))
            placedSlides += slide
            placedSounds += sounds.mapNotNull { placed(it, slide) }
            cursor = slide.endMillis
        }
        val still = slides.size == 1 && placedSounds.isEmpty() && slides.none { StoryExportMotion.moves(it.effects) }
        return StoryExportTimelinePlan(placedSlides, placedSounds, still)
    }

    private class SceneSound(
        val src: String,
        val role: StoryExportSoundRole,
        val objectId: String,
        val windowStart: Double,
        val windowEnd: Double?,
        val trimStart: Double,
        val trimEnd: Double?,
        val loop: Boolean,
        val gain: Float,
        val level: ((Double) -> Float)?,
    )

    /** Les sons d'une slide ; une story héritée qui ne nomme ni piste ni vidéo de fond joue celles que le lecteur résout. */
    private fun sceneSounds(source: StoryExportSlideSource): List<SceneSound> {
        val objects = source.effects?.let(::soundObjects).orEmpty()
        val named = source.effects?.let { effects -> objects.mapNotNull { sound(effects, it, source.soundSources[it.id]) } }.orEmpty()
        val legacy = listOf(
            StoryExportSoundRole.BACKGROUND_TRACK to source.legacyBackgroundTrack,
            StoryExportSoundRole.BACKGROUND_VIDEO to source.legacyBackgroundVideo,
        ).mapNotNull { (role, src) -> legacy(role, src).takeIf { objects.none { it.role == role } } }
        return legacy + named
    }

    private fun legacy(role: StoryExportSoundRole, src: String?): SceneSound? = src?.takeIf { it.isNotBlank() }?.let {
        SceneSound(it, role, LEGACY_ID, 0.0, null, 0.0, null, loop = true, gain = 1f, level = null)
    }

    private class Timing(
        val start: Double,
        val duration: Double?,
        val trimStart: Double?,
        val trimEnd: Double?,
        val loop: Boolean,
        val fadeIn: Double?,
        val fadeOut: Double?,
        val baseVolume: Float,
        val keyframes: List<StoryKeyframe>,
    )

    private fun timing(effects: StoryEffects, sound: StoryExportSoundObject): Timing? {
        if (sound.role == StoryExportSoundRole.BACKGROUND_VIDEO || sound.role == StoryExportSoundRole.FOREGROUND_VIDEO) {
            val media = effects.mediaObjects.orEmpty().firstOrNull { it.id == sound.id } ?: return null
            val background = sound.role == StoryExportSoundRole.BACKGROUND_VIDEO
            return Timing(
                start = if (background) 0.0 else media.startTime ?: 0.0,
                duration = if (background) null else media.duration,
                trimStart = media.sourceStart,
                trimEnd = media.sourceEnd,
                loop = media.loop,
                fadeIn = media.fadeIn,
                fadeOut = media.fadeOut,
                baseVolume = media.volume,
                keyframes = media.keyframes.orEmpty(),
            )
        }
        val audio = if (sound.role == StoryExportSoundRole.BACKGROUND_TRACK) AudioDuckingLaw.resolvedBackgroundAudio(effects)
        else effects.audioPlayerObjects.orEmpty().firstOrNull { it.id == sound.id }
        audio ?: return null
        return Timing(
            start = (audio.startTime ?: 0f).toDouble(),
            duration = audio.duration?.toDouble(),
            trimStart = audio.sourceStart?.toDouble(),
            trimEnd = audio.sourceEnd?.toDouble(),
            loop = audio.loop ?: (sound.role == StoryExportSoundRole.BACKGROUND_TRACK),
            fadeIn = audio.fadeIn?.toDouble(),
            fadeOut = audio.fadeOut?.toDouble(),
            baseVolume = audio.volume,
            keyframes = audio.keyframes.orEmpty(),
        )
    }

    private fun sound(effects: StoryEffects, sound: StoryExportSoundObject, src: String?): SceneSound? {
        val address = src?.takeIf { it.isNotBlank() } ?: return null
        val timing = timing(effects, sound) ?: return null
        val automated = timing.keyframes.any { it.volume != null }
        if (!StoryExportSourceWindowRule.carriesSound(timing.baseVolume <= 0f, timing.keyframes.map { it.volume?.toDouble() })) return null
        val start = timing.start.finiteOr(0.0).coerceAtLeast(0.0)
        val duration = timing.duration?.takeIf { it.isFinite() && it > 0.0 }
        val volume = { t: Double -> volumeAt(effects, sound, t) }
        val faded = (timing.fadeIn ?: 0.0) > 0.0 || (timing.fadeOut ?: 0.0) > 0.0
        val level = if (!automated && !faded) null else { t: Double ->
            val fade = StoryMediaFadeResolver.fadeOpacity(timing.fadeIn, timing.fadeOut, start, duration, t) ?: 1.0
            (volume(t) * fade.toFloat()).coerceAtLeast(0f)
        }
        return SceneSound(
            src = address,
            role = sound.role,
            objectId = sound.id,
            windowStart = start,
            windowEnd = duration?.let { start + it },
            trimStart = timing.trimStart?.finiteOr(0.0)?.coerceAtLeast(0.0) ?: 0.0,
            trimEnd = timing.trimEnd?.takeIf { it.isFinite() && it > 0.0 },
            loop = timing.loop,
            gain = volume(start),
            level = level,
        )
    }

    private fun volumeAt(effects: StoryEffects, sound: StoryExportSoundObject, t: Double): Float {
        val videos = effects.mediaObjects.orEmpty().filter { it.mediaType.equals(VIDEO, ignoreCase = true) }.associate { it.id to true }
        val resolved = AudioDuckingLaw.resolve(effects, t.toFloat(), videos)
        return when (sound.role) {
            StoryExportSoundRole.BACKGROUND_TRACK -> resolved.backgroundAudioVolume
            StoryExportSoundRole.FOREGROUND_AUDIO -> resolved.foregroundAudioVolumes[sound.id]
            StoryExportSoundRole.BACKGROUND_VIDEO, StoryExportSoundRole.FOREGROUND_VIDEO -> resolved.videoVolumes[sound.id]
        } ?: 0f
    }

    private fun slideDurationMillis(effects: StoryEffects?, sounds: List<SceneSound>, durations: Map<String, Double>): Long {
        val reader = StorySlideDuration.computeSeconds(effects)
        val pinned = effects?.timelineDuration?.let { it > 0.0 } == true
        if (pinned) return millis(reader)
        val ends = listOf(reader, StoryExportMotion.timedEnd(effects)) + sounds.map { naturalEnd(it, durations) }
        return millis(ends.filter { it.isFinite() }.max().coerceAtMost(StorySlideDuration.MAX_CONTENT_SECONDS))
    }

    /** Le temps de scène où un son se tait de lui-même — l'infini s'il tient jusqu'à la fin de la slide. */
    private fun naturalEnd(sound: SceneSound, durations: Map<String, Double>): Double {
        val windowEnd = sound.windowEnd ?: Double.POSITIVE_INFINITY
        if (sound.loop) return windowEnd
        val duration = durations[sound.src]?.takeIf { it.isFinite() && it > 0.0 } ?: return windowEnd
        val played = (minOf(sound.trimEnd ?: duration, duration) - sound.trimStart).coerceAtLeast(0.0)
        return minOf(windowEnd, sound.windowStart + played)
    }

    private fun placed(sound: SceneSound, slide: StoryExportSlide): StoryExportSound? {
        val from = millis(sound.windowStart)
        if (from >= slide.durationMillis) return null
        val to = minOf(sound.windowEnd?.let(::millis) ?: slide.durationMillis, slide.durationMillis)
        return StoryExportSound(
            src = sound.src,
            role = sound.role,
            objectId = sound.objectId,
            startMillis = slide.startMillis + from,
            endMillis = slide.startMillis + to,
            trimStartMillis = millis(sound.trimStart),
            trimEndMillis = sound.trimEnd?.let(::millis),
            loop = sound.loop,
            gain = sound.gain,
            envelope = sound.level?.let { envelope(it, slide.startMillis, from, to) }.orEmpty(),
        )
    }

    /** La courbe échantillonnée sur la fenêtre jouée ; le dernier point juste avant la fin, où le fondu se lit encore. */
    private fun envelope(level: (Double) -> Float, slideStart: Long, from: Long, to: Long): List<StoryExportVolumePoint> {
        val span = (to - from).coerceAtLeast(0L)
        val step = maxOf(ENVELOPE_STEP_MILLIS.toDouble(), span / ENVELOPE_MAX_POINTS.toDouble())
        val count = maxOf(1, ceil(span / step).toInt())
        return (0..count).map { index ->
            val at = minOf(from + Math.round(index * step), to)
            val sampled = maxOf(from, minOf(at, to - 1))
            StoryExportVolumePoint(slideStart + at, level(sampled / MILLIS))
        }
    }

    private fun millis(value: Double): Long = Math.round(value * MILLIS)

    private fun Double.finiteOr(fallback: Double): Double = if (isFinite()) this else fallback

    private const val VIDEO = "video"
    private const val LEGACY_ID = "legacy"
    private const val MILLIS = 1000.0
    private const val ENVELOPE_STEP_MILLIS = 50L
    private const val ENVELOPE_MAX_POINTS = 600
}
