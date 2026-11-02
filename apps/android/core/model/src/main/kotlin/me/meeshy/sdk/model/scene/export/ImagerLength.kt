package me.meeshy.sdk.model.scene.export

import me.meeshy.sdk.model.composer.scene.SceneExportDestination

/** Une part de la composition qu'« Imager » rend, depuis le DÉBUT : 1/4 est le premier quart, 4/4 le tout. */
public enum class ImagerQuarter(public val numerator: Int) { ONE(1), TWO(2), THREE(3), FOUR(4) }

public data class ImagerLengthChoice(val quarter: ImagerQuarter, val durationMillis: Long)

/** Ce qu'un export fait de la composition rendue : la ranger, la remettre à une autre appli, ou l'imager. */
public enum class StoryExportMode {
    SAVE,
    SHARE,
    IMAGER,
    ;

    /** « Enregistrer » et « Partager » rendent TOUJOURS tout ; seule « Imager » propose une longueur. */
    public fun lengthChoices(totalMillis: Long): List<ImagerLengthChoice> =
        if (this == IMAGER) ImagerLength.choices(totalMillis) else emptyList()

    /**
     * « Imager » OUVRE la vue Imager (#14326) — jamais un rendu direct : c'est d'elle que partent Enregistrer et Partager.
     * « Enregistrer » et « Partager » du menu rendent tout, sans vue.
     */
    public val opensImagerView: Boolean get() = this == IMAGER
}

/**
 * Ce que la vue Imager propose une fois la composition mesurée (#14326) : sa durée, et au-delà d'une minute les quatre
 * quarts depuis le début, le tout présélectionné.
 */
public data class ImagerOffer(val totalMillis: Long, val choices: List<ImagerLengthChoice>) {

    public val preselected: ImagerQuarter? get() = if (choices.isEmpty()) null else ImagerQuarter.FOUR

    public fun renderedMillis(decision: ImagerDecision): Long = ImagerLength.renderedMillis(totalMillis, decision.quarter)

    public companion object {
        public fun of(totalMillis: Long): ImagerOffer = ImagerOffer(totalMillis.coerceAtLeast(0L), ImagerLength.choices(totalMillis))
    }
}

/** Ce que la vue Imager décide : où part la composition, et la part rendue (`null` : tout). */
public data class ImagerDecision(val destination: SceneExportDestination, val quarter: ImagerQuarter? = null)

/**
 * **La longueur qu'« Imager » rend** (#13872, décision porteur du 2026-10-31 ; miroir de `scene-export-length.ts`) : au-delà
 * d'une minute, 1/4 · 2/4 · 3/4 · 4/4 de la composition, TOUJOURS depuis son début ; sous la minute, aucun choix.
 */
public object ImagerLength {
    public const val THRESHOLD_MILLIS: Long = 60_000L

    public fun choices(totalMillis: Long): List<ImagerLengthChoice> {
        val total = totalMillis.coerceAtLeast(0L)
        if (total <= THRESHOLD_MILLIS) return emptyList()
        return ImagerQuarter.entries.map { ImagerLengthChoice(it, part(total, it)) }
    }

    public fun renderedMillis(totalMillis: Long, quarter: ImagerQuarter?): Long {
        val total = totalMillis.coerceAtLeast(0L)
        if (quarter == null || total <= THRESHOLD_MILLIS) return total
        return part(total, quarter)
    }

    private fun part(total: Long, quarter: ImagerQuarter): Long = Math.round(total * quarter.numerator / QUARTERS)

    private const val QUARTERS = 4.0
}
