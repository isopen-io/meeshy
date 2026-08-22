package me.meeshy.sdk.model

/**
 * Pure presentation projection for a conversation's AI participant personas — the single
 * source of truth the participant-persona card renders. Faithful port of the derivations
 * iOS scatters as private helpers inside `ConversationDashboardView`
 * (`agentParticipantProfilesSection`, `traitBarsView`, `traitScoreColor`,
 * `extractTraitScores`), lifted here so every branch is JVM-testable and the Composable
 * stays a thin renderer.
 *
 * SOTA over iOS on several counts:
 *  - trait scores are **clamped to 0..100** before the bar width and tier derive (iOS
 *    trusts the raw server value, so a malformed 150 overflows its bar and a negative
 *    draws a negative width);
 *  - the confidence badge is **clamped to 0..1** before it becomes a percent (iOS renders
 *    `Int(confidence * 100)` raw, so a stray 1.5 shows "150%");
 *  - traits are extracted by **explicit field access**, not reflection (`Mirror`), and the
 *    tie-break is a **stable** sort — the order is deterministic, not defined by the
 *    runtime's reflection iteration;
 *  - topics/emojis are **trimmed, de-blanked and de-duplicated case-insensitively** (iOS
 *    renders the raw lists), and the display name resolves to a **single** seed used for
 *    both the label and its colour (iOS forks `"?"` for the label but the userId for the
 *    colour).
 */

/** Tier of a single trait score — parity iOS `traitScoreColor` (>=70 good, >=40 mid, else low). */
public enum class TraitTier { GOOD, MID, LOW }

/** The four trait axes iOS renders in `traitBarsView`, in canonical render order. */
public enum class TraitCategory { COMMUNICATION, PERSONALITY, INTERPERSONAL, EMOTIONAL }

/** A single render-ready trait bar: its label, clamped score, and colour tier. */
public data class TraitBar(
    val label: String,
    val score: Int,
    val tier: TraitTier,
)

/** One populated trait axis with its top bars (sorted desc, capped at four). */
public data class TraitCategoryView(
    val category: TraitCategory,
    val bars: List<TraitBar>,
)

/** Fully-projected, render-ready view of one participant persona. */
public data class ParticipantProfileView(
    val userId: String,
    val name: String,
    val confidencePercent: Int?,
    val personaSummary: String?,
    val tone: String?,
    val vocabularyLevel: String?,
    val categories: List<TraitCategoryView>,
    val catchphrases: List<String>,
    val topics: List<String>,
    val commonEmojis: List<String>,
)

public object ParticipantProfileProjection {

    /** The colour tier for a (pre-clamped) trait score. Faithful to iOS's `>=70` / `>=40` cut-offs. */
    public fun traitTier(score: Int): TraitTier = when {
        score >= GOOD_THRESHOLD -> TraitTier.GOOD
        score >= MID_THRESHOLD -> TraitTier.MID
        else -> TraitTier.LOW
    }

    /** The bars of a communication axis — present traits only, clamped, top 4 by score. */
    public fun bars(traits: CommunicationTraits): List<TraitBar> = barsOf(
        traits.verbosity,
        traits.formality,
        traits.responseSpeed,
        traits.initiativeRate,
        traits.clarity,
        traits.argumentation,
    )

    /** The bars of a personality axis. */
    public fun bars(traits: PersonalityTraits): List<TraitBar> = barsOf(
        traits.socialStyle,
        traits.assertiveness,
        traits.agreeableness,
        traits.humor,
        traits.emotionality,
        traits.openness,
        traits.confidence,
        traits.creativity,
        traits.patience,
        traits.adaptability,
    )

    /** The bars of an interpersonal axis. */
    public fun bars(traits: InterpersonalTraits): List<TraitBar> = barsOf(
        traits.empathy,
        traits.politeness,
        traits.leadership,
        traits.conflictStyle,
        traits.supportiveness,
        traits.diplomacy,
        traits.trustLevel,
    )

    /** The bars of an emotional axis. */
    public fun bars(traits: EmotionalTraits): List<TraitBar> = barsOf(
        traits.emotionalStability,
        traits.positivity,
        traits.sensitivity,
        traits.stressResponse,
    )

    /** The populated axes of a trait tree, in canonical order (null tree ⇒ none). */
    public fun categories(traits: ParticipantTraits?): List<TraitCategoryView> {
        if (traits == null) return emptyList()
        return listOfNotNull(
            traits.communication?.let { categoryView(TraitCategory.COMMUNICATION, bars(it)) },
            traits.personality?.let { categoryView(TraitCategory.PERSONALITY, bars(it)) },
            traits.interpersonal?.let { categoryView(TraitCategory.INTERPERSONAL, bars(it)) },
            traits.emotional?.let { categoryView(TraitCategory.EMOTIONAL, bars(it)) },
        )
    }

    /** Project a single server persona into its render-ready view. */
    public fun profile(profile: ParticipantProfile): ParticipantProfileView = ParticipantProfileView(
        userId = profile.userId,
        name = resolveName(profile),
        confidencePercent = confidencePercent(profile.confidence),
        personaSummary = profile.personaSummary.trim().ifEmpty { null },
        tone = profile.tone.trim().ifEmpty { null },
        vocabularyLevel = profile.vocabularyLevel.trim().ifEmpty { null },
        categories = categories(profile.traits),
        catchphrases = nonBlank(profile.catchphrases).take(MAX_CATCHPHRASES),
        topics = ConversationAnalysisProjection.cleanLabels(profile.topicsOfExpertise).take(MAX_TOPICS),
        commonEmojis = ConversationAnalysisProjection.cleanLabels(profile.commonEmojis).take(MAX_EMOJIS),
    )

    /** Project every persona of an analysis, in server order. */
    public fun profiles(analysis: ConversationAnalysis): List<ParticipantProfileView> =
        analysis.participantProfiles.map(::profile)

    private fun barsOf(vararg scores: TraitScore?): List<TraitBar> =
        scores
            .filterNotNull()
            .map {
                val clamped = it.score.coerceIn(MIN_SCORE, MAX_SCORE)
                TraitBar(label = it.label.trim(), score = clamped, tier = traitTier(clamped))
            }
            .sortedByDescending { it.score }
            .take(MAX_BARS)

    private fun categoryView(category: TraitCategory, bars: List<TraitBar>): TraitCategoryView? =
        bars.takeIf { it.isNotEmpty() }?.let { TraitCategoryView(category, it) }

    private fun confidencePercent(confidence: Double): Int? =
        if (confidence > 0.0) (confidence.coerceIn(0.0, 1.0) * 100).toInt() else null

    private fun resolveName(profile: ParticipantProfile): String =
        profile.displayName?.trim()?.ifEmpty { null }
            ?: profile.username?.trim()?.ifEmpty { null }
            ?: profile.userId

    private fun nonBlank(raw: List<String>): List<String> =
        raw.mapNotNull { it.trim().ifEmpty { null } }

    private const val GOOD_THRESHOLD = 70
    private const val MID_THRESHOLD = 40
    private const val MIN_SCORE = 0
    private const val MAX_SCORE = 100
    private const val MAX_BARS = 4
    private const val MAX_CATCHPHRASES = 3
    private const val MAX_TOPICS = 3
    private const val MAX_EMOJIS = 6
}
