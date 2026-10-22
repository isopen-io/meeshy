package me.meeshy.sdk.model.scene.export

/** Un morceau placé sur la timeline finale. */
public data class StoryExportSegment(val index: Int, val startMillis: Long, val durationMillis: Long)

public data class StoryExportSequencePlan(val segments: List<StoryExportSegment>) {
    public val totalMillis: Long get() = segments.sumOf { it.durationMillis }
}

/** Enchaînement des scènes d'un post : bout à bout, sans ré-encodage intermédiaire. */
public object StoryExportSequence {
    public enum class Strategy { PASSTHROUGH, REENCODE }

    /** Copie sans ré-encodage d'abord ; le ré-encodage ne sert que de repli. */
    public val strategies: List<Strategy> = listOf(Strategy.PASSTHROUGH, Strategy.REENCODE)

    public fun plan(durationsMillis: List<Long>): StoryExportSequencePlan? {
        if (durationsMillis.isEmpty()) return null
        var cursor = 0L
        return StoryExportSequencePlan(
            durationsMillis.mapIndexed { index, raw ->
                val duration = maxOf(0L, raw)
                StoryExportSegment(index, cursor, duration).also { cursor += duration }
            },
        )
    }
}
