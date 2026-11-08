package me.meeshy.sdk.model.game.photo

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.AchievementRarity
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.PhotoStepEmblem
import org.junit.Test

class GamePhotoAuthorPlateTest {

    private val alice = PhotoAuthor("alice", null)

    private fun style(subject: PlateSubject) = GamePhotoAuthorPlate.style(subject)

    @Test
    fun `un succes de rarete basse ou non servie se grave, en indigo ou au metal de sa rarete`() {
        assertThat(style(PlateSubject.Achievement(null))).isEqualTo(PlateStyle(PlateFamily.Achievement, PlateFinish.Engrave, PlateMetal.Indigo))
        assertThat(style(PlateSubject.Achievement(AchievementRarity.Common)).metal).isEqualTo(PlateMetal.Bronze)
        assertThat(style(PlateSubject.Achievement(AchievementRarity.Rare))).isEqualTo(
            PlateStyle(PlateFamily.Achievement, PlateFinish.Engrave, PlateMetal.Silver),
        )
    }

    @Test
    fun `un succes s'estampe a partir d'epique`() {
        assertThat(style(PlateSubject.Achievement(AchievementRarity.Epic))).isEqualTo(PlateStyle(PlateFamily.Achievement, PlateFinish.Emboss, PlateMetal.Platinum))
        assertThat(style(PlateSubject.Achievement(AchievementRarity.Legendary)).metal).isEqualTo(PlateMetal.Gold)
        assertThat(style(PlateSubject.Achievement(AchievementRarity.Mythic)).metal).isEqualTo(PlateMetal.Prism)
    }

    @Test
    fun `un rang s'estampe dans le metal de son blason`() {
        val expected = mapOf(
            GloryRank.Murmure to PlateMetal.Copper, GloryRank.Echo to PlateMetal.Copper,
            GloryRank.Voix to PlateMetal.Bronze, GloryRank.Conteur to PlateMetal.Bronze,
            GloryRank.Passeur to PlateMetal.Silver, GloryRank.Polyglotte to PlateMetal.Silver,
            GloryRank.Ambassadeur to PlateMetal.Gold, GloryRank.Orateur to PlateMetal.Gold,
            GloryRank.Oracle to PlateMetal.Platinum, GloryRank.Legende to PlateMetal.Obsidian, GloryRank.Mythe to PlateMetal.Prism,
        )
        GloryRank.entries.forEach { rank ->
            assertThat(style(PlateSubject.Rank(rank))).isEqualTo(PlateStyle(PlateFamily.Rank, PlateFinish.Emboss, expected.getValue(rank)))
        }
    }

    @Test
    fun `une mission accomplie se gratte sur l'obsidienne`() {
        assertThat(style(PlateSubject.Mission)).isEqualTo(PlateStyle(PlateFamily.Mission, PlateFinish.Scratch, PlateMetal.Obsidian))
    }

    @Test
    fun `seul l'emblème d'un rang a une plaque parmi les etapes`() {
        assertThat(PlateSubject.of(PhotoStepEmblem.Rank(GloryRank.Voix, 2))).isEqualTo(PlateSubject.Rank(GloryRank.Voix))
        assertThat(PlateSubject.of(PhotoStepEmblem.Start)).isNull()
        assertThat(PlateSubject.of(PhotoStepEmblem.LevelHundred)).isNull()
    }

    @Test
    fun `le pseudo est coupe a seize graphemes dont l'ellipse`() {
        assertThat(GamePhotoAuthorPlate.engravedHandle("alice")).isEqualTo("@alice")
        assertThat(GamePhotoAuthorPlate.engravedHandle("@alice")).isEqualTo("@alice")
        assertThat(GamePhotoAuthorPlate.engravedHandle("a".repeat(16))).isEqualTo("@" + "a".repeat(16))
        assertThat(GamePhotoAuthorPlate.engravedHandle("a".repeat(17))).isEqualTo("@" + "a".repeat(15) + "…")
    }

    @Test
    fun `la coupe compte des graphemes, jamais une famille d'emoji coupee en deux`() {
        val family = "👨‍👩‍👧"
        val cut = GamePhotoAuthorPlate.engravedHandle(family.repeat(20))
        assertThat(cut).isEqualTo("@" + family.repeat(15) + "…")
    }

    @Test
    fun `le pseudo est normalise NFC`() {
        assertThat(GamePhotoAuthorPlate.engravedHandle("élise")).isEqualTo("@élise")
    }

    @Test
    fun `le monogramme prend les deux premieres lettres ou chiffres en capitales`() {
        assertThat(GamePhotoAuthorPlate.monogram("@alice")).isEqualTo("AL")
        assertThat(GamePhotoAuthorPlate.monogram("_-7x")).isEqualTo("7X")
    }

    @Test
    fun `la plaque grave le pseudo public avec la photo de profil`() {
        val plate = GamePhotoAuthorPlate.plate(PlateSubject.Mission, PhotoAuthor("alice", "https://x/a.png"))!!
        assertThat(plate.name).isEqualTo("@alice")
        assertThat(plate.avatar).isEqualTo("https://x/a.png")
        assertThat(plate.family).isEqualTo(PlateFamily.Mission)
    }

    @Test
    fun `sans sujet ou sans pseudo, il n'y a pas de plaque`() {
        assertThat(GamePhotoAuthorPlate.plate(null, alice)).isNull()
        assertThat(GamePhotoAuthorPlate.plate(PlateSubject.Mission, null)).isNull()
        assertThat(GamePhotoAuthorPlate.plate(PlateSubject.Mission, PhotoAuthor("  @ ", null))).isNull()
    }

    @Test
    fun `un invite ou un compte sans pseudo public n'a pas d'auteur`() {
        assertThat(GamePhotoAuthorPlate.author("guest", isAnonymous = true, avatar = null)).isNull()
        assertThat(GamePhotoAuthorPlate.author(null, isAnonymous = false, avatar = null)).isNull()
        assertThat(GamePhotoAuthorPlate.author(" ", isAnonymous = false, avatar = null)).isNull()
        assertThat(GamePhotoAuthorPlate.author("alice", isAnonymous = false, avatar = "  ")).isEqualTo(PhotoAuthor("alice", null))
        assertThat(GamePhotoAuthorPlate.author("alice", isAnonymous = false, avatar = " u ")).isEqualTo(PhotoAuthor("alice", "u"))
    }
}
