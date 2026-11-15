package me.meeshy.sdk.model.scene

import me.meeshy.sdk.model.StoryAudioPlayerObject
import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryMediaObject
import me.meeshy.sdk.model.StorySticker
import me.meeshy.sdk.model.StoryTextObject

/** Une position normalisée `[0, 1]` sur le cadre : abscisse sur la largeur, ordonnée sur la hauteur. */
data class NormalizedPosition(val x: Double, val y: Double)

/**
 * Avertissement levé quand une position reprojetée sortait de `[0, 1]` dans
 * l'espace cible et a dû être ramenée dans le cadre — port de
 * `CanvasReprojector.ReprojectionWarning` (iOS). Le composer les compte pour
 * afficher la bannière discrète « N élément(s) repositionné(s) pour le nouveau
 * format ». Les coordonnées d'origine sont normalisées sur le cadre SOURCE.
 */
sealed interface ReprojectionWarning {
    data class Clamped(val originalX: Double, val originalY: Double) : ReprojectionWarning
}

/** Un objet reprojeté, avec son avertissement éventuel. */
data class ReprojectedItem<T>(val value: T, val warning: ReprojectionWarning?)

/**
 * Les objets portés par un repost, dans les familles que le reprojecteur sait
 * déplacer : texte, médias, stickers, puces audio (sans position, laissées
 * telles quelles) et traits de dessin. La famille des lieux rejoint cette
 * liste avec son modèle de fil (voir [CanvasReprojector.reprojectPosition]).
 */
data class CanvasObjects(
    val textObjects: List<StoryTextObject> = emptyList(),
    val mediaObjects: List<StoryMediaObject> = emptyList(),
    val stickers: List<StorySticker> = emptyList(),
    val audioPlayerObjects: List<StoryAudioPlayerObject> = emptyList(),
    val drawingStrokes: List<StoryDrawingStroke> = emptyList(),
)

/**
 * Le résultat complet d'une reprojection : les objets reprojetés et chaque
 * avertissement. [repositionedCount] alimente la bannière « N éléments
 * repositionnés » (iOS `reprojectionWarnings.count`), [hasClampedItems] dit si
 * la bannière s'affiche (iOS `hasClampedItems`).
 */
data class RepostReprojection(
    val objects: CanvasObjects,
    val warnings: List<ReprojectionWarning>,
) {
    val hasClampedItems: Boolean get() = warnings.isNotEmpty()
    val repositionedCount: Int get() = warnings.size
}

/**
 * Reprojette les positions d'un cadre vers un autre (portrait 9:16 ↔ paysage
 * 16:9, ou toute paire de tailles) — port de `CanvasReprojector` (iOS,
 * `MeeshyUI/Story/Canvas`), rapatrié dans `:core:model` avec la conversion de
 * format.
 *
 * Les positions sont normalisées `[0, 1]` des deux côtés. Le centre
 * `(0.5, 0.5)` est toujours préservé ; la distance au centre en pixels de
 * design l'est aussi (les deux cadres ont la même largeur design), si bien
 * qu'un objet qui sortirait du cadre cible est ramené dedans et signalé par un
 * [ReprojectionWarning.Clamped]. L'échelle, le rapport d'aspect et la rotation
 * sont invariants : seule la position bouge.
 *
 * Les traits de dessin, eux, forment UNE image : ils gardent leur forme par une
 * échelle uniforme (le plus petit des deux rapports cible / source) appliquée
 * autour du centre — iOS ancre la transformation de son `PKDrawing` à
 * l'origine, ce qui ne préserve pas le centre. Un point qui sortirait encore
 * du cadre cible est ramené dedans et le trait porte UN seul avertissement.
 *
 * Plus robuste qu'iOS : une taille dégénérée (côté nul, négatif ou non fini),
 * que la division brute d'iOS transformerait en `Infinity` / `NaN`, rend une
 * reprojection identité sans avertissement — une taille de cadre malformée ne
 * corrompt jamais les coordonnées d'un objet.
 */
