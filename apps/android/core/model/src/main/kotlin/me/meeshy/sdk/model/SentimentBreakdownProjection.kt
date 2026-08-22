package me.meeshy.sdk.model

/** The three coarse tones the stats dashboard's sentiment bar splits into. */
public enum class SentimentTone { POSITIVE, NEUTRAL, NEGATIVE }

/** One segment of the three-way bar: its [tone], absolute [count], and [fraction] (0..1) of the scored total. */
public data class SentimentSegment(
    val tone: SentimentTone,
    val count: Int,
    val fraction: Double,
)

/**
 * The scored split of a conversation's text messages. [total] is the number of
 * messages that were scored (blank text is never counted); every fraction divides
 * by it, and a zero total yields zero fractions plus an empty [segments] list.
 */
public data class SentimentBreakdown(
    val positive: Int,
    val neutral: Int,
    val negative: Int,
) {
    val total: Int get() = positive + neutral + negative
    val hasContent: Boolean get() = total > 0

    /** Absolute count for [tone]. */
    public fun count(tone: SentimentTone): Int = when (tone) {
        SentimentTone.POSITIVE -> positive
        SentimentTone.NEUTRAL -> neutral
        SentimentTone.NEGATIVE -> negative
    }

    /** [tone]'s share of [total] in 0..1; 0.0 when nothing was scored. */
    public fun fraction(tone: SentimentTone): Double =
        if (total > 0) count(tone).toDouble() / total else 0.0

    /** [tone]'s share as a truncated whole percent (iOS `Int(frac*100)` parity); 0 when nothing was scored. */
    public fun percent(tone: SentimentTone): Int = (fraction(tone) * 100).toInt()

    /**
     * The present tones as bar segments in positive → neutral → negative order, the
     * zero-count tones dropped (iOS draws only non-zero fractions). Empty when
     * nothing was scored.
     */
    public fun segments(): List<SentimentSegment> =
        SentimentTone.entries
            .filter { count(it) > 0 }
            .map { SentimentSegment(it, count(it), fraction(it)) }

    /**
     * The prevailing tone, or null when nothing was scored. Ties resolve
     * positive → neutral → negative, a faithful port of iOS `dominantColor`.
     */
    public val dominant: SentimentTone?
        get() = when {
            total <= 0 -> null
            positive >= neutral && positive >= negative -> SentimentTone.POSITIVE
            neutral >= positive && neutral >= negative -> SentimentTone.NEUTRAL
            else -> SentimentTone.NEGATIVE
        }
}

/**
 * Pure projection behind the conversation stats dashboard's sentiment bar — the
 * single source of truth the Composable renders. Faithful in intent to iOS
 * `ConversationDashboardView.sentimentAnalysis`, SOTA on three counts:
 *
 *  - **On-device scoring reuses [SentimentAnalyzer]** (the composer's dictionary
 *    scorer) instead of Apple `NLTagger`, which has no portable Android equivalent;
 *    the three-way cut collapses the seven-bucket [SentimentLevel] SSOT rather than
 *    inventing a parallel ±0.15 threshold, so there stays exactly one sentiment
 *    source of truth.
 *  - **Sampling is deterministic** — an even stride across the whole conversation —
 *    where iOS `shuffled().prefix(200)` is RNG-driven; the stride stays
 *    representative of head-to-tail AND reproducible under test.
 *  - **The dominant tie-break is explicit** (positive ≥ neutral ≥ negative), a port
 *    of iOS's `dominantColor` cascade.
 */
public object SentimentBreakdownProjection {

    /** iOS caps the scan at 200 messages; the cap stays, the sampling turns deterministic. */
    public const val MAX_SAMPLE: Int = 200

    /**
     * Score [contents] (message texts) into a three-way [SentimentBreakdown]. Blank
     * texts are dropped; if more than [MAX_SAMPLE] survive, an even stride across the
     * whole list is scored so the split represents the entire conversation, not its
     * head. Each kept text is scored by [SentimentAnalyzer] and bucketed by [toneOf].
     */
    public fun breakdown(contents: List<String>): SentimentBreakdown {
        val counts = sample(contents.map { it.trim() }.filter { it.isNotEmpty() }, MAX_SAMPLE)
            .groupingBy { toneOf(SentimentAnalyzer.score(it)) }
            .eachCount()
        return SentimentBreakdown(
            positive = counts[SentimentTone.POSITIVE] ?: 0,
            neutral = counts[SentimentTone.NEUTRAL] ?: 0,
            negative = counts[SentimentTone.NEGATIVE] ?: 0,
        )
    }

    /** The three-way tone of a normalized [score], collapsing the [SentimentLevel] SSOT. */
    public fun toneOf(score: Double): SentimentTone = when (SentimentLevel.from(score)) {
        SentimentLevel.NEUTRAL -> SentimentTone.NEUTRAL
        SentimentLevel.SLIGHTLY_POSITIVE,
        SentimentLevel.POSITIVE,
        SentimentLevel.VERY_POSITIVE,
        -> SentimentTone.POSITIVE
        else -> SentimentTone.NEGATIVE
    }

    /**
     * At most [max] items from [list]: the whole list when it fits, else an even
     * stride (`i * size / max`) that spans head to tail deterministically. Empty
     * when [max] is non-positive.
     */
    public fun <T> sample(list: List<T>, max: Int): List<T> {
        if (max <= 0) return emptyList()
        if (list.size <= max) return list
        return (0 until max).map { list[it * list.size / max] }
    }
}
