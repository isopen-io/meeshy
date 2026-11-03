package me.meeshy.sdk.model.game.progression

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.engagement.ApiEngagementProgress
import me.meeshy.sdk.model.game.engagement.EngagementProgressResolver
import org.junit.Test

class ProgressionConceptTest {

    private fun served(source: ProgressionConceptSource) = ProgressionConcepts.served(source).map { it.wire }

    @Test
    fun `les quinze concepts sont dans l ordre de l ecran`() {
        assertThat(ProgressionConcept.entries.map { it.wire }).containsExactly(
            "level", "points", "meesh", "glory", "flame", "missions", "league", "season", "prestige",
            "elans", "badges", "defis", "succes", "showcase", "atlas",
        ).inOrder()
    }

    @Test
    fun `devant un ancien serveur seuls les cinq concepts toujours servis restent`() {
        assertThat(served(ProgressionConceptSource())).containsExactly("level", "flame", "elans", "badges", "succes").inOrder()
    }

    @Test
    fun `le solde seul ouvre meesh et la carte d atteignabilite ouvre defis`() {
        assertThat(served(ProgressionConceptSource(meesh = true))).contains("meesh")
        assertThat(served(ProgressionConceptSource(meesh = true))).doesNotContain("points")
        assertThat(served(ProgressionConceptSource(defis = true))).contains("defis")
    }

    @Test
    fun `le bloc game ouvre points meesh glory missions et rien de plus`() {
        assertThat(served(ProgressionConceptSource(game = true))).containsExactly(
            "level", "points", "meesh", "glory", "flame", "missions", "elans", "badges", "succes",
        ).inOrder()
    }

    @Test
    fun `une extension sans le bloc game qui la porte est ignoree`() {
        val progress = EngagementProgressResolver.resolve(ApiEngagementProgress.empty).copy(achievementSections = emptyList())

        assertThat(ProgressionConcepts.served(progress, null).map { it.wire }).containsExactly("level", "flame", "elans", "badges", "succes").inOrder()
    }

    @Test
    fun `chaque extension servie ouvre son concept et la saison est servie meme nulle`() {
        val all = served(ProgressionConceptSource(game = true, league = true, season = true, prestige = true, trophies = true, atlas = true, defis = true))

        assertThat(all).containsExactlyElementsIn(ProgressionConcept.entries.map { it.wire }).inOrder()
        assertThat(served(ProgressionConceptSource(game = true, season = true))).contains("season")
    }
}