class CanvasReprojector(
    private val source: CanvasSize,
    private val target: CanvasSize,
) {

    fun reproject(text: StoryTextObject): ReprojectedItem<StoryTextObject> {
        val p = reprojectPosition(text.x, text.y)
        return ReprojectedItem(text.copy(x = p.value.x, y = p.value.y), p.warning)
    }

    fun reproject(media: StoryMediaObject): ReprojectedItem<StoryMediaObject> {
        val p = reprojectPosition(media.x, media.y)
        return ReprojectedItem(media.copy(x = p.value.x, y = p.value.y), p.warning)
    }

    fun reproject(sticker: StorySticker): ReprojectedItem<StorySticker> {
        val p = reprojectPosition(sticker.x, sticker.y)
        return ReprojectedItem(sticker.copy(x = p.value.x, y = p.value.y), p.warning)
    }

    /** L'audio n'a pas de position spatiale : identité, jamais d'avertissement. */
    fun reproject(audio: StoryAudioPlayerObject): ReprojectedItem<StoryAudioPlayerObject> =
        ReprojectedItem(audio, null)

    /**
     * Reprojette une position normalisée nue : la loi unique de tout objet
     * posé sur le cadre. C'est la couture des familles dont le modèle de fil
     * n'est pas encore dans `:core:model` (les lieux) — elles appellent cette
     * fonction plutôt que de réécrire la formule.
     */
    fun reprojectPosition(x: Double, y: Double): ReprojectedItem<NormalizedPosition> {
        if (!source.isRenderable || !target.isRenderable) {
            return ReprojectedItem(NormalizedPosition(x, y), null)
        }
        val projectedX = CENTER + (x - CENTER) * (source.width / target.width)
        val projectedY = CENTER + (y - CENTER) * (source.height / target.height)
        val needsClamp = projectedX < 0.0 || projectedX > 1.0 || projectedY < 0.0 || projectedY > 1.0
        return ReprojectedItem(
            value = NormalizedPosition(projectedX.coerceIn(0.0, 1.0), projectedY.coerceIn(0.0, 1.0)),
            warning = if (needsClamp) ReprojectionWarning.Clamped(x, y) else null,
        )
    }

    /**
     * Reprojette un trait de dessin. Les points et l'épaisseur vivent en
     * pixels de design ; la pression, l'outil, la couleur et l'identité sont
     * inchangés.
     */
    fun reproject(stroke: StoryDrawingStroke): ReprojectedItem<StoryDrawingStroke> {
        if (!source.isRenderable || !target.isRenderable) return ReprojectedItem(stroke, null)
        val scale = minOf(target.width / source.width, target.height / source.height)
        val projected = stroke.points.map {
            it.copy(
                x = projectAxis(it.x, source.width, target.width, scale),
                y = projectAxis(it.y, source.height, target.height, scale),
            )
        }
        val firstOverflow = stroke.points.zip(projected)
            .firstOrNull { (_, point) -> overflows(point.x, target.width) || overflows(point.y, target.height) }
        val moved = stroke.copy(
            points = projected.map {
                it.copy(x = it.x.coerceIn(0.0, target.width), y = it.y.coerceIn(0.0, target.height))
            },
            width = stroke.width * scale,
        )
        val warning = firstOverflow?.let { (original, _) ->
            ReprojectionWarning.Clamped(originalX = original.x / source.width, originalY = original.y / source.height)
        }
        return ReprojectedItem(moved, warning)
    }

    /**
     * Reprojette tous les objets de [objects] vers le cadre cible et collecte
     * les avertissements dans l'ordre de rencontre : texte, médias, stickers,
     * traits (l'audio est une identité et n'en apporte aucun). Port du
     * `RepostReprojectionResult.reproject(payload:targetSize:)` d'iOS.
     */
    fun reprojectAll(objects: CanvasObjects): RepostReprojection {
        val texts = objects.textObjects.map { reproject(it) }
        val media = objects.mediaObjects.map { reproject(it) }
        val stickers = objects.stickers.map { reproject(it) }
        val audios = objects.audioPlayerObjects.map { reproject(it) }
        val strokes = objects.drawingStrokes.map { reproject(it) }
        return RepostReprojection(
            objects = CanvasObjects(
                textObjects = texts.map { it.value },
                mediaObjects = media.map { it.value },
                stickers = stickers.map { it.value },
                audioPlayerObjects = audios.map { it.value },
                drawingStrokes = strokes.map { it.value },
            ),
            warnings = (texts.map { it.warning } + media.map { it.warning } +
                stickers.map { it.warning } + strokes.map { it.warning }).filterNotNull(),
        )
    }

    companion object {
        /** La conversion portrait ↔ paysage : chaque cadre est décrit par sa taille design. */
        fun between(from: CanvasFormat, to: CanvasFormat): CanvasReprojector =
            CanvasReprojector(CanvasGeometry.designSize(from), CanvasGeometry.designSize(to))
    }
}

private const val CENTER = 0.5

/** Marge qui absorbe l'erreur d'arrondi d'un point posé exactement sur le bord du cadre. */
private const val OVERFLOW_TOLERANCE = 1e-6

private fun projectAxis(value: Double, sourceExtent: Double, targetExtent: Double, scale: Double): Double =
    targetExtent / 2 + (value - sourceExtent / 2) * scale

private fun overflows(value: Double, extent: Double): Boolean =
    value < -OVERFLOW_TOLERANCE || value > extent + OVERFLOW_TOLERANCE
