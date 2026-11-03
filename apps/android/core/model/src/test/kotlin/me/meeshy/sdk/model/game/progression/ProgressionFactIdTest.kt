package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.EngagementAxisFamily
import org.junit.Test

class ProgressionFactIdTest {

    @Test
    fun `chaque fait porte le nom de fil d iOS et du web`() {
        assertThat(ProgressionFactId.of(ConceptFact.LevelNext).wire).isEqualTo("level_next")
        assertThat(ProgressionFactId.of(ConceptFact.SparksPocket).wire).isEqualTo("sparks_pocket")
        assertThat(ProgressionFactId.of(ConceptFact.CanMint).wire).isEqualTo("can_mint")
        assertThat(ProgressionFactId.of(ConceptFact.LeagueFriendsDoor).wire).isEqualTo("league_friends_door")
        assertThat(ProgressionFactId.of(ConceptFact.Level).wire).isEqualTo("level")
    }

    @Test
    fun `obtenu et reste se disent par concept`() {
        assertThat(ProgressionFactId.of(ConceptFact.Earned, ProgressionConcept.Badges).wire).isEqualTo("badges_earned")
        assertThat(ProgressionFactId.of(ConceptFact.Left, ProgressionConcept.Defis).wire).isEqualTo("defis_left")
        assertThat(ProgressionFactId.earned(ProgressionConcept.Succes).wire).isEqualTo("succes_earned")
        assertThat(ProgressionFactId.earned(ProgressionConcept.Badges))
            .isNotEqualTo(ProgressionFactId.earned(ProgressionConcept.Defis))
    }

    @Test
    fun `une famille de medailles a son fait`() {
        assertThat(ProgressionFactId.badgeFamily(EngagementAxisFamily.SOCIAL).wire).isEqualTo("badge_family_social")
    }

    @Test
    fun `un doublon se detecte par identite jamais par texte`() {
        val rendered = listOf(
            ProgressionFactId.of(ConceptFact.Streak),
            ProgressionFactId.of(ConceptFact.Glory),
            ProgressionFactId("streak"),
        )

        assertThat(ProgressionFactIds.duplicates(rendered)).containsExactly(ProgressionFactId("streak"))
        assertThat(ProgressionFactIds.duplicates(rendered.take(2))).isEmpty()
    }

    @Test
    fun `deux phrases a la suite additionnent leurs faits chacun une fois`() {
        val a = listOf(ProgressionFactId("meesh_held"), ProgressionFactId("minted"))
        val b = listOf(ProgressionFactId("minted"), ProgressionFactId("mint_next"))

        assertThat(ProgressionFactIds.then(a, b).map { it.wire }).containsExactly("meesh_held", "minted", "mint_next").inOrder()
    }
}
