package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Behavioural coverage for [ParticipantProfileProjection] — the pure SSOT the AI
 * participant-persona card renders. Mirrors the derivations iOS scatters as private
 * helpers inside `ConversationDashboardView` (`traitScoreColor`, `extractTraitScores`,
 * the `agentParticipantProfilesSection` gating), lifted here so every branch is
 * JVM-testable and the Composable stays a thin renderer.
 */
class ParticipantProfileProjectionTest {

    private fun trait(label: String, score: Int) = TraitScore(label = label, score = score)

    private fun profile(
        userId: String = "u1",
        username: String? = null,
        displayName: String? = null,
        personaSummary: String = "",
        tone: String = "",
        vocabularyLevel: String = "",
        confidence: Double = 0.0,
        traits: ParticipantTraits? = null,
        catchphrases: List<String> = emptyList(),
        topicsOfExpertise: List<String> = emptyList(),
        commonEmojis: List<String> = emptyList(),
    ) = ParticipantProfile(
        userId = userId,
        username = username,
        displayName = displayName,
        personaSummary = personaSummary,
        tone = tone,
        vocabularyLevel = vocabularyLevel,
        confidence = confidence,
        traits = traits,
        catchphrases = catchphrases,
        topicsOfExpertise = topicsOfExpertise,
        commonEmojis = commonEmojis,
    )

    // --- traitTier (parity iOS traitScoreColor: >=70 good, >=40 mid, else low) ---

    @Test
    fun `traitTier at or above seventy is good`() {
        assertThat(ParticipantProfileProjection.traitTier(70)).isEqualTo(TraitTier.GOOD)
        assertThat(ParticipantProfileProjection.traitTier(100)).isEqualTo(TraitTier.GOOD)
    }

    @Test
    fun `traitTier just below seventy is mid not good`() {
        assertThat(ParticipantProfileProjection.traitTier(69)).isEqualTo(TraitTier.MID)
    }

    @Test
    fun `traitTier at or above forty is mid`() {
        assertThat(ParticipantProfileProjection.traitTier(40)).isEqualTo(TraitTier.MID)
        assertThat(ParticipantProfileProjection.traitTier(69)).isEqualTo(TraitTier.MID)
    }

    @Test
    fun `traitTier just below forty is low`() {
        assertThat(ParticipantProfileProjection.traitTier(39)).isEqualTo(TraitTier.LOW)
        assertThat(ParticipantProfileProjection.traitTier(0)).isEqualTo(TraitTier.LOW)
    }

    // --- bars: non-null filter, clamp, sort desc, stable tie-break, top 4 ---

    @Test
    fun `bars keep only the present traits`() {
        val comm = CommunicationTraits(
            verbosity = trait("Verbosity", 30),
            clarity = trait("Clarity", 80),
        )
        val bars = ParticipantProfileProjection.bars(comm)
        assertThat(bars.map { it.label }).containsExactly("Clarity", "Verbosity").inOrder()
    }

    @Test
    fun `bars sort by score descending`() {
        val comm = CommunicationTraits(
            verbosity = trait("Verbosity", 10),
            formality = trait("Formality", 90),
            clarity = trait("Clarity", 50),
        )
        assertThat(ParticipantProfileProjection.bars(comm).map { it.score })
            .containsExactly(90, 50, 10).inOrder()
    }

    @Test
    fun `bars break score ties by declaration order`() {
        val comm = CommunicationTraits(
            verbosity = trait("Verbosity", 50),
            formality = trait("Formality", 50),
        )
        assertThat(ParticipantProfileProjection.bars(comm).map { it.label })
            .containsExactly("Verbosity", "Formality").inOrder()
    }

    @Test
    fun `bars cap at four even when more are present`() {
        val pers = PersonalityTraits(
            socialStyle = trait("Social", 10),
            assertiveness = trait("Assert", 20),
            agreeableness = trait("Agree", 30),
            humor = trait("Humor", 40),
            emotionality = trait("Emotion", 50),
            openness = trait("Open", 60),
        )
        val bars = ParticipantProfileProjection.bars(pers)
        assertThat(bars).hasSize(4)
        assertThat(bars.map { it.label }).containsExactly("Open", "Emotion", "Humor", "Agree").inOrder()
    }

    @Test
    fun `bars clamp an out-of-range score into zero to one hundred`() {
        val comm = CommunicationTraits(
            verbosity = trait("Over", 150),
            formality = trait("Under", -20),
        )
        val bars = ParticipantProfileProjection.bars(comm).associateBy { it.label }
        assertThat(bars.getValue("Over").score).isEqualTo(100)
        assertThat(bars.getValue("Over").tier).isEqualTo(TraitTier.GOOD)
        assertThat(bars.getValue("Under").score).isEqualTo(0)
        assertThat(bars.getValue("Under").tier).isEqualTo(TraitTier.LOW)
    }

    @Test
    fun `bars of an all-absent category are empty`() {
        assertThat(ParticipantProfileProjection.bars(CommunicationTraits())).isEmpty()
    }

    // --- categories: fixed order, only the non-empty ones, null traits => none ---

