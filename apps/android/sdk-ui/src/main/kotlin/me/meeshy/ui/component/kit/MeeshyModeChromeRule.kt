package me.meeshy.ui.component.kit

import androidx.compose.runtime.Immutable

/**
 * **La loi 13 du cadre, en fonction pure** (K16) : ce qui est dessiné d'après ce que l'hôte fournit. Pas de validation
 * sans `confirm`, ni de centre ni d'accessoire sans emplacement garni, ni de plaque (donc ni verre ni bande vide) sans
 * contenu. Rangé : rien de visible, rien de touchable. Miroir de `MeeshyModeChromeRule` (iOS).
 */
@Immutable
public data class MeeshyModeChromeRule(
    val showsHeader: Boolean,
    val showsExit: Boolean,
    val showsConfirm: Boolean,
    val showsCenter: Boolean,
    val showsAccessory: Boolean,
    val showsPlate: Boolean,
    /** Le cadre reçoit les touchers de ses capsules et de sa plaque ; hors d'elles, il n'en reçoit jamais. */
    val acceptsTouches: Boolean,
) {
    public companion object {
        public fun resolve(
            hasConfirm: Boolean,
            hasCenter: Boolean,
            hasAccessory: Boolean,
            hasPlate: Boolean,
            presence: MeeshyModeChromePresence,
        ): MeeshyModeChromeRule {
            val shown = !presence.isStowed
            return MeeshyModeChromeRule(
                showsHeader = shown,
                showsExit = shown,
                showsConfirm = shown && hasConfirm,
                showsCenter = shown && hasCenter,
                showsAccessory = shown && hasAccessory,
                showsPlate = shown && hasPlate,
                acceptsTouches = shown,
            )
        }
    }
}

/**
 * **La loi d'ajustement de l'en-tête** (K16). Quand il ne tient plus, il réduit dans cet ordre : le centre en glyphe
 * seul, la validation en coche (si elle a un glyphe), puis les libellés à 80 % avec troncature (le centre d'abord, la
 * validation ensuite, Quitter en dernier).
 *
 * Largeur requise : le côté de début (Quitter), le côté de fin (accessoire, validation, joints par l'écart), et le
 * centre posé au milieu DU CADRE : il exige donc deux fois le plus large des côtés. La vue réalise la loi en composant
 * les quatre candidats dans l'ordre ; les vecteurs prouvent l'égalité. Les largeurs et l'écart sont dans une même unité.
 * Miroir de `MeeshyModeHeaderFit` (iOS).
 */
public object MeeshyModeHeaderFit {

    public enum class Step {
        Full,
        CenterGlyph,
        ConfirmGlyph,
        Compact,
        ;

        public val reducesCenter: Boolean get() = this != Full
        public val reducesConfirm: Boolean get() = this == ConfirmGlyph || this == Compact
        public val labelScale: Float get() = if (this == Compact) MeeshyModeChromeRecipe.MINIMUM_LABEL_SCALE else 1f
    }

    /** Une capsule vue de la loi : la largeur de son titre et ce qu'elle sait montrer. */
    @Immutable
    public data class Item(
        val textWidth: Float,
        val hasGlyph: Boolean,
        val display: MeeshyModeCapsuleDisplay,
    ) {
        internal fun width(reducedToGlyph: Boolean, labelScale: Float): Float = MeeshyModeChromeRecipe.capsuleWidth(
            textWidth = textWidth,
            hasGlyph = hasGlyph,
            display = if (reducedToGlyph && hasGlyph) MeeshyModeCapsuleDisplay.Glyph else display,
            labelScale = labelScale,
        )
    }

    @Immutable
    public data class Result(
        val step: Step,
        /** La largeur requise au pas retenu. */
        val width: Float,
        /** Faux quand même le pas le plus serré ne tient pas : la troncature fait le reste. */
        val fits: Boolean,
    )

    @Immutable
    public data class Allocation(
        val exit: Float,
        val center: Float?,
        val accessory: Float?,
        val confirm: Float?,
    )

    /** La largeur requise de l'en-tête pour des largeurs de capsules données. */
    public fun requiredWidth(
        exit: Float,
        center: Float?,
        accessory: Float?,
        confirm: Float?,
        gap: Float = MeeshyModeChromeRecipe.itemGap,
    ): Float {
        val trailing = joined(listOf(accessory, confirm), gap)
        val sides = joined(listOf(exit, if (trailing > 0f) trailing else null), gap)
        if (center == null || center <= 0f) return sides
        return maxOf(sides, center + 2 * (maxOf(exit, trailing) + gap))
    }

