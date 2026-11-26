package me.meeshy.app.game

import android.content.Context
import android.content.res.Configuration
import org.robolectric.RuntimeEnvironment
import com.google.common.truth.Truth.assertThat
import java.util.Locale
import me.meeshy.sdk.model.game.GameCopyLaws
import me.meeshy.sdk.model.game.FlamePauseSection
import me.meeshy.sdk.model.game.GameEffortRelight
import me.meeshy.sdk.model.game.GameFlamePause
import me.meeshy.sdk.model.game.GameMaterial
import me.meeshy.sdk.model.game.GameText
import me.meeshy.sdk.model.game.GameTextArg
import me.meeshy.sdk.model.game.GameTextKey
import me.meeshy.sdk.model.game.GloryRank
import me.meeshy.sdk.model.game.LevelTierKey
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.GameNumberFormat
import me.meeshy.app.game.pages.dayMonthLabel
import me.meeshy.app.game.pages.weekdayLabel
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
    fun `les etincelles d un grand nombre portent le separateur de milliers de la langue`() {
        val french = Locale.forLanguageTag("fr")
        val grouped = GameNumberFormat.formatCount(103_571, french)
        assertThat(grouped).isNotEqualTo("103571")
        assertThat(GameCopy.resolve(resourcesIn("fr"), GameCopyLaws.points(103_571))).isEqualTo("$grouped étincelles")
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
                val text = GameText(key, (2..7).map { GameTextArg.Count(it) })
                if (key != GameTextKey.JoinedBySpace) {
                    assertThat(GameCopy.resolve(res, text)).isNotEmpty()
                }
            }
        }
    }

    @Test
    fun `un jour et un decimal s ecrivent par la locale`() {
        assertThat(GameCopy.day("2026-11-01", Locale.FRANCE)).contains("2026")
        assertThat(GameCopy.day("pas-un-jour", Locale.FRANCE)).isEqualTo("pas-un-jour")
        assertThat(GameCopy.decimal(1.25, Locale.FRANCE)).isEqualTo("1,25")
        assertThat(GameCopy.decimal(2.0, Locale.US)).isEqualTo("2")
    }

    @Test
    fun `une serie se dit au pluriel de la locale et la carte du Voyage date son ouverture`() {
        val record = GameText.of(GameTextKey.StreakRecord, GameTextArg.Count(12))
        assertThat(GameCopy.resolve(resourcesIn("fr"), record)).contains("12")
        val upcoming = GameText.of(GameTextKey.DoorSeasonUpcoming, GameTextArg.Day("2026-11-01"))
        assertThat(GameCopy.resolve(resourcesIn("fr"), upcoming)).contains("2026")
    }

    @Test
    fun `le rallumage par l effort dit les reves qui manquent et les jours qui reviennent`() {
        val effort = GameEffortRelight(lostDays = 12, dreamsDone = 1, dreamsNeeded = 2, closesOn = "2026-10-21", daysLeft = 1)
        val fr = resourcesIn("fr")
        assertThat(GameCopy.resolve(fr, GameCopyLaws.effortRelight(effort)))
            .isEqualTo("Encore 1 rêve complet d’ici demain soir et ta Flamme de 12 jours revient, sans payer.")
        assertThat(GameCopy.resolve(fr, GameCopyLaws.effortRelight(effort.copy(dreamsDone = 0, daysLeft = 0))))
            .isEqualTo("Encore 2 rêves complets aujourd’hui et ta Flamme de 12 jours revient, sans payer.")
        assertThat(GameCopy.resolve(resourcesIn("en"), GameCopyLaws.effortRelight(effort)))
            .isEqualTo("Just 1 full dream more by tomorrow night and your Flame comes back with its 12 days, without paying.")
    }

    @Test
    fun `la Flamme en veille se dit avec sa duree, son dernier jour et la raison du refus`() {
        val fr = resourcesIn("fr")
        assertThat(GameCopy.resolve(fr, GameCopyLaws.flamePauseAction(3))).isEqualTo("Mettre en veille · 3 jours")
        assertThat(GameCopy.resolve(fr, GameCopyLaws.flamePauseIntro())).contains("jusqu’à 7 jours, une fois par trimestre")
        val day = weekdayLabel("2026-10-12", Locale.FRENCH)
        assertThat(day).isEqualTo("lundi 12 octobre")
        val pause = GameFlamePause(from = "2026-10-06", until = "2026-10-12")
        assertThat(GameCopy.resolve(fr, GameCopyLaws.flamePaused(FlamePauseSection.Paused(pause, startsTomorrow = false), day)))
            .isEqualTo("Ta Flamme est en veille jusqu’au lundi 12 octobre.")
        assertThat(GameCopy.resolve(fr, GameCopyLaws.flamePaused(FlamePauseSection.Paused(pause, startsTomorrow = true), day)))
            .isEqualTo("Ta Flamme se met en veille demain, jusqu’au lundi 12 octobre.")
        assertThat(GameCopy.resolve(fr, GameCopyLaws.flamePauseRefusal("quarterly-limit")!!))
            .isEqualTo("Ta Flamme a déjà eu sa veille ce trimestre.")
        assertThat(GameCopy.resolve(resourcesIn("en"), GameCopyLaws.flamePauseAction(1))).isEqualTo("Let it rest · 1 day")
        assertThat(weekdayLabel("pas-un-jour", Locale.FRENCH)).isEqualTo("pas-un-jour")
    }

    @Test
    fun `le trimestre pris dit des quand la prochaine veille sera possible, sans le jour de la semaine`() {
        val day = dayMonthLabel("2027-01-01", Locale.FRENCH)
        assertThat(day).isEqualTo("1 janvier")
        assertThat(GameCopy.resolve(resourcesIn("fr"), GameCopyLaws.flamePauseNext(day)))
            .isEqualTo("Ta prochaine veille sera possible dès le 1 janvier.")
        val english = dayMonthLabel("2027-01-01", Locale.ENGLISH)
        assertThat(GameCopy.resolve(resourcesIn("en"), GameCopyLaws.flamePauseNext(english)))
            .isEqualTo("Your Flame can rest again from January 1.")
        assertThat(dayMonthLabel("pas-un-jour", Locale.FRENCH)).isEqualTo("pas-un-jour")
    }
}
