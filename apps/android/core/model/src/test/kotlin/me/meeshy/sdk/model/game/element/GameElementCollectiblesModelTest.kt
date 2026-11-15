package me.meeshy.sdk.model.game.element

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameMaterial
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextForm
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueZone
import org.junit.Test

/** Les briques que les constructeurs des collections demandent au cœur : noms hôtes, mois de visiteur, ligue, emblèmes. */
class GameElementCollectiblesModelTest {

    @Test
    fun `un nom resolu par l hote se dit tel quel, sans ressource`() {
        val text = GameText.verbatim("Renaissance 2")

        assertThat(text.key.form).isEqualTo(GameTextForm.Join)
        assertThat(text.args).containsExactly(GameTextArg.Verbatim("Renaissance 2"))
    }

    @Test
    fun `un nombre seul reste un entier jusqu a la resolution`() {
        assertThat(GameText.counted(1221).args).containsExactly(GameTextArg.Count(1221))
    }

    @Test
    fun `chaque ligue et chaque zone ont leur nom`() {
        val names = LeagueKey.entries.map { GameCopyLaws.leagueName(it).key }
        val zones = LeagueZone.entries.map { GameCopyLaws.leagueZoneName(it).key }

        assertThat(names.toSet()).hasSize(LeagueKey.entries.size)
        assertThat(names.first()).isEqualTo(GameTextKey.LeagueNameQuartz)
        assertThat(zones).containsExactly(GameTextKey.LeagueZonePromotion, GameTextKey.LeagueZoneSafe, GameTextKey.LeagueZoneRelegation).inOrder()
    }

    @Test
    fun `un obtenu sans phrase propre garde sa date servie, avec une phrase il la dit`() {
        val plain = GameElementStatus.Obtained("2026-10-03T08:00:00.000Z")
        val month = GameElementStatus.Obtained(null, GameText.of(GameTextKey.DetailEarnedOn, GameTextArg.Month("2026-10")))

        assertThat(plain.phrase).isNull()
        assertThat(month.reachedAt).isNull()
        assertThat(month.phrase?.args).containsExactly(GameTextArg.Month("2026-10"))
    }

    @Test
    fun `une collection a un emblème par famille et la matiere se lit sur lui`() {
        val detail = GameElementDetail(
            kind = GameElementKind.Trophy,
            key = "k",
            emblem = GameElementEmblem.Trophy(GameMaterial.Gold),
            name = GameText.verbatim("Coupe"),
            status = GameElementStatus.Obtained(null),
            concept = me.meeshy.sdk.model.game.progression.ProgressionConcept.Showcase,
        )

        assertThat((detail.emblem as GameElementEmblem.Trophy).material).isEqualTo(GameMaterial.Gold)
        assertThat(detail.id).isEqualTo("trophy:k")
        assertThat(detail.isObtained).isTrue()
    }
}
