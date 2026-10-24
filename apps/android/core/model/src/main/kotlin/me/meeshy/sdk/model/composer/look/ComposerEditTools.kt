package me.meeshy.sdk.model.composer.look

/** Un outil de la retouche, au-delà des familles de looks — miroir de `ComposerEditTool` (iOS). */
public enum class ComposerEditTool { CROP, TEXT, TRIM, SOUND }

/** Ce que la retouche retouche, vu par ses outils. */
public sealed interface ComposerEditTake {
    public data object Photo : ComposerEditTake
    public data class Video(val hasAudio: Boolean) : ComposerEditTake
    /** Une prise sans image : elle se coupe et son son se règle. */
    public data object Audio : ComposerEditTake
}

/** Ce qui se pose sous la scène. */
public enum class ComposerEditPanel { NONE, TRIM, BAND, PRESETS, SOUND }

/**
 * **LES OUTILS DE LA RETOUCHE — COMPOSABLES** (#9754, #12591) — miroir de `ComposerEditTools` (iOS).
 * Aucun outil n'est ouvert à l'entrée ; toucher un outil ne touche que lui ; Texte et Recadrer s'excluent ;
 * (x) et « Terminé » cèdent la place aux éléments d'édition.
 */
public object ComposerEditTools {

    /** L'ordre des panneaux sous la scène, de haut en bas : les proportions, le spectre, puis la coupe. */
    public val panelOrder: List<ComposerEditTool> = listOf(ComposerEditTool.CROP, ComposerEditTool.SOUND, ComposerEditTool.TRIM)

    /** Ce qu'une prise offre : la photo se recadre ; la vidéo se recadre et se coupe, et son son se règle si elle en a un. */
    public fun offered(take: ComposerEditTake): List<ComposerEditTool> = when (take) {
        ComposerEditTake.Photo -> listOf(ComposerEditTool.CROP, ComposerEditTool.TEXT)
        is ComposerEditTake.Video ->
            if (take.hasAudio) listOf(ComposerEditTool.CROP, ComposerEditTool.TEXT, ComposerEditTool.TRIM, ComposerEditTool.SOUND)
            else listOf(ComposerEditTool.CROP, ComposerEditTool.TEXT, ComposerEditTool.TRIM)
        ComposerEditTake.Audio -> listOf(ComposerEditTool.TRIM, ComposerEditTool.SOUND)
    }

    /** Aucun outil ouvert à l'entrée (porteur 2026-10-20) : le rail est là, la prise remplit l'écran. */
    @Suppress("UNUSED_PARAMETER")
    public fun initial(take: ComposerEditTake): Set<ComposerEditTool> = emptySet()

    /** (x) et « Terminé » ne se montrent que tant qu'aucune famille n'est ouverte et qu'aucun outil n'est montré. */
    public fun showsTopRow(familyOpen: Boolean, shownTools: Set<ComposerEditTool>): Boolean = !familyOpen && shownTools.isEmpty()

    /** Seul le recadrage réduit la prise, et seulement quand le chrome est montré. */
    public fun framesScene(active: Set<ComposerEditTool>, chromeShown: Boolean): Boolean = chromeShown && ComposerEditTool.CROP in active

    /** Les équerres restent sur la scène sous une bande ; les pistes s'y replient. */
    public fun isShown(tool: ComposerEditTool, active: Set<ComposerEditTool>, familyOpen: Boolean): Boolean =
        tool in active && (tool == ComposerEditTool.CROP || !familyOpen)

    /** Toucher un outil ne touche que lui : montré, il se retire ; replié ou éteint, il se montre. */
    public fun toggled(active: Set<ComposerEditTool>, tapping: ComposerEditTool, familyOpen: Boolean): Set<ComposerEditTool> =
        if (isShown(tapping, active, familyOpen)) active - tapping else active + tapping - excluded(tapping)

    /** Texte et Recadrer s'excluent : tous deux prennent la scène. */
    public fun excluded(tool: ComposerEditTool): Set<ComposerEditTool> = when (tool) {
        ComposerEditTool.CROP -> setOf(ComposerEditTool.TEXT)
        ComposerEditTool.TEXT -> setOf(ComposerEditTool.CROP)
        ComposerEditTool.TRIM, ComposerEditTool.SOUND -> emptySet()
    }

    /** Les panneaux sous la scène : la bande d'une famille ouverte, sinon un par outil actif — sauf le son posé sur la coupe. */
    public fun panels(familyOpen: Boolean, active: Set<ComposerEditTool>): List<ComposerEditPanel> {
        if (familyOpen) return listOf(ComposerEditPanel.BAND)
        return panelOrder
            .filter { it in active && !(overlaysTrim(it) && ComposerEditTool.TRIM in active) }
            .map(::panel)
    }

    /** Le son se peint sur la bande vidéo tant qu'elle est montrée (#10341). */
    public fun overlaysTrim(tool: ComposerEditTool): Boolean = tool == ComposerEditTool.SOUND

    public fun panel(tool: ComposerEditTool): ComposerEditPanel = when (tool) {
        ComposerEditTool.CROP -> ComposerEditPanel.PRESETS
        ComposerEditTool.TEXT -> ComposerEditPanel.NONE
        ComposerEditTool.TRIM -> ComposerEditPanel.TRIM
        ComposerEditTool.SOUND -> ComposerEditPanel.SOUND
    }

    /** Les équerres suivent Recadrer, et lui seul. */
    public fun showsBrackets(active: Set<ComposerEditTool>): Boolean = ComposerEditTool.CROP in active
}
