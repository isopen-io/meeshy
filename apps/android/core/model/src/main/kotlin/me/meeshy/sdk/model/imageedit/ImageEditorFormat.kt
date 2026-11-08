package me.meeshy.sdk.model.imageedit

import java.util.Locale
import kotlin.math.abs

/** Présentation pure des valeurs de l'éditeur d'image. */
public object ImageEditorFormat {
    /** La valeur affichée d'un réglage : l'écart au neutre, signé, une décimale (`+0.4`, `-1.0`). */
    public fun adjustment(value: Float, kind: AdjustmentKind): String {
        val delta = value - kind.neutral
        val rounded = if (abs(delta) < 0.05f) 0f else delta
        return String.format(Locale.ROOT, "%+.1f", rounded)
    }

    /** Les curseurs du panneau Ajuster : les neuf réglages de ton (bloom et grain sont des effets). */
    public fun toneRail(mode: ImageEditorMode): List<AdjustmentKind> =
        AdjustmentKind.rail(mode).filter { it !in EFFECT_KINDS }

    private val EFFECT_KINDS = setOf(AdjustmentKind.BLOOM, AdjustmentKind.GRAIN)
}
