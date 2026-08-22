package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [ConversationAnalysisProjection] — the pure SSOT the AI
 * conversation-summary card renders. Mirrors the derivations iOS scatters as private
 * helpers inside `ConversationDashboardView` (`healthScoreColor`, `conflictLevelColor`,
 * the summary sub-section gating), lifted here so every branch is JVM-testable.
 */
class ConversationAnalysisProjectionTest {

    private fun analysis(summary: ConversationSummaryAnalysis?) =
        ConversationAnalysis(conversationId = "c1", summary = summary)

    // --- healthTier (parity iOS healthScoreColor: >70 good, >40 fair, else poor) ---

    @Test
    fun `healthTier above seventy is good`() {
        assertThat(ConversationAnalysisProjection.healthTier(71)).isEqualTo(HealthTier.GOOD)
        assertThat(ConversationAnalysisProjection.healthTier(100)).isEqualTo(HealthTier.GOOD)
    }

    @Test
    fun `healthTier exactly seventy is fair not good`() {
        assertThat(ConversationAnalysisProjection.healthTier(70)).isEqualTo(HealthTier.FAIR)
    }

    @Test
    fun `healthTier between forty-one and seventy is fair`() {
        assertThat(ConversationAnalysisProjection.healthTier(41)).isEqualTo(HealthTier.FAIR)
        assertThat(ConversationAnalysisProjection.healthTier(70)).isEqualTo(HealthTier.FAIR)
    }

    @Test
    fun `healthTier exactly forty is poor not fair`() {
        assertThat(ConversationAnalysisProjection.healthTier(40)).isEqualTo(HealthTier.POOR)
    }

    @Test
    fun `healthTier at or below forty is poor`() {
        assertThat(ConversationAnalysisProjection.healthTier(0)).isEqualTo(HealthTier.POOR)
        assertThat(ConversationAnalysisProjection.healthTier(40)).isEqualTo(HealthTier.POOR)
    }

    // --- conflictTier (parity iOS conflictLevelColor keyword match) ---

    @Test
    fun `conflictTier detects high in english and french`() {
        assertThat(ConversationAnalysisProjection.conflictTier("High")).isEqualTo(ConflictTier.HIGH)
        assertThat(ConversationAnalysisProjection.conflictTier("Conflit eleve")).isEqualTo(ConflictTier.HIGH)
        assertThat(ConversationAnalysisProjection.conflictTier("FORT")).isEqualTo(ConflictTier.HIGH)
    }

    @Test
    fun `conflictTier detects medium in english and french`() {
        assertThat(ConversationAnalysisProjection.conflictTier("Medium")).isEqualTo(ConflictTier.MEDIUM)
        assertThat(ConversationAnalysisProjection.conflictTier("niveau moyen")).isEqualTo(ConflictTier.MEDIUM)
        assertThat(ConversationAnalysisProjection.conflictTier("Modere")).isEqualTo(ConflictTier.MEDIUM)
    }

    @Test
    fun `conflictTier falls back to low for anything else`() {
        assertThat(ConversationAnalysisProjection.conflictTier("low")).isEqualTo(ConflictTier.LOW)
        assertThat(ConversationAnalysisProjection.conflictTier("calme")).isEqualTo(ConflictTier.LOW)
        assertThat(ConversationAnalysisProjection.conflictTier("")).isEqualTo(ConflictTier.LOW)
    }

    @Test
    fun `conflictTier prefers high when both high and medium tokens appear`() {
        assertThat(ConversationAnalysisProjection.conflictTier("high but medium")).isEqualTo(ConflictTier.HIGH)
    }

    // --- cleanLabels (trim, drop blanks, dedupe case-insensitive preserving order+casing) ---

    @Test
    fun `cleanLabels trims and drops blank entries`() {
        assertThat(ConversationAnalysisProjection.cleanLabels(listOf("  work ", "", "   ", "play")))
            .containsExactly("work", "play").inOrder()
    }

    @Test
    fun `cleanLabels dedupes case-insensitively keeping the first casing and order`() {
        assertThat(ConversationAnalysisProjection.cleanLabels(listOf("Joy", "joy", "Anger", "JOY")))
            .containsExactly("Joy", "Anger").inOrder()
    }

