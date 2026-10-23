package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.CandidateRoute
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.DescriptionType
import me.meeshy.sdk.model.call.RemoteDescriptionGuard.Verdict
import org.junit.Test

class RemoteDescriptionGuardTest {

    private fun candidate(n: Int) = IceCandidateLine("0", 0, "candidate:$n 1 udp 1 10.0.0.$n 5000 typ host")

    @Test
    fun `la premiere offre est appliquee puis son rejeu est ignore`() {
        val guard = RemoteDescriptionGuard()

        assertThat(guard.judge(DescriptionType.Offer, "v=0 a")).isEqualTo(Verdict.Apply)
        guard.onApplied(DescriptionType.Offer, "v=0 a")

        assertThat(guard.judge(DescriptionType.Offer, "v=0 a")).isEqualTo(Verdict.Duplicate)
    }

    @Test
    fun `une offre differente apres la premiere est une renegociation appliquee`() {
        val guard = RemoteDescriptionGuard()
        guard.onApplied(DescriptionType.Offer, "v=0 a")

        assertThat(guard.judge(DescriptionType.Offer, "v=0 b")).isEqualTo(Verdict.Apply)
    }

    @Test
    fun `une reponse sans offre locale en attente est ignoree`() {
        val guard = RemoteDescriptionGuard()

        assertThat(guard.judge(DescriptionType.Answer, "v=0 r")).isEqualTo(Verdict.Unexpected)
    }

    @Test
    fun `une reponse attendue est appliquee une fois puis rejouee sans effet`() {
        val guard = RemoteDescriptionGuard()
        guard.onLocalOfferSet()

        assertThat(guard.judge(DescriptionType.Answer, "v=0 r")).isEqualTo(Verdict.Apply)
        guard.onApplied(DescriptionType.Answer, "v=0 r")

        assertThat(guard.judge(DescriptionType.Answer, "v=0 r")).isEqualTo(Verdict.Duplicate)
        assertThat(guard.judge(DescriptionType.Answer, "v=0 autre")).isEqualTo(Verdict.Unexpected)
    }

    @Test
    fun `un candidat avant la description distante est garde puis rendu dans l'ordre`() {
        val guard = RemoteDescriptionGuard()

        assertThat(guard.route(candidate(1))).isEqualTo(CandidateRoute.Queued)
        assertThat(guard.route(candidate(2))).isEqualTo(CandidateRoute.Queued)

        assertThat(guard.onApplied(DescriptionType.Offer, "v=0 a")).containsExactly(candidate(1), candidate(2)).inOrder()
        assertThat(guard.onApplied(DescriptionType.Offer, "v=0 b")).isEmpty()
    }

    @Test
    fun `apres la description distante un candidat part tout de suite`() {
        val guard = RemoteDescriptionGuard()
        guard.onApplied(DescriptionType.Offer, "v=0 a")

        assertThat(guard.route(candidate(1))).isEqualTo(CandidateRoute.ApplyNow)
    }

    @Test
    fun `un candidat hors bornes n'est ni garde ni applique`() {
        val guard = RemoteDescriptionGuard()
        val hostile = IceCandidateLine("0", 999, "x")

        assertThat(guard.route(hostile)).isEqualTo(CandidateRoute.Rejected)
        assertThat(guard.onApplied(DescriptionType.Offer, "v=0 a")).isEmpty()
    }

    @Test
    fun `reset oublie tout l'etat de l'appel`() {
        val guard = RemoteDescriptionGuard()
        guard.onLocalOfferSet()
        guard.route(candidate(1))
        guard.onApplied(DescriptionType.Answer, "v=0 r")

        guard.reset()

        assertThat(guard.judge(DescriptionType.Answer, "v=0 r")).isEqualTo(Verdict.Unexpected)
        assertThat(guard.route(candidate(2))).isEqualTo(CandidateRoute.Queued)
    }
}
