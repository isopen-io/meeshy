package me.meeshy.sdk.model.story

/** Une slide du lecteur, repérée par son groupe (l'auteur) et son rang dans ce groupe. */
data class StorySlidePosition(val group: Int, val slide: Int)

/** Ce que la loi sait d'un groupe : combien de slides il porte, et sur laquelle une avance d'auteur ATTERRIT. */
data class StoryGroupShape(val slideCount: Int, val entryIndex: Int = 0)

enum class StoryNavigationDirection {
    FORWARD,
    BACKWARD,
    ;

    val opposite: StoryNavigationDirection get() = if (this == FORWARD) BACKWARD else FORWARD
}

/** Une slide à préparer. [distance] : rang dans l'anneau N±k (1 pour N±1) ; `null` hors de l'anneau. */
data class StoryNeighborPreparation(val position: StorySlidePosition, val distance: Int?)

/**
 * Quelles slides préparer, et dans quel ordre, dès que la slide N est à l'écran — miroir de `StoryNeighborWindow`
 * (iOS, #10348). Ordre : l'anneau N±1 puis N±2 (la voisine du sens du geste d'abord) en traversant les frontières
 * de groupe comme le lecteur ; le reste du groupe courant ; l'entrée des groupes suivants ; la dernière slide du
 * groupe précédent. Bornée par [Budget].
 */
object StoryNeighborWindow {

    data class Budget(val radius: Int, val restOfGroup: Int, val followingGroups: Int, val perFollowingGroup: Int) {
        val maximumCount: Int get() = radius * 2 + restOfGroup + followingGroups * perFollowingGroup + 1

        companion object {
            val Standard = Budget(radius = 2, restOfGroup = 6, followingGroups = 2, perFollowingGroup = 2)
        }
    }

    fun preparations(
        from: StorySlidePosition,
        groups: List<StoryGroupShape>,
        direction: StoryNavigationDirection,
        budget: Budget = Budget.Standard,
    ): List<StoryNeighborPreparation> {
        val shape = groups.getOrNull(from.group) ?: return emptyList()
        if (from.slide !in 0 until shape.slideCount) return emptyList()

        val ring = ringPreparations(from, groups, direction, budget.radius)
        val reserved = ring.map { it.position }.toSet() + from
        val rest = groupSlidesByDistance(from, groups, direction)
            .filter { it !in reserved }
            .take(maxOf(budget.restOfGroup, 0))
        val tail = rest +
            followingGroupEntries(from.group, groups, budget) +
            listOfNotNull(landing(previousGroup(from.group, groups), groups))
        val extended = tail.filter { it !in reserved }.distinct().map { StoryNeighborPreparation(it, null) }
        return ring + extended
    }

    /** Le sens du dernier passage, lu dans le déplacement lui-même ; sans déplacement, [fallback] tient. */
    fun direction(
        from: StorySlidePosition?,
        to: StorySlidePosition,
        fallback: StoryNavigationDirection,
    ): StoryNavigationDirection {
        if (from == null || from == to) return fallback
        if (to.group != from.group) return if (to.group > from.group) StoryNavigationDirection.FORWARD else StoryNavigationDirection.BACKWARD
        return if (to.slide > from.slide) StoryNavigationDirection.FORWARD else StoryNavigationDirection.BACKWARD
    }

    /** Où atterrit un balayage d'AUTEUR depuis [group] : l'entrée du suivant, puis la dernière slide du précédent. */
    fun authorSwipeLandings(group: Int, groups: List<StoryGroupShape>): List<StorySlidePosition> {
        if (group !in groups.indices) return emptyList()
        val next = nextGroup(group, groups)?.let { StorySlidePosition(it, entry(groups[it])) }
        return listOfNotNull(next, landing(previousGroup(group, groups), groups))
    }

    /** Le pas du lecteur : dans le groupe, la voisine ; à la frontière, l'entrée du suivant / la dernière du précédent. */
    fun step(from: StorySlidePosition, direction: StoryNavigationDirection, groups: List<StoryGroupShape>): StorySlidePosition? =
        when (direction) {
            StoryNavigationDirection.FORWARD ->
                if (from.slide + 1 < groups[from.group].slideCount) {
                    StorySlidePosition(from.group, from.slide + 1)
                } else {
                    nextGroup(from.group, groups)?.let { StorySlidePosition(it, entry(groups[it])) }
                }
            StoryNavigationDirection.BACKWARD ->
                if (from.slide > 0) StorySlidePosition(from.group, from.slide - 1) else landing(previousGroup(from.group, groups), groups)
        }

    private fun ringPreparations(
        from: StorySlidePosition,
        groups: List<StoryGroupShape>,
        direction: StoryNavigationDirection,
        radius: Int,
    ): List<StoryNeighborPreparation> {
        val leading = chain(from, direction, groups, radius)
        val trailing = chain(from, direction.opposite, groups, radius)
        return (0 until maxOf(radius, 0)).flatMap { offset ->
            listOf(leading, trailing).mapNotNull { side ->
                side.getOrNull(offset)?.let { StoryNeighborPreparation(it, offset + 1) }
            }
        }
    }

    private fun chain(
        origin: StorySlidePosition,
        direction: StoryNavigationDirection,
        groups: List<StoryGroupShape>,
        length: Int,
    ): List<StorySlidePosition> =
        generateSequence(origin) { step(it, direction, groups) }.drop(1).take(maxOf(length, 0)).toList()

    private fun groupSlidesByDistance(
        current: StorySlidePosition,
        groups: List<StoryGroupShape>,
        direction: StoryNavigationDirection,
    ): List<StorySlidePosition> {
        val count = groups[current.group].slideCount
        val sign = if (direction == StoryNavigationDirection.FORWARD) 1 else -1
        return (1 until maxOf(count, 1))
            .flatMap { distance -> listOf(current.slide + sign * distance, current.slide - sign * distance) }
            .filter { it in 0 until count }
            .map { StorySlidePosition(current.group, it) }
    }

    private fun followingGroupEntries(group: Int, groups: List<StoryGroupShape>, budget: Budget): List<StorySlidePosition> =
        generateSequence(group) { nextGroup(it, groups) }.drop(1).take(maxOf(budget.followingGroups, 0)).toList().flatMap { index ->
            val shape = groups[index]
            val start = entry(shape)
            val end = minOf(shape.slideCount, start + maxOf(budget.perFollowingGroup, 0))
            (start until maxOf(start, end)).map { StorySlidePosition(index, it) }
        }

    private fun nextGroup(group: Int, groups: List<StoryGroupShape>): Int? =
        groups.indices.firstOrNull { it > group && groups[it].slideCount > 0 }

    private fun previousGroup(group: Int, groups: List<StoryGroupShape>): Int? =
        groups.indices.lastOrNull { it < group && groups[it].slideCount > 0 }

    private fun landing(group: Int?, groups: List<StoryGroupShape>): StorySlidePosition? =
        group?.let { StorySlidePosition(it, groups[it].slideCount - 1) }

    private fun entry(shape: StoryGroupShape): Int = shape.entryIndex.coerceIn(0, maxOf(shape.slideCount - 1, 0))
}
