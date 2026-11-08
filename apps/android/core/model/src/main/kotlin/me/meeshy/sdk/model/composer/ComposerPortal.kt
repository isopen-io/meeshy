package me.meeshy.sdk.model.composer

/**
 * La feuille OUVERTE de l'hôte — une seule, nommée (miroir de `ComposerPortal`, iOS #4467). Deux feuilles ne peuvent pas être
 * ouvertes à la fois : une variable ne porte qu'une valeur, et ouvrir la seconde FERME la première.
 */
public enum class ComposerPortal(public val presentation: Presentation) {
    LOCATION(Presentation.SHEET),
    EMOJI(Presentation.SHEET),
    STICKER(Presentation.SHEET),
    SOUND(Presentation.SHEET),
    SOUND_LIBRARY(Presentation.SHEET),
    REFERENCE(Presentation.SHEET),
    LANGUAGE(Presentation.SHEET),
    CAMERA(Presentation.FULL_SCREEN),
    HASHTAG(Presentation.SHEET),
    AUDIENCE(Presentation.SHEET),
    BACKGROUND(Presentation.SHEET),
    SLIDE_DURATION(Presentation.SHEET),
    ;

    public enum class Presentation { SHEET, FULL_SCREEN }
}

/** Le portail ouvert, ou aucun. Fonctions totales : fermer ce qui n'est pas ouvert ne change rien. */
public data class ComposerPortalSlot(val open: ComposerPortal? = null) {
    public fun present(portal: ComposerPortal): ComposerPortalSlot = copy(open = portal)

    /** Ferme [portal] seulement s'il est celui qui est ouvert : la fermeture tardive d'une feuille déjà remplacée ne ferme pas la suivante. */
    public fun dismiss(portal: ComposerPortal): ComposerPortalSlot = if (open == portal) ComposerPortalSlot() else this

    public fun dismissAll(): ComposerPortalSlot = ComposerPortalSlot()

    public fun opened(presentation: ComposerPortal.Presentation): ComposerPortal? = open?.takeIf { it.presentation == presentation }
}
