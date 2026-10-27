package me.meeshy.sdk.net.api

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.game.GamePrivacyRequest
import me.meeshy.sdk.model.game.LeagueConsentRequest
import me.meeshy.sdk.model.game.ShowcaseVisibility
import me.meeshy.sdk.model.game.ShowcaseVisibilityRequest
import org.junit.Test

/** Les six routes des pages du jeu, telles qu'elles partent — requête capturée derrière le vrai Retrofit. */
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
}
