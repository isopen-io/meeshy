package me.meeshy.sdk.model.composer.timeline

import me.meeshy.sdk.model.StoryEffects
import me.meeshy.sdk.model.StoryKeyframe
import me.meeshy.sdk.model.StoryLocationObject
import me.meeshy.sdk.model.StoryMediaObject

/** Plan d'un objet à l'écran : les trois plans du contrat v3 (`Plane`). */
enum class TrackPlane { FG, CONTENT, BG }

/**
 * Ce qu'une piste occupe horizontalement. [Ghost] n'est pas « une durée inconnue » : c'est
 * « aucun timing posé », donc la piste suit la slide.
 */
sealed interface TrackBar {
    data class Timed(val start: Double, val end: Double) : TrackBar
    data object Ghost : TrackBar
}

/** Un losange AFFICHÉ ; [time] est ABSOLU (axe de la slide), pas relatif à son clip. */
data class Plan2DKeyframe(val id: String, val time: Double)

/**
 * Une rangée du plan 2D. L'ordre du tableau EST l'ordre à l'écran. [isLocked] : fond ou clip
 * synthétique — ni poignées ni déplacement temporel.
 */
data class Plan2DTrack(
    val id: String,
    val label: String,
    val plane: TrackPlane,
    val z: Int,
    val bar: TrackBar,
    val keyframes: List<Plan2DKeyframe> = emptyList(),
    val isLocked: Boolean = false,
) {
    val keyframeTimes: List<Double> get() = keyframes.map { it.time }
}

/** Les deux échelles du plan : `FIT` fait tenir la slide, `DETAIL` double l'échelle. */
enum class Plan2DZoom(val scale: Float) {
    FIT(1f),
    DETAIL(2f),
}

/**
 * Moteur PUR du plan 2D (miroir de `Plan2DLayout.swift`) : lit les effets de la slide et rend des
 * rangées ordonnées. Aucune vue, aucun état.
 */
object Plan2DLayout {

    /** Du plus proche du spectateur au fond. */
    val PLANE_ORDER: List<TrackPlane> = listOf(TrackPlane.FG, TrackPlane.CONTENT, TrackPlane.BG)

    const val BACKGROUND_TRACK_ID = "plan2d.background"
    const val BACKGROUND_SOUND_TRACK_ID = "plan2d.background-sound"
    const val DRAWING_TRACK_ID = "plan2d.drawing"

    /** Préfixe des clips synthétiques (fond image posé par le composer) : verrouillés. */
    const val SYNTHETIC_CLIP_ID_PREFIX = "_synthetic_bg_image_"

    fun isSyntheticClipId(id: String): Boolean = id.startsWith(SYNTHETIC_CLIP_ID_PREFIX)

    private object Glyph {
        const val TEXT = "Aa"
        const val PLACE = "◎"
        const val DRAWING = "✎"
        const val AUDIO = "♫"
        const val VIDEO = "▶"
        const val IMAGE = "▣"
        const val BACKGROUND = "▦"
    }

    /**
     * Pistes ordonnées pour l'écran : premier plan d'abord, puis contenu, puis fond ; dans un plan,
     * z décroissant. [places] : pastilles de lieu (non portées par `StoryEffects` côté Android).
     */
    fun tracks(
        effects: StoryEffects,
        slideDuration: Double,
        places: List<StoryLocationObject> = emptyList(),
    ): List<Plan2DTrack> {
        val unordered = textTracks(effects, slideDuration) +
            stickerTracks(effects, slideDuration) +
            placeTracks(places, slideDuration) +
            drawingTracks(effects) +
            mediaTracks(effects, slideDuration) +
            audioTracks(effects, slideDuration) +
            backgroundTracks(effects)
        return PLANE_ORDER.flatMap { plane -> stacked(unordered.filter { it.plane == plane }) }
    }

    /** x en points pour un temps donné ; une slide sans durée reste à l'origine (pas de NaN). */
    fun x(time: Double, zoom: Plan2DZoom, laneWidth: Float, slideDuration: Double): Float {
        if (slideDuration <= 0.0 || !time.isFinite() || !laneWidth.isFinite()) return 0f
        return laneWidth * zoom.scale * (time / slideDuration).toFloat()
    }

    private fun textTracks(effects: StoryEffects, slideDuration: Double): List<Plan2DTrack> =
        effects.textObjects.map { text ->
            val bar = bar(text.startTime, text.duration, slideDuration)
            Plan2DTrack(
                id = text.id,
                label = "${Glyph.TEXT} \"${text.text}\"",
                plane = TrackPlane.FG,
                z = text.zIndex,
                bar = bar,
                keyframes = markers(text.keyframes, text.startTime, bar),
            )
        }

    private fun stickerTracks(effects: StoryEffects, slideDuration: Double): List<Plan2DTrack> =
        effects.stickerObjects.orEmpty().map { sticker ->
            Plan2DTrack(
                id = sticker.id,
                label = sticker.emoji,
                plane = TrackPlane.FG,
                z = sticker.zIndex,
                bar = bar(sticker.startTime, sticker.duration, slideDuration),
            )
        }

    /** Une pastille sans fenêtre posée est un fantôme, comme un texte ou un sticker. */
    private fun placeTracks(places: List<StoryLocationObject>, slideDuration: Double): List<Plan2DTrack> =
        places.map { place ->
            Plan2DTrack(
                id = place.id,
                label = label(Glyph.PLACE, place.place.name),
                plane = TrackPlane.FG,
                z = place.zIndex,
                bar = bar(place.startTime, place.duration, slideDuration),
            )
        }

