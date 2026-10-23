package me.meeshy.app.game

import android.content.Context
import android.content.res.Configuration
import org.robolectric.RuntimeEnvironment
import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.GameMaterial
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.TreasuryTierKey
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GameCopyTest {

    private fun resourcesIn(tag: String) = Locale.forLanguageTag(tag).let { locale ->
        val base = RuntimeEnvironment.getApplication() as Context
        val configuration = Configuration(base.resources.configuration).apply { setLocale(locale) }
        base.createConfigurationContext(configuration).resources
    }

    @Test
    fun `les paliers les rangs les matieres et les contenants se disent en francais`() {
        val res = resourcesIn("fr")
        assertThat(GameCopy.resolve(res, GameCopyLaws.tierName(LevelTierKey.Eclat))).isEqualTo("Éclat")
        assertThat(GameCopy.resolve(res, GameCopyLaws.tierOrdinal(LevelTierKey.Eclat))).isEqualTo("quatrième")
        assertThat(GameCopy.resolve(res, GameCopyLaws.rankName(GloryRank.Conteur))).isEqualTo("Conteur")
        assertThat(GameCopy.resolve(res, GameCopyLaws.materialName(GameMaterial.Gold))).isEqualTo("Or")
        assertThat(GameCopy.resolve(res, GameCopyLaws.treasuryName(TreasuryTierKey.Coffret))).isEqualTo("Coffret")
        assertThat(GameCopy.resolve(res, GameCopyLaws.treasuryHeld(TreasuryTierKey.Coffret))).isEqualTo("Ton Coffret")
    }

    @Test
    fun `le zero est singulier en francais et pluriel en anglais`() {
        assertThat(GameCopy.resolve(resourcesIn("fr"), GameCopyLaws.days(0))).isEqualTo("0 jour")
        assertThat(GameCopy.resolve(resourcesIn("en"), GameCopyLaws.days(0))).isEqualTo("0 days")
        assertThat(GameCopy.resolve(resourcesIn("en"), GameCopyLaws.days(1))).isEqualTo("1 day")
    }

    @Test
    fun `le nombre est formate par la locale avant d entrer dans la phrase`() {
        val french = GameCopy.resolve(resourcesIn("fr"), GameCopyLaws.days(1_221))
        assertThat(french.filter { it.isDigit() }).isEqualTo("1221")
        assertThat(french).endsWith("jours")
        assertThat(french).doesNotContain("1221")
    }

    @Test
    fun `aucune Meesh dit aucune et un nombre dit ses Meeshes`() {
        assertThat(GameCopy.resolve(resourcesIn("fr"), GameCopyLaws.meeshes(0))).isEqualTo("Aucune Meesh")
        assertThat(GameCopy.resolve(resourcesIn("fr"), GameCopyLaws.meeshes(3))).isEqualTo("3 Meeshes")
    }

    @Test
    fun `les etincelles suivent la categorie plurielle de la langue`() {
        assertThat(GameCopy.resolve(resourcesIn("fr"), GameCopyLaws.points(0))).isEqualTo("0 étincelle")
        assertThat(GameCopy.resolve(resourcesIn("fr"), GameCopyLaws.points(2))).isEqualTo("2 étincelles")
        assertThat(GameCopy.resolve(resourcesIn("en"), GameCopyLaws.points(1))).contains("1 spark")
    }

    @Test
    fun `une phrase imbriquee est resolue d abord`() {
        val text = GameCopyLaws.levelToNext(remaining = 624, nextLevel = 4)
        val sentence = GameCopy.resolve(resourcesIn("fr"), text)
        assertThat(sentence).contains("624")
        assertThat(sentence).contains("étincelles")
        assertThat(sentence).contains("4")
    }

    @Test
    fun `une duree calme joint les heures et les minutes sans secondes`() {
        val res = resourcesIn("fr")
        assertThat(GameCopy.resolve(res, GameCopyLaws.calmDuration(83 * 60.0))).isEqualTo("1 h 23 min")
        assertThat(GameCopy.resolve(res, GameCopyLaws.calmDuration(10.0))).isEqualTo("1 min")
        assertThat(GameCopy.resolve(res, GameCopyLaws.calmDuration((26 * 60 + 5) * 60.0))).isEqualTo("1 j 2 h")
    }

    @Test
    fun `une plage horaire est ecrite par la locale`() {
        val range = GameCopy.windowRange(
            startMillis = 14 * 3_600_000L,
            endMillis = 16 * 3_600_000L,
            locale = Locale.FRANCE,
            zone = java.time.ZoneOffset.UTC,
        )
        assertThat(range).isEqualTo("14:00 – 16:00")
        assertThat(GameCopy.clock(14 * 60, Locale.FRANCE)).isEqualTo("14:00")
    }

    @Test
    fun `un argument verbatim entre tel quel dans la phrase`() {
        val text = GameText.of(GameTextKey.RankGlory, GameTextArg.Verbatim("1 800"))
        assertThat(GameCopy.resolve(resourcesIn("fr"), text)).contains("1 800")
    }

    @Test
    fun `les titres de mission suivent le gabarit et l accord`() {
        val res = resourcesIn("fr")
        assertThat(GameMissionTitles.title(res, "send-voice", 1)).isEqualTo("Envoyer un message vocal")
        assertThat(GameMissionTitles.title(res, "send-voice", 3)).isEqualTo("Envoyer 3 messages vocaux")
        assertThat(GameMissionTitles.title(res, "duo-voice", 3)).isEqualTo("Envoyer 3 messages vocaux")
        assertThat(GameMissionTitles.title(res, "gabarit-du-futur", 3)).isEqualTo("Un acte du rêve")
    }

    @Test
    fun `chaque cle fermee a sa ressource dans la langue de base et en francais`() {
        listOf("en", "fr", "ar").forEach { tag ->
            val res = resourcesIn(tag)
            GameTextKey.entries.forEach { key ->
                val text = GameText(key, listOf(GameTextArg.Count(2), GameTextArg.Count(3), GameTextArg.Count(4)))
                if (key != GameTextKey.JoinedBySpace) {
                    assertThat(GameCopy.resolve(res, text)).isNotEmpty()
                }
            }
        }
    }
}
