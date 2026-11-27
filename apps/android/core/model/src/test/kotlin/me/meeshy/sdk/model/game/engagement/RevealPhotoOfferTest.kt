package me.meeshy.sdk.model.game.engagement

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GameRarityEntry
import org.junit.Test

class RevealPhotoOfferTest {

    private val achievement = EngagementReveal.Achievement(EngagementAchievementKey.FIRST_VOICE)
    private val composed = EngagementReveal.ComposedAchievement(AchievementCatalog.families.first { it.id == "message.send.count" }, 100)
    private val epic = GameRarityEntry(AchievementRarity.Epic, holders = 4000, population = 100_000)
    private val consultation = RevealOccasion.Consultation(unlocked = true, reachedAt = null)

    private fun offer(reveal: EngagementReveal, occasion: RevealOccasion = RevealOccasion.Celebration, offers: Boolean = true, entry: GameRarityEntry? = null) =
        RevealPhotoOffer.of(reveal, occasion, offersPhotos = offers, title = "Titre", entry = entry)

    @Test
    fun `un succes celebre se propose en carte, sous l'identite du succes`() {
        val moment = offer(achievement)!!

        assertThat(moment.id).isEqualTo("achievement:achievement.first_voice")
        assertThat(moment.title).isEqualTo("Titre")
        assertThat(offer(composed)!!.id).isEqualTo(composed.id)
    }

    @Test
    fun `un badge et un niveau ne se photographient pas`() {
        listOf(EngagementReveal.Badge("content.text_message", 100), EngagementReveal.Level(2)).forEach {
            assertThat(offer(it)).isNull()
        }
    }

    @Test
    fun `une Flamme de 7, 30 ou 100 jours se propose en carte, sous l'identite du carnet`() {
        val moment = offer(EngagementReveal.Streak(30), entry = epic)!!

        assertThat(moment.id).isEqualTo("flame:30")
        assertThat(moment.flameDays).isEqualTo(30)
        assertThat(moment.rarity).isNull()
        assertThat(offer(EngagementReveal.Streak(7))!!.id).isEqualTo("flame:7")
        assertThat(offer(EngagementReveal.Streak(100))!!.id).isEqualTo("flame:100")
        assertThat(offer(achievement)!!.flameDays).isNull()
    }

    @Test
    fun `une Flamme qui n'est pas une etape du carnet ne propose rien`() {
        listOf(3, 14, 60).forEach { assertThat(offer(EngagementReveal.Streak(it))).isNull() }
    }

    @Test
    fun `une Flamme consultee, ou sous Jeu masque, ne propose rien`() {
        assertThat(offer(EngagementReveal.Streak(30), occasion = consultation)).isNull()
        assertThat(offer(EngagementReveal.Streak(30), offers = false)).isNull()
    }

    @Test
    fun `une consultation ne propose rien, ni Jeu masque ni Celebrations coupees`() {
        assertThat(offer(achievement, occasion = consultation)).isNull()
        assertThat(offer(achievement, offers = false)).isNull()
    }

    @Test
    fun `la carte ne porte que la rarete qu'on a le droit de montrer`() {
        assertThat(offer(achievement, entry = epic)!!.rarity).isEqualTo(AchievementRarity.Epic)
        assertThat(offer(achievement, entry = epic.copy(holders = 3))!!.rarity).isNull()
        assertThat(offer(achievement, entry = null)!!.rarity).isNull()
    }

    @Test
    fun `le nom du fichier partage ne laisse passer que des caracteres sans danger`() {
        val name = offer(composed)!!.fileName

        assertThat(name).endsWith(".png")
        assertThat(name).matches("[A-Za-z0-9._-]+")
    }
}
