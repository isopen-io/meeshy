package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import me.meeshy.sdk.model.game.GameBlockFixtures.block
import me.meeshy.sdk.model.game.GameBlockFixtures.json
import org.junit.Test

/**
 * Le registre des moments photo (#20651, tranche Android de #20643, iso de `GamePhotoRegistryTests` iOS) : l'extension
 * `game.photo` du bloc `game`, lue comme `gamePhotoBlockSchema` (`packages/shared/types/game-photo.ts`, témoins
 * `contract-photo.test.ts`).
 */
class GamePhotoRegistryTest {

    private val row =
        """{"stepId":"rank:ambassadeur:4","detectedAt":"2026-10-11T08:00:00.000Z","presentedAt":null,"notifiedAt":null,"keptAt":null}"""

    private fun photo(
        atmosphere: String = "\"egypte\"",
        invitations: String = "\"major\"",
        baseline: String =
            """{"rank":"ambassadeur","division":4,"levelRecord":30,"prestige":0,"minted":12,"treasuryTier":"coffret","flameRecord":9}""",
        treasuryPeakTier: String = "\"coffre\"",
        moments: String = "[$row]",
    ): String =
        """{"atmosphere":$atmosphere,"invitations":$invitations,"baselineAt":"2026-10-11T08:00:00.000Z","baseline":$baseline,""" +
            """"treasuryPeakTier":$treasuryPeakTier,"moments":$moments}"""

    private fun game(photo: String?): GameBlock =
        GameBlockParser.parse(block(overrides = mapOf("photo" to photo?.let { Json.parseToJsonElement(it) })))!!

    private fun registry(photo: String): GamePhotoBlock = game(photo).photo!!

    @Test
    fun `le bloc se lit tel que la passerelle le sert`() {
        val photo = registry(photo())

        assertThat(photo.atmosphere).isEqualTo("egypte")
        assertThat(photo.invitations).isEqualTo(PhotoInvitationsSetting.Major)
        assertThat(photo.baselineAt).isEqualTo("2026-10-11T08:00:00.000Z")
        assertThat(photo.baselineStanding).isEqualTo(
            PhotoCatchUpStanding(
                rank = GloryRank.Ambassadeur, division = 4, levelRecord = 30, prestige = 0, minted = 12,
                treasuryTier = TreasuryTierKey.Coffret, flameRecord = 9,
            ),
        )
        assertThat(photo.treasuryPeakTier).isEqualTo(TreasuryTierKey.Coffre)
        assertThat(photo.moments).containsExactly(
            GamePhotoMomentRow(stepId = "rank:ambassadeur:4", detectedAt = "2026-10-11T08:00:00.000Z"),
        )
    }

    @Test
    fun `absent d'un serveur anterieur rien ne tombe`() {
        val game = game(photo = null)

        assertThat(game.photo).isNull()
        assertThat(game.guideSeen).containsExactly("welcome")
    }

    @Test
    fun `illisible il tombe seul et le reste du jeu reste lu`() {
        val game = game(photo(invitations = "\"souvent\""))
        assertThat(game.photo).isNull()
        assertThat(game.guideSeen).containsExactly("welcome")

        assertThat(game(photo(moments = """[{"stepId":"une étape"}]""")).photo).isNull()
        val tooMany = List(GamePhotoRegistry.SERVED_MAX + 1) { row }.joinToString(",", "[", "]")
        assertThat(game(photo(moments = tooMany)).photo).isNull()
    }

    @Test
    fun `une ligne d'avant le signal immortalisee se lit sans keptAt`() {
        val photo = registry(
            photo(moments = """[{"stepId":"start","detectedAt":null,"presentedAt":"2026-10-11T08:00:00.000Z","notifiedAt":null}]"""),
        )

        assertThat(photo.moments).containsExactly(GamePhotoMomentRow(stepId = "start", presentedAt = "2026-10-11T08:00:00.000Z"))
    }

    @Test
    fun `une ligne de base ou un palier illisibles se lisent aucun sans emporter le reste`() {
        val photo = registry(photo(baseline = """{"rank":3}""", treasuryPeakTier = "\"galion\""))
        assertThat(photo.baseline).isNull()
        assertThat(photo.treasuryPeakTier).isNull()
        assertThat(photo.atmosphere).isEqualTo("egypte")

        val unknownRank =
            """{"rank":"astre","division":4,"levelRecord":30,"prestige":0,"minted":12,"treasuryTier":null,"flameRecord":9}"""
        assertThat(registry(photo(baseline = unknownRank)).baseline).isNull()
        val badDivision =
            """{"rank":"voix","division":6,"levelRecord":30,"prestige":0,"minted":12,"treasuryTier":null,"flameRecord":9}"""
        assertThat(registry(photo(baseline = badDivision)).baseline).isNull()
        assertThat(registry(photo(baseline = "null")).baseline).isNull()
    }

