package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.game.GameLawVectors.boolValue
import me.meeshy.sdk.model.game.GameLawVectors.doubleValue
import me.meeshy.sdk.model.game.GameLawVectors.intValue
import me.meeshy.sdk.model.game.GameLawVectors.text
import org.junit.Test

class GameFlameTest {

    @Test
    fun `les cinq formes tombent aux seuils 1, 7, 30, 100 et 365`() {
        assertThat(GameFlameLaw.form(0)).isNull()
        assertThat(GameFlameLaw.form(1)).isEqualTo(FlameFormKey.Braise)
        assertThat(GameFlameLaw.form(6)).isEqualTo(FlameFormKey.Braise)
        assertThat(GameFlameLaw.form(7)).isEqualTo(FlameFormKey.Flamme)
        assertThat(GameFlameLaw.form(30)).isEqualTo(FlameFormKey.Brasier)
        assertThat(GameFlameLaw.form(100)).isEqualTo(FlameFormKey.Astre)
        assertThat(GameFlameLaw.form(365)).isEqualTo(FlameFormKey.Soleil)
    }

    @Test
    fun `le bonus est de 2 pour cent par jour plafonne a 50`() {
        assertThat(GameFlameLaw.bonusPercent(0)).isEqualTo(0)
        assertThat(GameFlameLaw.bonusPercent(10)).isEqualTo(20)
        assertThat(GameFlameLaw.bonusPercent(25)).isEqualTo(50)
        assertThat(GameFlameLaw.bonusPercent(400)).isEqualTo(50)
        assertThat(GameFlameLaw.bonus(5)).isEqualTo(0.1)
    }

    @Test
    fun `un gel coute une Meesh et s'arrete a deux en reserve`() {
        assertThat(GameFlameLaw.canBuyFreeze(0, 1)).isNull()
        assertThat(GameFlameLaw.canBuyFreeze(1, 5)).isNull()
        assertThat(GameFlameLaw.canBuyFreeze(2, 5)).isEqualTo(FreezeRefusal.AtMaximum)
        assertThat(GameFlameLaw.canBuyFreeze(0, 0)).isEqualTo(FreezeRefusal.InsufficientBalance)
    }

    @Test
    fun `les transitions de la serie`() {
        assertThat(GameFlameLaw.advance(null, "2026-10-05", 0, 0).outcome).isEqualTo(FlameOutcome.Started)
        assertThat(GameFlameLaw.advance("2026-10-05", "2026-10-05", 4, 1)).isEqualTo(FlameTransition(FlameOutcome.SameDay, 4, 1, 0, 0, 0))
        assertThat(GameFlameLaw.advance("2026-10-04", "2026-10-05", 4, 1)).isEqualTo(FlameTransition(FlameOutcome.Continued, 5, 1, 0, 0, 0))
        assertThat(GameFlameLaw.advance("2026-10-03", "2026-10-05", 4, 1)).isEqualTo(FlameTransition(FlameOutcome.Protected, 5, 0, 1, 1, 0))
    }

    @Test
    fun `des gels qui ne couvrent pas tous les jours manques sont gardes et la flamme s'eteint`() {
        val t = GameFlameLaw.advance("2026-10-01", "2026-10-05", 12, 2)
        assertThat(t).isEqualTo(FlameTransition(FlameOutcome.Broken, 1, 2, 0, 3, 12))
    }

    @Test
    fun `l'etat a l'ouverture`() {
        assertThat(GameFlameLaw.status(null, "2026-10-05", 0, 0)).isEqualTo(FlameStatus.None)
        assertThat(GameFlameLaw.status("2026-10-05", "2026-10-05", 8, 0)).isEqualTo(FlameStatus.Lit)
        assertThat(GameFlameLaw.status("2026-10-04", "2026-10-05", 8, 0)).isEqualTo(FlameStatus.AtRisk)
        assertThat(GameFlameLaw.status("2026-10-03", "2026-10-05", 8, 1)).isEqualTo(FlameStatus.Covered)
        assertThat(GameFlameLaw.status("2026-10-03", "2026-10-05", 8, 0)).isEqualTo(FlameStatus.Out)
    }

