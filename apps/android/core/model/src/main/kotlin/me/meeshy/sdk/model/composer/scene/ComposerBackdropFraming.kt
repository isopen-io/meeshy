package me.meeshy.sdk.model.composer.scene

import me.meeshy.sdk.model.StoryBackgroundTransform

/**
 * Le cadrage d'un fond de scène (miroir de `StoryBackgroundFraming` iOS, #6125). `null` n'est pas un état : c'est
 * un ALIAS de « remplir » — d'où [rendersFilled], qui rend le cycle décidable quelle que soit l'entrée.
 */
public object StoryBackgroundFraming {
    public const val FIT: String = "fit"
    public const val FILL: String = "fill"

    public fun rendersFilled(mode: String?): Boolean = mode != FIT

    /** Le choix déjà posé sur la scène la concerne, elle, pas le fichier qui l'occupe. */
    public fun posedFitMode(declared: String?): String = declared ?: FIT

    /** Le cadrage qui rend AUTREMENT que celui qu'on voit — jamais `null`, que `isIdentity` nettoierait. */
    public fun nextFitMode(current: String?): String = if (rendersFilled(current)) FIT else FILL
}

/**
 * Le fond des bandes d'un média AJUSTÉ (#8414). Valeurs brutes et teintes : contrat commun avec le web
 * (`backgroundTransform.backdrop`).
 */
public enum class StoryBackdrop(public val wire: String, public val solidHex: String?) {
    BLUR("blur", null),
    BLACK("black", "000000"),
    WHITE("white", "F5F5F4"),
    INDIGO("indigo", "312E81"),
    SAND("sand", "FDE68A"),
    ;

    public companion object {
        /** L'absence et toute valeur inconnue rendent le FLOU — la loi d'avant le panneau. */
        public fun resolve(raw: String?): StoryBackdrop = entries.firstOrNull { it.wire == raw } ?: BLUR
    }
}

/** Cadrage et fond, écrits sur le transform du fond : UN site pour le panneau Cadre. */
public object ComposerBackdropFraming {

    public fun fitMode(transform: StoryBackgroundTransform?): String =
        if (StoryBackgroundFraming.rendersFilled(transform?.videoFitMode)) StoryBackgroundFraming.FILL
        else StoryBackgroundFraming.FIT

    public fun backdrop(transform: StoryBackgroundTransform?): StoryBackdrop =
        StoryBackdrop.resolve(transform?.backdrop)

    public fun applyingFitMode(mode: String, transform: StoryBackgroundTransform?): StoryBackgroundTransform? =
        (transform ?: StoryBackgroundTransform()).copy(videoFitMode = mode).takeUnless { it.isIdentity }

    /** Choisir un fond AJUSTE la scène : rempli, le média n'a aucune bande où le laisser voir. */
    public fun applyingBackdrop(backdrop: StoryBackdrop, transform: StoryBackgroundTransform?): StoryBackgroundTransform? =
        (transform ?: StoryBackgroundTransform())
            .copy(backdrop = backdrop.wire, videoFitMode = StoryBackgroundFraming.FIT)
            .takeUnless { it.isIdentity }
}
