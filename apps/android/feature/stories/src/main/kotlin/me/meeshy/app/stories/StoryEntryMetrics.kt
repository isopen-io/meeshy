package me.meeshy.app.stories

import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.ui.theme.MeeshySpacing

/**
 * Les mesures d'un point d'entrée de story, en GRAND — port de `StoryEntryMetrics` (iOS, #10925).
 * Une seule source pour le plateau du fil ET celui de la tête de liste de conversations : deux
 * valeurs pour un même objet était le défaut que cette loi referme.
 */
object StoryEntryMetrics {
    val avatar: Dp = 88.dp
    val ring: Dp = 94.dp
    val ringWidthQuiet: Dp = 0.7.dp
    val ringWidthAccented: Dp = ringWidthQuiet * 2
    val badge: Dp = 32.dp
    val createGlyph: Dp = 24.dp
    val labelWidth: Dp = 96.dp
    const val LABEL_FONT_SP: Float = 10f
    val labelSpacing: Dp = 5.dp
    val itemSpacing: Dp = MeeshySpacing.md
    val paddingHorizontal: Dp = MeeshySpacing.lg
    val paddingVertical: Dp = MeeshySpacing.sm
    val height: Dp = 120.dp

    /** Au-delà de ce rang, un anneau apparaît sans cascade (iOS `staggerCap`). */
    const val CASCADE_CAP: Int = 10
    const val CASCADE_STEP_MILLIS: Long = 50L

    /** Retard d'apparition de l'anneau [index] ; `null` = pas de cascade (au-delà du plafond). */
    fun cascadeDelayMillis(index: Int): Long? =
        if (index in 0 until CASCADE_CAP) index * CASCADE_STEP_MILLIS else null
}