    @Test
    fun `le rallumage tient dans la fenetre de 48 h en jours calendaires`() {
        fun relight(today: String, last: String? = null, balance: Int = 3) = GameFlameLaw.canRelight("2026-10-02", today, 12, last, balance)
        assertThat(relight("2026-10-03").reason).isEqualTo(RelightRefusal.NotExtinguished)
        assertThat(relight("2026-10-04").allowed).isTrue()
        assertThat(relight("2026-10-05").allowed).isTrue()
        assertThat(relight("2026-10-06").reason).isEqualTo(RelightRefusal.WindowClosed)
    }

    @Test
    fun `le rallumage est refuse sans serie, une fois par mois, sans les 3 Meesh`() {
        assertThat(GameFlameLaw.canRelight(null, "2026-10-04", 12, null, 3).reason).isEqualTo(RelightRefusal.NoStreak)
        assertThat(GameFlameLaw.canRelight("2026-10-02", "2026-10-04", 0, null, 3).reason).isEqualTo(RelightRefusal.NoStreak)
        assertThat(GameFlameLaw.canRelight("2026-10-02", "2026-10-04", 12, "2026-10-01", 3).reason).isEqualTo(RelightRefusal.MonthlyLimit)
        assertThat(GameFlameLaw.canRelight("2026-10-02", "2026-10-04", 12, "2026-09-30", 3).allowed).isTrue()
        assertThat(GameFlameLaw.canRelight("2026-10-02", "2026-10-04", 12, null, 2).reason).isEqualTo(RelightRefusal.InsufficientBalance)
        assertThat(GameFlameLaw.canRelight("2026-10-02", "2026-10-04", 12, null, 3).price).isEqualTo(3)
    }

    @Test
    fun `le rallumage rend la serie d'avant la rupture, la veille`() {
        assertThat(GameFlameLaw.relight("2026-10-04", 12)).isEqualTo(FlameRelit(12, "2026-10-03"))
    }

    @Test
    fun `les vecteurs partages de la flamme sont rejoues`() {
        GameLawVectors.cases("flame-form").forEach {
            val days = it.int("days")
            assertWithMessage(it.label).that(GameFlameLaw.form(days)?.name?.lowercase()).isEqualTo(it.expected["form"]?.takeIf { f -> f.toString() != "null" }?.text())
            assertWithMessage(it.label).that(GameFlameLaw.bonusPercent(days)).isEqualTo(it.expected["bonusPercent"].intValue())
            assertWithMessage(it.label).that(GameFlameLaw.bonus(days)).isEqualTo(it.expected["bonus"].doubleValue())
        }
        GameLawVectors.cases("flame-advance").forEach {
            val t = GameFlameLaw.advance(it.strOrNull("lastActiveDay"), it.str("today"), it.int("streak"), it.int("freezes"))
            assertWithMessage(it.label).that(t.outcome.name.lowercase()).isEqualTo(it.expected["outcome"].text().replace("-", ""))
            assertWithMessage(it.label).that(listOf(t.streak, t.freezes, t.freezesUsed, t.missedDays, t.lostStreak)).isEqualTo(
                listOf("streak", "freezes", "freezesUsed", "missedDays", "lostStreak").map { k -> it.expected[k].intValue() },
            )
        }
        GameLawVectors.cases("flame-relight").forEach {
            val d = GameFlameLaw.canRelight(it.strOrNull("lastActiveDay"), it.str("today"), it.int("streakBeforeBreak"), it.strOrNull("lastRelightDay"), it.int("balance"))
            assertWithMessage(it.label).that(d.allowed).isEqualTo(it.expected["allowed"].boolValue())
            assertWithMessage(it.label).that(d.price).isEqualTo(it.expected["price"].intValue())
            val reason = it.expected["reason"]
            if (reason != null) assertWithMessage(it.label).that(d.reason?.name?.lowercase()).isEqualTo(reason.text().replace("-", ""))
        }
        GameLawVectors.cases("flame-status").forEach {
            val s = GameFlameLaw.status(it.strOrNull("lastActiveDay"), it.str("today"), it.int("streak"), it.int("freezes"))
            assertWithMessage(it.label).that(s.name.lowercase()).isEqualTo(it.expected["status"].text().replace("-", ""))
        }
    }
}
