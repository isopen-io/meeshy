package me.meeshy.ui.story.canvas.drawing

import me.meeshy.sdk.model.StoryDrawingStroke
import me.meeshy.sdk.model.StoryDrawingStrokePoint
import me.meeshy.sdk.model.StrokeSmoothing
import me.meeshy.sdk.model.StrokeTool
import me.meeshy.sdk.model.scene.StrokeGeometry
import me.meeshy.sdk.model.scene.StrokeWidthPoint
import me.meeshy.sdk.model.scene.VariableWidthStrokeGeometry

/** Géométrie tessellée d'un trait : points de rendu (lissés, avec largeur) et ruban. */
public class StrokeShape(
    public val widthPoints: List<StrokeWidthPoint>,
    public val geometry: StrokeGeometry,
)

/**
 * Cache de géométrie, indexé par ce qui la détermine : points, largeur, lissage, outil et captureVersion
 * (miroir du cache de `MeeshyStrokeCanvas`). La couleur et l'id n'en font pas partie : recolorer un trait ne
 * retesselle rien. Borné (LRU) pour ne retenir aucune mémoire une fois l'écran quitté.
 */
public class StrokeGeometryCache(private val capacity: Int = DEFAULT_CAPACITY) {

    private data class Key(
        val points: List<StoryDrawingStrokePoint>,
        val width: Double,
        val smoothing: StrokeSmoothing,
        val tool: StrokeTool,
        val captureVersion: Int,
    )

    private val entries = object : LinkedHashMap<Key, StrokeShape>(16, 0.75f, true) {
        override fun removeEldestEntry(eldest: MutableMap.MutableEntry<Key, StrokeShape>?): Boolean = size > capacity
    }

    public val size: Int @Synchronized get() = entries.size

    @Synchronized
    public fun shapeOf(stroke: StoryDrawingStroke): StrokeShape {
        val key = Key(stroke.points, stroke.width, stroke.smoothing, stroke.tool, stroke.captureVersion)
        return entries.getOrPut(key) {
            val widthPoints = VariableWidthStrokeGeometry.renderWidthPoints(stroke)
            StrokeShape(widthPoints, VariableWidthStrokeGeometry.tessellate(widthPoints))
        }
    }

    @Synchronized
    public fun clear() {
        entries.clear()
    }

    public companion object {
        public const val DEFAULT_CAPACITY: Int = 256
    }
}