    /** Le dessin est UNE couche : l'auteur le pense comme un calque unique. */
    private fun drawingTracks(effects: StoryEffects): List<Plan2DTrack> {
        if (effects.drawingStrokes.isNullOrEmpty()) return emptyList()
        return listOf(Plan2DTrack(DRAWING_TRACK_ID, Glyph.DRAWING, TrackPlane.FG, 0, TrackBar.Ghost))
    }

    private fun mediaTracks(effects: StoryEffects, slideDuration: Double): List<Plan2DTrack> =
        effects.mediaObjects.orEmpty().map { media ->
            val bar = bar(media.startTime, media.duration, slideDuration)
            Plan2DTrack(
                id = media.id,
                label = label(if (media.mediaType == "video") Glyph.VIDEO else Glyph.IMAGE, media.name),
                plane = if (media.isBackground) TrackPlane.BG else TrackPlane.CONTENT,
                z = media.zIndex,
                bar = bar,
                keyframes = markers(media.keyframes, media.startTime, bar),
                isLocked = isLockedMedia(media),
            )
        }

    private fun isLockedMedia(media: StoryMediaObject): Boolean = isSyntheticClipId(media.id) || media.isBackground

    /** Loi des deux plans audio : la pastille est du plan contenu, le fond sonore descend au fond. */
    private fun audioTracks(effects: StoryEffects, slideDuration: Double): List<Plan2DTrack> =
        effects.audioPlayerObjects.orEmpty().map { audio ->
            val start = audio.startTime?.toDouble()
            val bar = bar(start, audio.duration?.toDouble(), slideDuration)
            Plan2DTrack(
                id = audio.id,
                label = label(Glyph.AUDIO, audio.name),
                plane = if (audio.isBackground == true) TrackPlane.BG else TrackPlane.CONTENT,
                z = audio.zIndex ?: 0,
                bar = bar,
                keyframes = markers(audio.keyframes, start, bar),
            )
        }

    private fun backgroundTracks(effects: StoryEffects): List<Plan2DTrack> {
        val hasBackgroundMedia = effects.mediaObjects.orEmpty().any { it.isBackground }
        val visual = if (effects.background != null && !hasBackgroundMedia) {
            listOf(Plan2DTrack(BACKGROUND_TRACK_ID, Glyph.BACKGROUND, TrackPlane.BG, 0, TrackBar.Ghost))
        } else {
            emptyList()
        }
        val hasBackgroundObject = effects.audioPlayerObjects.orEmpty().any { it.isBackground == true }
        val sound = if (effects.backgroundAudioId != null && !hasBackgroundObject) {
            listOf(Plan2DTrack(BACKGROUND_SOUND_TRACK_ID, Glyph.AUDIO, TrackPlane.BG, 0, TrackBar.Ghost))
        } else {
            emptyList()
        }
        return visual + sound
    }

    /** Aucun champ de timing ⇒ fantôme. Un début sans durée court jusqu'au bout de la slide. */
    private fun bar(start: Double?, duration: Double?, slideDuration: Double): TrackBar {
        if (start == null && duration == null) return TrackBar.Ghost
        val begin = maxOf(0.0, start ?: 0.0)
        val end = duration?.let { begin + maxOf(0.0, it) } ?: maxOf(begin, slideDuration)
        return TrackBar.Timed(begin, end)
    }

    /**
     * Losanges d'un clip, triés par temps. `StoryKeyframe.time` est relatif au clip, l'axe du plan est
     * absolu : le début du clip s'ajoute ICI, puis le temps est écrêté à la barre rendue (le losange
     * se replie au bord au lieu de disparaître ; le temps STOCKÉ ne bouge jamais).
     */
    private fun markers(keyframes: List<StoryKeyframe>?, clipStart: Double?, window: TrackBar): List<Plan2DKeyframe> {
        val origin = maxOf(0.0, clipStart ?: 0.0)
        val range = (window as? TrackBar.Timed)?.let { minOf(it.start, it.end)..maxOf(it.start, it.end) }
        return keyframes.orEmpty()
            .map { kf ->
                val absolute = origin + kf.time.toDouble()
                Plan2DKeyframe(kf.id, range?.let { absolute.coerceIn(it) } ?: absolute)
            }
            .sortedBy { it.time }
    }

    /** Tri STABLE par z décroissant : à z égal, l'ordre d'insertion tranche. */
    private fun stacked(tracks: List<Plan2DTrack>): List<Plan2DTrack> =
        tracks.withIndex().sortedWith(compareBy({ -it.value.z }, { it.index })).map { it.value }

    private fun label(glyph: String, name: String?): String = if (name.isNullOrEmpty()) glyph else "$glyph $name"
}

/**
 * Traduit un dépôt (`toIndex` = position dans `tracks`, TOUS PLANS CONFONDUS) en un nouveau z ET le
 * plan que la piste rejoint. Pur : l'appelant décide quelle mutation appeler par famille.
 */
object Plan2DReorderResolver {

    data class Outcome(val newZ: Int, val newPlane: TrackPlane)

    /** `null` : id introuvable, aucune autre piste, ou dépôt SANS EFFET — aucune mutation ne doit partir. */
    fun resolve(tracks: List<Plan2DTrack>, droppedTrackId: String, toIndex: Int): Outcome? {
        val from = tracks.indexOfFirst { it.id == droppedTrackId }
        if (from < 0 || tracks.size <= 1) return null
        val target = toIndex.coerceIn(0, tracks.size - 1)
        if (target == from) return null
        val neighbor = tracks[target]
        // Descendue : juste SOUS le voisin rejoint ; montée : juste AU-DESSUS (z décroissant = position croissante).
        val newZ = if (target > from) neighbor.z - 1 else neighbor.z + 1
        return Outcome(newZ, neighbor.plane)
    }
}
