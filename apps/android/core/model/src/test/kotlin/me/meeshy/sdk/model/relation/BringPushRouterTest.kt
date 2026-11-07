package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le Bring reçu par push (#13936, `proche-bring@android`) — la charge de `packages/shared/types/bring.ts`
 * (`bringPushDataSchema`, `bringStoppedPushDataSchema`) lue par une loi PURE : sonner, s'arrêter, ou se taire.
 */
class BringPushRouterTest {

    private val now = 1_800_000_000_000L
    private fun iso(millis: Long) = java.time.Instant.ofEpochMilli(millis).toString()

    private fun ring(
        bringId: String = "b1",
        expiresAt: String? = iso(now + 120_000),
        vararg extra: Pair<String, String>,
    ): Map<String, String> = buildMap {
        put("type", "bring")
        put("bringId", bringId)
        put("fromUserId", "alice")
        put("fromName", "Alice")
        put("fromAvatar", "")
        put("sentAt", iso(now))
        expiresAt?.let { put("expiresAt", it) }
        put("title", "Alice fait sonner votre téléphone")
        put("body", "Touchez pour arrêter")
        put("stopLabel", "Arrêter")
        putAll(extra)
    }

    private fun stopped(bringId: String = "b1") = mapOf("type" to "bring_stopped", "bringId" to bringId, "reason" to "sender")

    @Test
    fun `un push qui n est pas un Bring passe son chemin sans toucher le registre`() {
        val decision = BringPushRouter.route(mapOf("type" to "new_message"), now, BringRingLedger.EMPTY)

        assertThat(decision.route).isEqualTo(BringPushRoute.NotABringPush)
        assertThat(decision.ledger).isEqualTo(BringRingLedger.EMPTY)
    }

    @Test
    fun `une sonnerie valide sonne avec les libelles servis par la passerelle et jusqu a son expiration`() {
        val route = BringPushRouter.route(ring(), now, BringRingLedger.EMPTY).route

        assertThat(route).isInstanceOf(BringPushRoute.Ring::class.java)
        val push = (route as BringPushRoute.Ring).push
        assertThat(push.bringId).isEqualTo("b1")
        assertThat(push.fromUserId).isEqualTo("alice")
        assertThat(push.title).isEqualTo("Alice fait sonner votre téléphone")
        assertThat(push.body).isEqualTo("Touchez pour arrêter")
        assertThat(push.stopLabel).isEqualTo("Arrêter")
        assertThat(push.expiresAtMillis).isEqualTo(now + 120_000)
    }

    @Test
    fun `une sonnerie deja expiree ne sonne pas`() {
        val route = BringPushRouter.route(ring(expiresAt = iso(now - 1)), now, BringRingLedger.EMPTY).route

        assertThat(route).isEqualTo(BringPushRoute.Ignore(BringPushRoute.Reason.EXPIRED))
    }

    @Test
    fun `une expiration absente ou illisible retombe sur la fenetre de deux minutes, jamais au-dela`() {
        val missing = BringPushRouter.route(ring(expiresAt = null), now, BringRingLedger.EMPTY).route as BringPushRoute.Ring
        val garbage = BringPushRouter.route(ring(expiresAt = "demain"), now, BringRingLedger.EMPTY).route as BringPushRoute.Ring
        val tooFar = BringPushRouter.route(ring(expiresAt = iso(now + 3_600_000)), now, BringRingLedger.EMPTY).route as BringPushRoute.Ring

        assertThat(missing.push.expiresAtMillis).isEqualTo(now + BringPushRouter.RING_WINDOW_MS)
        assertThat(garbage.push.expiresAtMillis).isEqualTo(now + BringPushRouter.RING_WINDOW_MS)
        assertThat(tooFar.push.expiresAtMillis).isEqualTo(now + BringPushRouter.RING_WINDOW_MS)
    }

    @Test
    fun `une sonnerie sans identifiant ni expediteur n est pas un Bring`() {
        val noId = BringPushRouter.route(ring(bringId = " "), now, BringRingLedger.EMPTY).route
        val noSender = BringPushRouter.route(ring() + ("fromUserId" to ""), now, BringRingLedger.EMPTY).route

        assertThat(noId).isEqualTo(BringPushRoute.Ignore(BringPushRoute.Reason.MALFORMED))
        assertThat(noSender).isEqualTo(BringPushRoute.Ignore(BringPushRoute.Reason.MALFORMED))
    }

    @Test
    fun `les libelles absents restent nuls, le client rend les siens`() {
        val bare = ring() - "title" - "body" - "stopLabel"

        val push = (BringPushRouter.route(bare, now, BringRingLedger.EMPTY).route as BringPushRoute.Ring).push

        assertThat(push.title).isNull()
        assertThat(push.body).isNull()
        assertThat(push.stopLabel).isNull()
    }

    @Test
    fun `une seconde livraison du meme Bring ne relance pas la sonnerie`() {
        val first = BringPushRouter.route(ring(), now, BringRingLedger.EMPTY)

        val second = BringPushRouter.route(ring(), now + 5_000, first.ledger).route

        assertThat(second).isEqualTo(BringPushRoute.Ignore(BringPushRoute.Reason.DUPLICATE))
    }

    @Test
    fun `un arret arrive avant sa sonnerie la fait taire quand elle arrive`() {
        val stop = BringPushRouter.route(stopped(), now, BringRingLedger.EMPTY)

        assertThat(stop.route).isEqualTo(BringPushRoute.Stop("b1"))
        assertThat(BringPushRouter.route(ring(), now + 1_000, stop.ledger).route)
            .isEqualTo(BringPushRoute.Ignore(BringPushRoute.Reason.ALREADY_STOPPED))
    }

    @Test
    fun `un arret sans identifiant est ignore`() {
        val route = BringPushRouter.route(mapOf("type" to "bring_stopped"), now, BringRingLedger.EMPTY).route

        assertThat(route).isEqualTo(BringPushRoute.Ignore(BringPushRoute.Reason.MALFORMED))
    }

    @Test
    fun `le registre oublie ce qui a depasse sa fenetre, il ne grossit pas sans fin`() {
        val ledger = (1..500).fold(BringRingLedger.EMPTY) { acc, i ->
            BringPushRouter.route(ring(bringId = "b$i"), now, acc).ledger
        }

        val later = BringPushRouter.route(ring(bringId = "fresh", expiresAt = iso(now + 3 * 120_000 + 60_000)), now + 3 * 120_000, ledger)

        assertThat(later.ledger.size).isEqualTo(1)
        assertThat(BringPushRouter.route(ring(bringId = "b1", expiresAt = iso(now + 4 * 120_000)), now + 3 * 120_000, later.ledger).route)
            .isInstanceOf(BringPushRoute.Ring::class.java)
    }

    @Test
    fun `un ancien Bring arrete localement fait taire sa redelivrance`() {
        val ledger = BringRingLedger.EMPTY.remember("b1", now)

        assertThat(BringPushRouter.route(ring(), now + 1_000, ledger).route)
            .isEqualTo(BringPushRoute.Ignore(BringPushRoute.Reason.DUPLICATE))
    }
}