    @Test
    fun `categories surface every populated axis in canonical order`() {
        val traits = ParticipantTraits(
            emotional = EmotionalTraits(positivity = trait("Positivity", 60)),
            communication = CommunicationTraits(clarity = trait("Clarity", 70)),
        )
        val cats = ParticipantProfileProjection.categories(traits)
        assertThat(cats.map { it.category })
            .containsExactly(TraitCategory.COMMUNICATION, TraitCategory.EMOTIONAL).inOrder()
    }

    @Test
    fun `categories drop an axis whose traits are all absent`() {
        val traits = ParticipantTraits(
            communication = CommunicationTraits(clarity = trait("Clarity", 70)),
            personality = PersonalityTraits(),
        )
        assertThat(ParticipantProfileProjection.categories(traits).map { it.category })
            .containsExactly(TraitCategory.COMMUNICATION)
    }

    @Test
    fun `categories of a null trait tree are empty`() {
        assertThat(ParticipantProfileProjection.categories(null)).isEmpty()
    }

    // --- confidencePercent: iOS shows Int(confidence*100) only when confidence > 0 ---

    @Test
    fun `confidencePercent is null when confidence is zero or negative`() {
        assertThat(ParticipantProfileProjection.profile(profile(confidence = 0.0)).confidencePercent).isNull()
        assertThat(ParticipantProfileProjection.profile(profile(confidence = -0.3)).confidencePercent).isNull()
    }

    @Test
    fun `confidencePercent floors a positive fraction into a percent`() {
        assertThat(ParticipantProfileProjection.profile(profile(confidence = 0.5)).confidencePercent).isEqualTo(50)
        assertThat(ParticipantProfileProjection.profile(profile(confidence = 1.0)).confidencePercent).isEqualTo(100)
    }

    @Test
    fun `confidencePercent clamps above one hundred`() {
        assertThat(ParticipantProfileProjection.profile(profile(confidence = 1.5)).confidencePercent).isEqualTo(100)
    }

    // --- name resolution: displayName > username > userId, blanks skipped ---

    @Test
    fun `name prefers a non-blank display name`() {
        assertThat(ParticipantProfileProjection.profile(profile(displayName = "Ada", username = "ada99")).name)
            .isEqualTo("Ada")
    }

    @Test
    fun `name falls back to username when the display name is blank`() {
        assertThat(ParticipantProfileProjection.profile(profile(displayName = "  ", username = "ada99")).name)
            .isEqualTo("ada99")
    }

    @Test
    fun `name falls back to the user id when both are blank`() {
        assertThat(ParticipantProfileProjection.profile(profile(userId = "u42", displayName = "", username = " ")).name)
            .isEqualTo("u42")
    }

    // --- text fields: trimmed, null when blank ---

    @Test
    fun `blank persona tone and vocabulary project to null`() {
        val v = ParticipantProfileProjection.profile(
            profile(personaSummary = "   ", tone = "", vocabularyLevel = "  "),
        )
        assertThat(v.personaSummary).isNull()
        assertThat(v.tone).isNull()
        assertThat(v.vocabularyLevel).isNull()
    }

    @Test
    fun `present persona tone and vocabulary are trimmed`() {
        val v = ParticipantProfileProjection.profile(
            profile(personaSummary = "  Curious mind ", tone = " warm ", vocabularyLevel = " rich "),
        )
        assertThat(v.personaSummary).isEqualTo("Curious mind")
        assertThat(v.tone).isEqualTo("warm")
        assertThat(v.vocabularyLevel).isEqualTo("rich")
    }

    // --- list fields: catchphrases (top 3, blanks dropped), topics (deduped, top 3),
    //     emojis (deduped, top 6) ---

    @Test
    fun `catchphrases drop blanks and cap at three`() {
        val v = ParticipantProfileProjection.profile(
            profile(catchphrases = listOf(" a ", "", "b", "c", "d")),
        )
        assertThat(v.catchphrases).containsExactly("a", "b", "c").inOrder()
    }

    @Test
    fun `topics are de-duplicated case-insensitively and capped at three`() {
        val v = ParticipantProfileProjection.profile(
            profile(topicsOfExpertise = listOf("Sport", "sport", "Music", "Art", "Food")),
        )
        assertThat(v.topics).containsExactly("Sport", "Music", "Art").inOrder()
    }

    @Test
    fun `common emojis are de-duplicated and capped at six`() {
        val v = ParticipantProfileProjection.profile(
            profile(commonEmojis = listOf("A", "A", "B", "C", "D", "E", "F", "G")),
        )
        assertThat(v.commonEmojis).containsExactly("A", "B", "C", "D", "E", "F").inOrder()
    }

    // --- profiles(): maps every profile, even a content-free one ---

    @Test
    fun `profiles map every entry including a content-free one`() {
        val analysis = ConversationAnalysis(
            conversationId = "c1",
            participantProfiles = listOf(
                profile(userId = "empty"),
                profile(userId = "u2", displayName = "Bob", confidence = 0.8),
            ),
        )
        val views = ParticipantProfileProjection.profiles(analysis)
        assertThat(views.map { it.name }).containsExactly("empty", "Bob").inOrder()
        assertThat(views[0].confidencePercent).isNull()
        assertThat(views[1].confidencePercent).isEqualTo(80)
    }

    @Test
    fun `profiles of an analysis with no participants are empty`() {
        assertThat(ParticipantProfileProjection.profiles(ConversationAnalysis(conversationId = "c1"))).isEmpty()
    }
}
