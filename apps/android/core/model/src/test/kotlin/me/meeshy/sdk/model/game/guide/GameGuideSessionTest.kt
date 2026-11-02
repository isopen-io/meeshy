package me.meeshy.sdk.model.game.guide

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.game.FlameStatus
import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameLeagueBlock
import me.meeshy.sdk.model.game.LeagueAccess
import me.meeshy.sdk.model.game.LeagueCloses
import me.meeshy.sdk.model.game.LeagueCurrent
import me.meeshy.sdk.model.game.LeagueFriends
import me.meeshy.sdk.model.game.LeagueKey
import me.meeshy.sdk.model.game.LeagueZone
import me.meeshy.sdk.model.game.guide.GuideTestGames.atLevel
import me.meeshy.sdk.model.game.guide.GuideTestGames.beginner
import me.meeshy.sdk.model.game.guide.GuideTestGames.onboardingDone
import me.meeshy.sdk.model.game.guide.GuideTestGames.withFlame
import org.junit.Test

/**
 * LA SESSION DU GUIDE (#13885) — miroir de `GameGuideSession` (iOS) : une carte par ouverture, vue dès qu'elle
 * s'affiche, « Plus tard » qui écarte sans rien retenir, « Passer l'intégration » qui marque le reste en UN envoi.
 */
class GameGuideSessionTest {

    private class Harness(lastVisit: String? = null, snapshot: GuideSnapshot? = null) {
        val memory = FakeGuideMemory(lastVisit, snapshot)
        val sent = mutableListOf<List<String>>()
        val session = GameGuideSession(memory, memory, today = { "2026-10-31" }, markSeen = { sent += it })
    }

    @Test
    fun `a la premiere ouverture, l'integration commence et sa carte part vue`() {
        val harness = Harness()

        harness.session.observe(beginner())

        assertThat(harness.session.card?.key).isEqualTo("onboarding.welcome")
        assertThat(harness.sent).containsExactly(listOf("onboarding.welcome"))
        assertThat(harness.memory.lastVisit).isEqualTo("2026-10-31")
        assertThat(harness.memory.snapshot).isEqualTo(GuideSnapshot.of(beginner()))
    }

    @Test
    fun `passer une etape montre la suivante, passer l'integration marque le reste en un envoi`() {
        val harness = Harness()
        harness.session.observe(beginner())

        harness.session.dismiss()
        assertThat(harness.session.card?.key).isEqualTo("onboarding.first-points")

        harness.session.skipAll()
        assertThat(harness.session.card).isNull()
        assertThat(harness.sent.last()).isEqualTo(onboardingDone.drop(2))
        assertThat(harness.sent).hasSize(3)
    }

    @Test
    fun `apres l'integration, un retour apres une absence se dit en entier puis en court`() {
        val first = Harness(lastVisit = "2026-10-20")
        first.session.observe(beginner(seen = onboardingDone))
        assertThat(first.session.card?.key).isEqualTo("return-after-absence")
        assertThat(first.session.card?.presentation).isEqualTo(GuidePresentation.Full)

        val second = Harness(lastVisit = "2026-10-20")
        second.session.observe(beginner(seen = onboardingDone + "return-after-absence"))
        assertThat(second.session.card?.presentation).isEqualTo(GuidePresentation.Short)
        assertThat(second.sent).isEmpty()
    }

    @Test
    fun `plus tard ecarte la carte sans rien envoyer de plus`() {
        val harness = Harness()
        harness.session.observe(withFlame(beginner(seen = onboardingDone), FlameStatus.AtRisk))

        harness.session.dismiss()

        assertThat(harness.session.card).isNull()
        assertThat(harness.sent).containsExactly(listOf("flame-at-risk"))
    }

    @Test
    fun `une transition remplace la carte d'un moment, jamais celle de l'integration`() {
        val onboarding = Harness()
        onboarding.session.observe(beginner())
        onboarding.session.observe(atLevel(beginner(), 2))
        assertThat(onboarding.session.card?.key).isEqualTo("onboarding.welcome")

        val played = Harness()
        played.session.observe(beginner(seen = onboardingDone))
        assertThat(played.session.card).isNull()
        played.session.observe(atLevel(beginner(seen = onboardingDone), 2))
        assertThat(played.session.card?.key).isEqualTo("first-level")
    }

    @Test
    fun `une lecture non reglee ne compte pas comme l'ouverture`() {
        val harness = Harness()

        harness.session.observe(beginner(), settled = false)

        assertThat(harness.session.card).isNull()
        assertThat(harness.sent).isEmpty()
        assertThat(harness.memory.lastVisit).isNull()
    }

    @Test
    fun `une montee de joute arrivee app fermee se raconte a l'ouverture suivante`() {
        val stored = GuideSnapshot.of(withLeague(beginner(seen = onboardingDone), "2026-10-12", LeagueKey.Jade))
        val harness = Harness(snapshot = stored)

        harness.session.observe(withLeague(beginner(seen = onboardingDone + "league-first"), "2026-10-19", LeagueKey.Saphir))

        assertThat(harness.session.card?.key).isEqualTo("league-promoted")
        assertThat(harness.session.card?.photo).isTrue()
    }

    private fun withLeague(game: GameBlock, week: String, league: LeagueKey): GameBlock = game.copy(
        league = GameLeagueBlock(
            unlocked = true,
            access = LeagueAccess.Open,
            weekKey = week,
            closes = LeagueCloses(week, 20 * 60),
            current = LeagueCurrent(league, "g1", 30, 4, 120, LeagueZone.Safe, pointsToPromotion = 30),
            friends = LeagueFriends(1, 3, 120),
        ),
    )
}
