package me.meeshy.sdk.model

/**
 * Pure presentation projection for a conversation's AI analysis summary — the single
 * source of truth the AI-analysis card renders. Faithful port of the derivations iOS
 * scatters as private helpers inside `ConversationDashboardView` (`healthScoreColor`,
 * `conflictLevelColor`) plus its `heroHealthCard` sub-section gating, lifted here so
 * every branch is JVM-testable and the Composable stays a thin renderer.
 *
 * SOTA over iOS on two counts:
 *  - the health score is **clamped to 0..100** before the tier is derived (iOS trusts
 *    the raw server value), so a malformed score can never colour the card wrongly;
 *  - topics/emotions are **trimmed, de-blanked and de-duplicated case-insensitively**
 *    (iOS renders the raw list, so `["Joy","joy"]` would show twice).
 */

/** Health tier of a conversation — parity iOS `healthScoreColor` (>70 good, >40 fair, else poor). */
public enum class HealthTier { GOOD, FAIR, POOR }

/** Conflict tier derived from the free-text conflict level — parity iOS `conflictLevelColor`. */
public enum class ConflictTier { LOW, MEDIUM, HIGH }

/** Fully-projected, render-ready view of a conversation's AI summary. */
public data class AnalysisSummaryView(
    val text: String,
    val healthScore: Int?,
    val healthTier: HealthTier?,
    val overallTone: String,
    val engagementLevel: String?,
    val conflictLevel: String?,
    val conflictTier: ConflictTier?,
    val dynamique: String?,
    val topics: List<String>,
    val emotions: List<String>,
    val messageCount: Int,
)

/**
 * Whether the view carries anything worth rendering. `messageCount` is metadata, not
 * content — a summary that is blank but for a count renders nothing, so it is excluded.
 */
public val AnalysisSummaryView.hasContent: Boolean
    get() = text.isNotEmpty() ||
        healthScore != null ||
        overallTone.isNotEmpty() ||
        engagementLevel != null ||
        conflictLevel != null ||
        dynamique != null ||
        topics.isNotEmpty() ||
        emotions.isNotEmpty()

public object ConversationAnalysisProjection {

    /** The health tier for a (pre-clamped) score. Faithful to iOS's `>70` / `>40` cut-offs. */
    public fun healthTier(score: Int): HealthTier = when {
        score > GOOD_THRESHOLD -> HealthTier.GOOD
        score > FAIR_THRESHOLD -> HealthTier.FAIR
        else -> HealthTier.POOR
    }

    /**
     * The conflict tier for a free-text level. Case-insensitive keyword match faithful
     * to iOS: any high token wins over any medium token; neither present ⇒ low.
     */
    public fun conflictTier(level: String): ConflictTier {
        val lower = level.lowercase()
        return when {
            HIGH_TOKENS.any(lower::contains) -> ConflictTier.HIGH
            MEDIUM_TOKENS.any(lower::contains) -> ConflictTier.MEDIUM
            else -> ConflictTier.LOW
        }
    }

    /** Trim each label, drop the blanks, and de-duplicate case-insensitively keeping first casing + order. */
    public fun cleanLabels(raw: List<String>): List<String> {
        val seen = HashSet<String>()
        return raw
            .mapNotNull { it.trim().ifEmpty { null } }
            .filter { seen.add(it.lowercase()) }
    }

    /**
     * Project the analysis's summary into a render-ready [AnalysisSummaryView], or
     * `null` when there is no summary or nothing renderable in it (the Empty state).
     */
    public fun summary(analysis: ConversationAnalysis): AnalysisSummaryView? {
        val summary = analysis.summary ?: return null
        val score = summary.healthScore?.coerceIn(MIN_SCORE, MAX_SCORE)
        val conflict = summary.conflictLevel?.trim()?.ifEmpty { null }
        val view = AnalysisSummaryView(
            text = summary.text.trim(),
            healthScore = score,
            healthTier = score?.let(::healthTier),
            overallTone = summary.overallTone.trim(),
            engagementLevel = summary.engagementLevel?.trim()?.ifEmpty { null },
            conflictLevel = conflict,
            conflictTier = conflict?.let(::conflictTier),
            dynamique = summary.dynamique?.trim()?.ifEmpty { null },
            topics = cleanLabels(summary.currentTopics),
            emotions = cleanLabels(summary.dominantEmotions),
            messageCount = summary.messageCount.coerceAtLeast(0),
        )
        return view.takeIf { it.hasContent }
    }

    private const val GOOD_THRESHOLD = 70
    private const val FAIR_THRESHOLD = 40
    private const val MIN_SCORE = 0
    private const val MAX_SCORE = 100
    private val HIGH_TOKENS = listOf("high", "eleve", "fort")
    private val MEDIUM_TOKENS = listOf("medium", "moyen", "modere")
}
