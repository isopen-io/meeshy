package me.meeshy.sdk.model.composer.look

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/** Une toile de rendu, en pixels. */
public data class ComposerLookSize(val width: Int, val height: Int)

/**
 * **LA TOILE D'UNE PRISE RETOUCHÉE** — ce qui part garde les proportions de la prise (les cadres sont en
 * proportion de la toile : 9:16, 4:5, 1:1, 16:9 sont servis), à des dimensions paires, au plus
 * [EXPORT_LONG_SIDE] de grand côté ; l'aperçu se peint à [PREVIEW_LONG_SIDE] — un changement de look coûte
 * une image d'écran, jamais une photo pleine définition.
 */
public object ComposerLookCanvas {
    public const val PREVIEW_LONG_SIDE: Int = 1280
    public const val EXPORT_LONG_SIDE: Int = 2560
    public const val THUMBNAIL_LONG_SIDE: Int = 200

    public fun fitted(sourceWidth: Int, sourceHeight: Int, longSide: Int): ComposerLookSize? {
        if (sourceWidth <= 0 || sourceHeight <= 0 || longSide <= 0) return null
        val scale = min(1.0, longSide.toDouble() / max(sourceWidth, sourceHeight))
        return ComposerLookSize(even(sourceWidth * scale), even(sourceHeight * scale))
    }

    private fun even(value: Double): Int {
        val whole = value.roundToInt()
        return max(2, whole - whole % 2)
    }
}

/** Ce que « Terminé » remet : la prise telle quelle (octets d'origine), ou son rendu. */
public enum class ComposerRetouchDelivery { ORIGINAL, RENDERED }

/**
 * **L'ÉTAT DE LA RETOUCHE UNIQUE** (#11133, #12614) — miroir des lois d'iOS (`ComposerEditTools`,
 * `ComposerLookStripRule`, `ComposerCaptureCoverLife`) pour l'écran Android, en valeur immuable :
 * le look (filtre · effet · cadre), la famille ouverte, les outils montrés, et la réponse à l'hôte qui ne
 * part qu'UNE fois.
 */
public data class ComposerRetouchState(
    val take: ComposerEditTake = ComposerEditTake.Photo,
    val families: List<ComposerLookFamily> = ComposerLookStripRule.families(effects = emptyList()),
    val tools: List<ComposerEditTool> = emptyList(),
    val look: ComposerPhotoLook = ComposerPhotoLook(),
    val openFamily: ComposerLookFamily? = null,
    val activeTools: Set<ComposerEditTool> = emptySet(),
    val settled: Boolean = false,
) {
    /** (x) et « Terminé » cèdent la place aux éléments d'édition. */
    val showsTopRow: Boolean
        get() = ComposerEditTools.showsTopRow(openFamily != null, activeTools.filter { ComposerEditTools.isShown(it, activeTools, openFamily != null) }.toSet())

    /** Toucher une famille l'ouvre ; la toucher ouverte la referme. Une famille absente du rail ne s'ouvre pas. */
    public fun tappingFamily(family: ComposerLookFamily): ComposerRetouchState = when {
        settled || family !in families -> this
        openFamily == family -> copy(openFamily = null)
        else -> copy(openFamily = family)
    }

    /** Choisir une case : filtre, effet et cadre se combinent. */
    public fun choosing(item: ComposerLookStripItem): ComposerRetouchState =
        if (settled) this else copy(look = ComposerLookStripRule.look(item, look))

    /** Toucher un outil ne touche que lui ; un outil que la prise n'offre pas ne bouge rien. */
    public fun tappingTool(tool: ComposerEditTool): ComposerRetouchState {
        if (settled || tool !in tools) return this
        val familyOpen = openFamily != null
        val next = ComposerEditTools.toggled(activeTools, tool, familyOpen)
        return copy(activeTools = next, openFamily = if (familyOpen && tool != ComposerEditTool.CROP) null else openFamily)
    }

    /** « Terminé » : ce qui part. Un look intouché rend les octets d'origine, jamais un ré-encodage. */
    public val delivery: ComposerRetouchDelivery
        get() = if (look.isUntouched) ComposerRetouchDelivery.ORIGINAL else ComposerRetouchDelivery.RENDERED

    /** La réponse à l'hôte — « Terminé », « Annuler » — part une seule fois : la seconde est refusée. */
    public fun settling(): ComposerRetouchState? = if (settled) null else copy(settled = true, openFamily = null)

    public companion object {
        /** L'état d'entrée d'une prise : aucun outil ouvert, les familles que la plateforme sait peindre. */
        public fun opening(take: ComposerEditTake, renderableEffects: List<CallFaceEffect>, tools: List<ComposerEditTool>): ComposerRetouchState =
            ComposerRetouchState(
                take = take,
                families = ComposerLookStripRule.families(renderableEffects),
                tools = ComposerEditTools.offered(take).filter { it in tools },
                activeTools = ComposerEditTools.initial(take),
            )
    }
}
