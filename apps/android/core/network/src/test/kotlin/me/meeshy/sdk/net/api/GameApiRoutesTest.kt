package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.game.GamePrivacyRequest
import me.meeshy.sdk.model.game.GameWriteRequest
import me.meeshy.sdk.model.game.LeagueConsentRequest
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.ShowcaseVisibilityRequest
import org.junit.Test

/** Les routes du jeu (pages et écritures), telles qu'elles partent — requête capturée derrière le vrai Retrofit. */
class GameApiRoutesTest {

    private fun game(http: RecordingHttp) = http.serve(GameApi::class.java)

    @Test
    fun `les trois lectures appellent leur route sans corps`() = runTest {
        val http = RecordingHttp()
        val api = game(http)

        api.leagueWeek()
        api.leagueFriends()
        api.settings()

        assertThat(http.requests.map { it.method to it.path }).containsExactly(
            "GET" to "/api/v1/me/game/league/week",
            "GET" to "/api/v1/me/game/league/friends",
            "GET" to "/api/v1/me/game/privacy",
        ).inOrder()
    }

    @Test
    fun `le consentement poste l identifiant d intention et le choix`() = runTest {
        val http = RecordingHttp()

        game(http).setLeagueConsent(LeagueConsentRequest(requestId = "req-12345678", consent = true))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/me/game/league/consent")
        assertThat(http.only.body).isEqualTo("""{"requestId":"req-12345678","consent":true}""")
    }

    @Test
    fun `masquer le jeu met un seul interrupteur et laisse l autre absent`() = runTest {
        val http = RecordingHttp()

        game(http).setPrivacy(GamePrivacyRequest(requestId = "req-12345678", gameHidden = true))

        assertThat(http.only.method).isEqualTo("PUT")
        assertThat(http.only.path).isEqualTo("/api/v1/me/game/privacy")
        assertThat(http.only.body).isEqualTo("""{"requestId":"req-12345678","gameHidden":true}""")
    }

    @Test
    fun `fermer les visibilites met les quatre facettes a moi seul`() = runTest {
        val http = RecordingHttp()
        val me = ShowcaseVisibility.Me

        game(http).setVisibility(ShowcaseVisibilityRequest(requestId = "req-12345678", showcase = me, rank = me, treasury = me, atlas = me))

        assertThat(http.only.method).isEqualTo("PUT")
        assertThat(http.only.path).isEqualTo("/api/v1/me/game/visibility")
        assertThat(http.only.body)
            .isEqualTo("""{"requestId":"req-12345678","showcase":"me","rank":"me","treasury":"me","atlas":"me"}""")
    }

    @Test
    fun `changer un acte poste l identifiant d intention sur la mission nommee`() = runTest {
        val http = RecordingHttp()

        game(http).rerollMission("m-17", GameWriteRequest("req-12345678"))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/me/game/missions/m-17/reroll")
        assertThat(http.only.body).isEqualTo("""{"requestId":"req-12345678"}""")
    }

    @Test
    fun `un identifiant de mission avec une barre ne sort jamais de son segment`() = runTest {
        val http = RecordingHttp()

        game(http).rerollMission("a/b", GameWriteRequest("req-12345678"))

        assertThat(http.only.path).isEqualTo("/api/v1/me/game/missions/a%2Fb/reroll")
    }

    @Test
    fun `les cinq gestes sans parametre postent leur seul identifiant d intention`() = runTest {
        val http = RecordingHttp()
        val api = game(http)
        val body = GameWriteRequest("req-12345678")

        api.claimChest(body)
        api.buyFlameFreeze(body)
        api.relightFlame(body)
        api.buySeasonSeal(body)
        api.passPrestige(body)

        assertThat(http.requests.map { it.method to it.path }).containsExactly(
            "POST" to "/api/v1/me/game/chest/claim",
            "POST" to "/api/v1/me/game/flame/freezes",
            "POST" to "/api/v1/me/game/flame/relight",
            "POST" to "/api/v1/me/game/season/seal",
            "POST" to "/api/v1/me/game/prestige",
        ).inOrder()
        assertThat(http.requests.map { it.body }.toSet()).containsExactly("""{"requestId":"req-12345678"}""")
    }

    @Test
    fun `reclamer une halte nomme son numero dans le chemin`() = runTest {
        val http = RecordingHttp()

        game(http).claimSeasonStep(12, GameWriteRequest("req-12345678"))

        assertThat(http.only.method).isEqualTo("POST")
        assertThat(http.only.path).isEqualTo("/api/v1/me/game/season/steps/12/claim")
        assertThat(http.only.body).isEqualTo("""{"requestId":"req-12345678"}""")
    }
}