    @Test
    fun `cleanLabels on an empty list is empty`() {
        assertThat(ConversationAnalysisProjection.cleanLabels(emptyList())).isEmpty()
    }

    // --- summary projection ---

    @Test
    fun `summary is null when the analysis carries no summary`() {
        assertThat(ConversationAnalysisProjection.summary(analysis(null))).isNull()
    }

    @Test
    fun `summary is null when every renderable field is blank or empty`() {
        val blank = ConversationSummaryAnalysis(
            text = "   ",
            overallTone = "",
            engagementLevel = "  ",
            conflictLevel = "",
            dynamique = null,
            currentTopics = listOf("", "  "),
            dominantEmotions = emptyList(),
            healthScore = null,
            messageCount = 42,
        )
        assertThat(ConversationAnalysisProjection.summary(analysis(blank))).isNull()
    }

    @Test
    fun `summary projects a fully populated summary`() {
        val view = ConversationAnalysisProjection.summary(
            analysis(
                ConversationSummaryAnalysis(
                    text = "  Lively debate ",
                    currentTopics = listOf("Sport", "sport", " Music "),
                    overallTone = " Positive ",
                    messageCount = 120,
                    healthScore = 85,
                    engagementLevel = " high ",
                    conflictLevel = " Eleve ",
                    dynamique = " collaborative ",
                    dominantEmotions = listOf("Joy", " joy ", "Curiosity"),
                ),
            ),
        )!!

        assertThat(view.text).isEqualTo("Lively debate")
        assertThat(view.topics).containsExactly("Sport", "Music").inOrder()
        assertThat(view.overallTone).isEqualTo("Positive")
        assertThat(view.messageCount).isEqualTo(120)
        assertThat(view.healthScore).isEqualTo(85)
        assertThat(view.healthTier).isEqualTo(HealthTier.GOOD)
        assertThat(view.engagementLevel).isEqualTo("high")
        assertThat(view.conflictLevel).isEqualTo("Eleve")
        assertThat(view.conflictTier).isEqualTo(ConflictTier.HIGH)
        assertThat(view.dynamique).isEqualTo("collaborative")
        assertThat(view.emotions).containsExactly("Joy", "Curiosity").inOrder()
    }

    @Test
    fun `summary clamps an out-of-range health score into zero to one hundred`() {
        val high = ConversationAnalysisProjection.summary(
            analysis(ConversationSummaryAnalysis(text = "x", healthScore = 150)),
        )!!
        assertThat(high.healthScore).isEqualTo(100)
        assertThat(high.healthTier).isEqualTo(HealthTier.GOOD)

        val low = ConversationAnalysisProjection.summary(
            analysis(ConversationSummaryAnalysis(text = "x", healthScore = -10)),
        )!!
        assertThat(low.healthScore).isEqualTo(0)
        assertThat(low.healthTier).isEqualTo(HealthTier.POOR)
    }

    @Test
    fun `summary derives no tier and null blanks when only free text is present`() {
        val view = ConversationAnalysisProjection.summary(
            analysis(ConversationSummaryAnalysis(text = "Just a note", healthScore = null)),
        )!!
        assertThat(view.healthScore).isNull()
        assertThat(view.healthTier).isNull()
        assertThat(view.engagementLevel).isNull()
        assertThat(view.conflictLevel).isNull()
        assertThat(view.conflictTier).isNull()
        assertThat(view.dynamique).isNull()
        assertThat(view.topics).isEmpty()
        assertThat(view.emotions).isEmpty()
    }

    @Test
    fun `summary surfaces a health-only summary even with no free text`() {
        val view = ConversationAnalysisProjection.summary(
            analysis(ConversationSummaryAnalysis(text = "", healthScore = 55)),
        )
        assertThat(view).isNotNull()
        assertThat(view!!.healthScore).isEqualTo(55)
        assertThat(view.healthTier).isEqualTo(HealthTier.FAIR)
    }

    @Test
    fun `summary clamps a negative message count to zero`() {
        val view = ConversationAnalysisProjection.summary(
            analysis(ConversationSummaryAnalysis(text = "x", messageCount = -5)),
        )!!
        assertThat(view.messageCount).isEqualTo(0)
    }
}