    public fun resolve(
        available: Float,
        exit: Item,
        center: Item?,
        accessory: Float?,
        confirm: Item?,
        gap: Float = MeeshyModeChromeRecipe.itemGap,
    ): Result {
        val place = if (available.isFinite()) maxOf(available, 0f) else 0f
        var last = Result(step = Step.Compact, width = 0f, fits = false)
        for (step in Step.entries) {
            val width = requiredWidth(
                exit = exit.width(reducedToGlyph = false, labelScale = step.labelScale),
                center = center?.width(reducedToGlyph = step.reducesCenter, labelScale = step.labelScale),
                accessory = accessory,
                confirm = confirm?.width(reducedToGlyph = step.reducesConfirm, labelScale = step.labelScale),
                gap = gap,
            )
            last = Result(step = step, width = width, fits = width <= place)
            if (last.fits) return last
        }
        return last
    }

    /**
     * Les largeurs rendues quand la place manque encore au pas le plus serré : le centre cède d'abord (dans l'espace
     * symétrique qui lui reste), puis la validation, Quitter en dernier ; l'accessoire, un bouton, ne se tronque pas.
     */
    public fun allocate(
        available: Float,
        exit: Float,
        center: Float?,
        accessory: Float?,
        confirm: Float?,
        gap: Float = MeeshyModeChromeRecipe.itemGap,
    ): Allocation {
        val place = if (available.isFinite()) maxOf(available, 0f) else 0f
        val fixed = accessory ?: 0f
        val items = 1 + (if (accessory == null) 0 else 1) + (if (confirm == null) 0 else 1)
        val room = maxOf(place - gap * (items - 1), 0f)
        val confirmShare = confirm?.let { minOf(it, maxOf(room - exit - fixed, 0f)) }
        val exitShare = minOf(exit, maxOf(room - fixed - (confirmShare ?: 0f), 0f))
        val trailing = joined(listOf(accessory, confirmShare), gap)
        val centerShare = center?.let { minOf(it, maxOf(place - 2 * (maxOf(exitShare, trailing) + gap), 0f)) }
        return Allocation(exit = exitShare, center = centerShare, accessory = accessory, confirm = confirmShare)
    }

    private fun joined(widths: List<Float?>, gap: Float): Float {
        val present = widths.filterNotNull().filter { it > 0f }
        if (present.isEmpty()) return 0f
        return present.sum() + gap * (present.size - 1)
    }
}

/**
 * **La loi de hauteur et de pose de la plaque** (K16) : elle épouse son contenu jusqu'à 42 % de la fenêtre (jamais
 * moins de 160), puis défile ; son bas suit la zone sûre comme la pilule de K10 ; sa largeur est celle que l'hôte lui
 * laisse, bornée. Les longueurs sont en dp. Miroir de `MeeshyModePlateMetrics` (iOS).
 */
public object MeeshyModePlateMetrics {

    public fun maxHeight(windowHeight: Float): Float {
        if (!windowHeight.isFinite() || windowHeight <= 0f) return MeeshyModeChromeRecipe.PLATE_FLOOR
        return maxOf(MeeshyModeChromeRecipe.PLATE_FLOOR, windowHeight * MeeshyModeChromeRecipe.PLATE_CEILING_SHARE)
    }

    /** La hauteur : le contenu (au moins 1, avant sa première mesure), plafonnée. */
    public fun height(content: Float, windowHeight: Float): Float {
        val measured = if (content.isFinite()) content else 0f
        return minOf(maxOf(measured, 1f), maxHeight(windowHeight))
    }

    /** Le contenu dépasse son plafond : la plaque défile. */
    public fun scrolls(content: Float, windowHeight: Float): Boolean = content.isFinite() && content > maxHeight(windowHeight)

    /** Le bas : la zone sûre plus 12, jamais sous 28. */
    public fun bottomMargin(safeBottom: Float): Float =
        maxOf(safeBottom + MeeshyModeChromeRecipe.plateBottomGap, MeeshyModeChromeRecipe.PLATE_MINIMUM_BOTTOM)

    /** La largeur : la place moins les deux bords, bornée par `maxWidth` quand l'hôte en donne un. */
    public fun width(available: Float, maxWidth: Float?): Float {
        if (!available.isFinite()) return 0f
        val room = maxOf(available - 2 * MeeshyModeChromeRecipe.plateEdge, 0f)
        if (maxWidth == null || !maxWidth.isFinite()) return room
        return minOf(room, maxOf(maxWidth, 0f))
    }
}
