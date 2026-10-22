package me.meeshy.sdk.model.chrome

/**
 * Nature d'une surface : translucide (le fond transparait) ou opaque.
 *
 * Pendant iOS : `MeeshySurface` (MeeshyUI/Theme/MeeshySurface.swift).
 */
public enum class MeeshySurface {
    Translucent,
    Opaque,
    ;

    /** La transparence reduite (contraste eleve) force toute surface a l'opaque. */
    public fun resolved(reduceTransparency: Boolean): MeeshySurface =
        if (reduceTransparency) Opaque else this
}

/** Rendu effectif d'une surface de verre. */
public enum class GlassRendering {
    /** Flou du contenu derriere + remplissage translucide (API 31+). */
    Blurred,

    /** Remplissage translucide seul : aucun fond enregistre a flouter. */
    Translucent,

    /** Remplissage opaque teinte : avant l'API 31 ou transparence reduite. */
    Opaque,
}

public const val GLASS_BLUR_MIN_SDK: Int = 31

/**
 * Regle unique du rendu du verre. Opaque d'abord (accessibilite et anciens appareils), flou
 * seulement quand le systeme sait flouter ET qu'un fond est disponible a flouter.
 */
public fun resolveGlassRendering(
    sdkInt: Int,
    reduceTransparency: Boolean,
    hasBackdrop: Boolean,
): GlassRendering {
    val surface = MeeshySurface.Translucent.resolved(reduceTransparency)
    return when {
        surface == MeeshySurface.Opaque -> GlassRendering.Opaque
        sdkInt < GLASS_BLUR_MIN_SDK -> GlassRendering.Opaque
        hasBackdrop -> GlassRendering.Blurred
        else -> GlassRendering.Translucent
    }
}