    @Test
    fun `le Mythe se lit sans division`() {
        val photo = registry(
            photo(
                baseline = """{"rank":"mythe","division":null,"levelRecord":120,"prestige":1,"minted":40,"treasuryTier":null,""" +
                    """"flameRecord":30,"pastCycleRecords":[100]}""",
            ),
        )

        assertThat(photo.baselineStanding).isEqualTo(
            PhotoCatchUpStanding(
                rank = GloryRank.Mythe, division = null, levelRecord = 120, prestige = 1, minted = 40,
                treasuryTier = null, flameRecord = 30, pastCycleRecords = listOf(100),
            ),
        )
    }

    @Test
    fun `le reglage d'invitation se lit dans les mots de la loi des alertes`() {
        assertThat(PhotoInvitationsSetting.Every.policy).isEqualTo(PhotoAlertPolicy.Standard)
        assertThat(PhotoInvitationsSetting.Major.policy.invitations).isEqualTo(PhotoAlertPolicy.Invitations.BigMoments)
        assertThat(PhotoInvitationsSetting.Never.policy.invitations).isEqualTo(PhotoAlertPolicy.Invitations.Never)
        assertThat(PhotoInvitationsSetting.Major.policy.inApp).isEqualTo(PhotoAlertPolicy.Standard.inApp)
        assertThat(registry(photo()).policy.invitations).isEqualTo(PhotoAlertPolicy.Invitations.BigMoments)
    }

    @Test
    fun `une etape presentee notifiee ou immortalisee ne s'annonce plus et seules les immortalisees sont gardees`() {
        val moments = listOf(
            """{"stepId":"rank:voix:3","detectedAt":null,"presentedAt":"2026-10-11T08:00:00.000Z","notifiedAt":null,"keptAt":null}""",
            """{"stepId":"meesh:10","detectedAt":null,"presentedAt":null,"notifiedAt":"2026-10-11T09:00:00.000Z","keptAt":null}""",
            """{"stepId":"flame:7","detectedAt":null,"presentedAt":null,"notifiedAt":null,"keptAt":"2026-10-12T08:00:00.000Z"}""",
            """{"stepId":"level:40","detectedAt":"2026-10-12T08:00:00.000Z","presentedAt":null,"notifiedAt":null,"keptAt":null}""",
        ).joinToString(",", "[", "]")

        val photo = registry(photo(moments = moments))

        assertThat(photo.presentedStepIds).containsExactly("rank:voix:3", "meesh:10", "flame:7").inOrder()
        assertThat(photo.keptStepIds).containsExactly("flame:7")
    }

    @Test
    fun `le bloc relu du cache est le bloc servi`() {
        val game = game(photo())

        val encoded = json.encodeToString(game)
        val again = GameBlockParser.parse(encoded)!!

        assertThat(again.photo).isNotNull()
        assertThat(again.photo).isEqualTo(game.photo)
        assertThat((json.parseToJsonElement(encoded) as JsonObject).containsKey("photo")).isTrue()
    }

    @Test
    fun `le relais optimiste garde le registre`() {
        val game = game(photo())

        assertThat(game.replacing(guideSeen = listOf("welcome", "photo")).photo).isEqualTo(game.photo)
    }

    @Test
    fun `l'accuse part par lots de 64 etapes valides sans doublon dans l'ordre`() {
        assertThat(GamePhotoRegistry.presentedBatches(emptyList())).isEmpty()
        assertThat(GamePhotoRegistry.presentedBatches(listOf("rank:voix:3", "meesh:10", "rank:voix:3", "une étape", "")))
            .containsExactly(listOf("rank:voix:3", "meesh:10"))
        val many = (1..130).map { "meesh:$it" }

        val batches = GamePhotoRegistry.presentedBatches(many)

        assertThat(batches.map { it.size }).containsExactly(64, 64, 2).inOrder()
        assertThat(batches.flatten()).isEqualTo(many)
    }

    @Test
    fun `une identite d'etape suit PHOTO_STEP_ID_PATTERN`() {
        assertThat(GamePhotoRegistry.isStepId("rank:mythe:0")).isTrue()
        assertThat(GamePhotoRegistry.isStepId("day:2026-10-11")).isTrue()
        assertThat(GamePhotoRegistry.isStepId("a".repeat(96))).isTrue()
        assertThat(GamePhotoRegistry.isStepId("a".repeat(97))).isFalse()
        assertThat(GamePhotoRegistry.isStepId(":rank")).isFalse()
        assertThat(GamePhotoRegistry.isStepId("rank voix")).isFalse()
    }
}
