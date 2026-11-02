package me.meeshy.sdk.model.composer.look

import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt
import me.meeshy.sdk.model.call.VideoFilterPreset
import me.meeshy.sdk.model.call.frames.CallFrameCatalogue
import me.meeshy.sdk.model.call.frames.CallFrameDesign

/** Les familles du rail. L'ordre de déclaration EST l'ordre du rail : Filtres · Effets · Cadres (#10311). */
public enum class ComposerLookFamily { FILTERS, EFFECTS, FRAMES }

/** Une case de la bande : un filtre, un effet ou un cadre — jamais un look entier. */
public sealed interface ComposerLookStripItem {
    public data class Filter(val preset: VideoFilterPreset) : ComposerLookStripItem
    public data class Effect(val effect: CallFaceEffect) : ComposerLookStripItem
    public data class Frame(val frame: ComposerPhotoFrame) : ComposerLookStripItem
}

/**
 * **LES LOIS DE LA BANDE** (#9351) — miroir de `ComposerLookStripRule` (iOS) : filtre, effet et cadre se
 * COMBINENT, la case choisie est encadrée, et la case arrivée au centre du défilement est choisie.
 */
public object ComposerLookStripRule {
    /** La largeur d'une case et l'espacement, en dp, comme les points d'iOS (56 × 100, 8). */
    public const val CELL_WIDTH: Double = 56.0
    public const val CELL_HEIGHT: Double = 100.0
    public const val SPACING: Double = 8.0
    public const val PITCH: Double = CELL_WIDTH + SPACING

    /**
     * Les familles que le rail montre : une famille ne s'offre que si elle propose plus qu'« Aucun ».
     * [effects] sont les effets que la plateforme sait rendre sur une prise.
     */
    public fun families(effects: List<CallFaceEffect>): List<ComposerLookFamily> =
        ComposerLookFamily.entries.filter { it != ComposerLookFamily.EFFECTS || effects.any { effect -> effect != CallFaceEffect.NONE } }

    /** « Aucun » en tête, puis la famille dans son ordre — chaque cadre une fois. */
    public fun items(
        family: ComposerLookFamily,
        effects: List<CallFaceEffect> = CallFaceEffect.entries,
        among: List<CallFrameDesign> = CallFrameCatalogue.all,
    ): List<ComposerLookStripItem> = when (family) {
        ComposerLookFamily.FILTERS -> ComposerPhotoLookRule.filters.map { ComposerLookStripItem.Filter(it) }
        ComposerLookFamily.EFFECTS -> (listOf(CallFaceEffect.NONE) + effects).distinct().map { ComposerLookStripItem.Effect(it) }
        ComposerLookFamily.FRAMES -> frameItems(among)
    }

    private fun frameItems(among: List<CallFrameDesign>): List<ComposerLookStripItem> {
        val frames = ComposerLiveLookRule.chips(among)
            .flatMap { ComposerLiveLookRule.frames(it, among) }
            .filter { it != ComposerPhotoFrame.None }
            .distinct()
        return (listOf(ComposerPhotoFrame.None) + frames).map { ComposerLookStripItem.Frame(it) }
    }

    /** Filtre, effet et cadre se COMBINENT : choisir l'un garde les autres. */
    public fun look(item: ComposerLookStripItem, combinedWith: ComposerPhotoLook): ComposerPhotoLook = when (item) {
        is ComposerLookStripItem.Filter -> combinedWith.copy(filter = item.preset)
        is ComposerLookStripItem.Effect -> combinedWith.copy(effect = item.effect)
        is ComposerLookStripItem.Frame -> combinedWith.copy(frame = item.frame)
    }

    /** La case est-elle la moitié choisie du look ? C'est elle qu'on encadre. */
    public fun isChosen(item: ComposerLookStripItem, look: ComposerPhotoLook): Boolean = when (item) {
        is ComposerLookStripItem.Filter -> look.filter == item.preset
        is ComposerLookStripItem.Effect -> look.effect == item.effect
        is ComposerLookStripItem.Frame -> look.frame == item.frame
    }

    public fun chosenIndex(items: List<ComposerLookStripItem>, look: ComposerPhotoLook): Int? =
        items.indexOfFirst { isChosen(it, look) }.takeIf { it >= 0 }

    /** La case sous le milieu de la bande, pour un défilement de [scrolled] dp depuis la première. */
    public fun centeredIndex(scrolled: Double, count: Int): Int? {
        if (count <= 0) return null
        return min(count - 1, max(0, (scrolled / PITCH).roundToInt()))
    }
}

/**
 * **CE QUE LE DÉFILEMENT CHOISIT** (#9566) — miroir de `ComposerLookStripFollow` (iOS). La case arrivée au
 * centre est choisie, sauf pendant un défilement que la bande fait D'ELLE-MÊME (à l'ouverture, ou vers une
 * case touchée) ; un tel défilement que le doigt interrompt se solde au repos. Valeur immuable : chaque
 * événement rend le nouvel état et sa décision.
 */
public data class ComposerLookStripFollow(
    val target: Int? = null,
    val centered: Int? = null,
    val hasBegun: Boolean = false,
    private val movedSinceTarget: Boolean = false,
) {
    /** Ce que la bande fait en s'arrêtant. */
    public sealed interface Rest {
        public data object Stay : Rest
        public data class Choose(val index: Int) : Rest
        public data class Rejoin(val index: Int) : Rest
    }

    public data class Step<T>(val follow: ComposerLookStripFollow, val decision: T)

    /** La bande s'ouvre en tête, puis rejoint la case choisie. */
    public fun begin(chosen: Int?): ComposerLookStripFollow = copy(hasBegun = true, target = chosen, movedSinceTarget = false)

    /** [index] est arrivée au centre : la case à choisir, `null` si rien ne change. */
    public fun centeredOn(index: Int, chosen: Int?, selects: Boolean): Step<Int?> {
        val before = centered
        val goal = target ?: return Step(copy(centered = index), if (selects && index != chosen) index else null)
        val moved = movedSinceTarget || (before != null && before != index)
        return Step(copy(centered = index, target = if (goal == index) null else goal, movedSinceTarget = moved), null)
    }

    /** Le choix vient de changer : la case où défiler, `null` si elle est déjà au centre. */
    public fun chose(index: Int): Step<Int?> =
        if (index == centered) Step(copy(target = null, movedSinceTarget = false), null)
        else Step(copy(target = index, movedSinceTarget = false), index)

    /** La bande s'est arrêtée : une cible pas encore rejointe se rejoint ; un trajet coupé choisit où il s'arrête. */
    public fun settled(chosen: Int?, selects: Boolean): Step<Rest> {
        if (target != null && !movedSinceTarget) return Step(this, Rest.Rejoin(target))
        val rested = copy(target = null, movedSinceTarget = false)
        val decision = if (selects && centered != null && centered != chosen) Rest.Choose(centered) else Rest.Stay
        return Step(rested, decision)
    }
}
