package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import me.meeshy.sdk.model.socket.SocketAck
import me.meeshy.sdk.model.socket.SocketAckRefusal
import org.junit.Test

class SharedLocationSendingTest {

    private val alice = "aaaaaaaaaaaaaaaaaaaaaaaa"
    private val bob = "bbbbbbbbbbbbbbbbbbbbbbbb"
    private val paris = SharedLocationFix.of(48.8566, 2.3522, 12.0)!!

    @Test
    fun `un releve hors du globe ou non fini ne part jamais`() {
        assertThat(SharedLocationFix.of(91.0, 0.0)).isNull()
        assertThat(SharedLocationFix.of(0.0, -180.5)).isNull()
        assertThat(SharedLocationFix.of(Double.NaN, 0.0)).isNull()
        assertThat(SharedLocationFix.of(0.0, Double.POSITIVE_INFINITY)).isNull()
    }

    @Test
    fun `la precision de l'appareil est plafonnee et une precision absurde est retiree`() {
        assertThat(SharedLocationFix.of(0.0, 0.0, 500_000.0)!!.accuracy).isEqualTo(SharedLocationContract.MAX_RADIUS_METERS)
        assertThat(SharedLocationFix.of(0.0, 0.0, -3.0)!!.accuracy).isNull()
        assertThat(SharedLocationFix.of(0.0, 0.0, Double.NaN)!!.wire()).doesNotContainKey("accuracy")
        assertThat(paris.wire()).containsExactly("latitude", 48.8566, "longitude", 2.3522, "accuracy", 12.0)
    }

    @Test
    fun `la distance au sol se mesure en metres`() {
        val nearby = SharedLocationFix.of(48.8566 + 0.001, 2.3522)!!
        assertThat(paris.distanceMeters(nearby)).isWithin(2.0).of(111.2)
    }

    @Test
    fun `la charge de demarrage dedoublonne sans casse en gardant la derniere precision et rejette l'invalide`() {
        val request = SharedLocationStartRequest.of(
            recipients = listOf(
                SharedLocationRecipient(alice.uppercase(), SharedLocationPrecision.CITY),
                SharedLocationRecipient("pas-un-id", SharedLocationPrecision.EXACT),
                SharedLocationRecipient(bob, SharedLocationPrecision.NEIGHBORHOOD),
                SharedLocationRecipient(alice, SharedLocationPrecision.EXACT),
            ),
            duration = SharedLocationShareDuration.EIGHT_HOURS,
            fix = paris,
        )!!

        assertThat(request.recipients).containsExactly(
            SharedLocationRecipient(alice, SharedLocationPrecision.EXACT),
            SharedLocationRecipient(bob, SharedLocationPrecision.NEIGHBORHOOD),
        ).inOrder()
        val wire = request.wire()
        assertThat(wire["durationMinutes"]).isEqualTo(480)
        assertThat(wire["position"]).isEqualTo(paris.wire())
        assertThat(wire["recipients"]).isEqualTo(
            listOf(mapOf("userId" to alice, "precision" to "exact"), mapOf("userId" to bob, "precision" to "neighborhood")),
        )
        assertThat(wire.keys).containsExactly("recipients", "durationMinutes", "position")
    }

    @Test
    fun `aucun destinataire valide ou plus que le plafond ne fait aucune charge`() {
        assertThat(SharedLocationStartRequest.of(emptyList(), SharedLocationShareDuration.ONE_HOUR, paris)).isNull()
        val many = (0..SharedLocationStartRequest.MAX_RECIPIENTS).map {
            SharedLocationRecipient(it.toString(16).padStart(24, '0'), SharedLocationPrecision.CITY)
        }
        assertThat(SharedLocationStartRequest.of(many, SharedLocationShareDuration.ONE_HOUR, paris)).isNull()
        assertThat(SharedLocationStartRequest.of(many.drop(1), SharedLocationShareDuration.ONE_HOUR, paris)).isNotNull()
    }

    @Test
    fun `l'accuse rend le terme servi ou le refus code une socket absente vaut hors ligne et un accuse perdu reste incertain`() {
        val accepted = SocketAck.Accepted(buildJsonObject { put("expiresAt", JsonPrimitive("2026-11-14T13:00:00.000Z")) })
        assertThat(SharedLocationStartVerdict.read(accepted))
            .isEqualTo(SharedLocationStartVerdict.Started(1_794_661_200_000L))
        assertThat(SharedLocationStartVerdict.read(SocketAck.Accepted(null)))
            .isEqualTo(SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.FAILED))
        assertThat(SharedLocationStartVerdict.read(SocketAck.Refused(SocketAckRefusal(code = "SHARED_LOCATION_NOT_SHARING"))))
            .isEqualTo(SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.NOT_SHARING))
        assertThat(SharedLocationStartVerdict.read(SocketAck.Refused(SocketAckRefusal(code = "UN_CODE_FUTUR"))))
            .isEqualTo(SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.FAILED))
        assertThat(SharedLocationStartVerdict.read(SocketAck.Refused(SocketAckRefusal.NO_SOCKET)))
            .isEqualTo(SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.OFFLINE))
        assertThat(SharedLocationStartVerdict.read(SocketAck.Timeout))
            .isEqualTo(SharedLocationStartVerdict.Refused(SharedLocationSendOutcome.UNCONFIRMED))
    }

    @Test
    fun `une mise a jour ne part que si l'on a bouge ou au battement et jamais deux en cinq secondes`() {
        val sent = SharedLocationUpdateGate.Sent(paris, atMillis = 0L)
        val far = SharedLocationFix.of(48.8566 + 0.01, 2.3522)!!
        val jitter = SharedLocationFix.of(48.8566 + 0.0001, 2.3522)!!

        assertThat(SharedLocationUpdateGate.shouldSend(paris, nowMillis = 0L, last = null)).isTrue()
        assertThat(SharedLocationUpdateGate.shouldSend(far, nowMillis = 4_999L, last = sent)).isFalse()
        assertThat(SharedLocationUpdateGate.shouldSend(far, nowMillis = 5_000L, last = sent)).isTrue()
        assertThat(SharedLocationUpdateGate.shouldSend(jitter, nowMillis = 119_999L, last = sent)).isFalse()
        assertThat(SharedLocationUpdateGate.shouldSend(jitter, nowMillis = 120_000L, last = sent)).isTrue()
    }

    @Test
    fun `partager ma position se propose des Ami et jamais en dessous`() {
        assertThat(SharedLocationOfferRule.offers(RelationLevel.ACQUAINTANCE)).isFalse()
        assertThat(SharedLocationOfferRule.offers(RelationLevel.FRIEND)).isTrue()
        assertThat(SharedLocationOfferRule.offers(RelationLevel.BLOOD)).isTrue()
    }

    @Test
    fun `l'echeance d'une personne part dans la charge, bornee par le contrat, et s'oublie pour une passerelle d'avant`() {
        val request = SharedLocationStartRequest.of(
            listOf(
                SharedLocationRecipient(alice, SharedLocationPrecision.EXACT, expiresInSeconds = 600),
                SharedLocationRecipient(bob, SharedLocationPrecision.CITY, expiresInSeconds = 99_999),
            ),
            SharedLocationShareDuration.EIGHT_HOURS,
            paris,
        )!!

        assertThat(request.wire()["recipients"]).isEqualTo(
            listOf(
                mapOf("userId" to alice, "precision" to "exact", "expiresInSeconds" to 600),
                mapOf("userId" to bob, "precision" to "city", "expiresInSeconds" to SharedLocationContract.RECIPIENT_DEADLINE_MAX_SECONDS),
            ),
        )
        assertThat(request.carriesDeadlines).isTrue()
        val legacy = request.withoutDeadlines()
        assertThat(legacy.carriesDeadlines).isFalse()
        assertThat(legacy.wire()["recipients"]).isEqualTo(
            listOf(mapOf("userId" to alice, "precision" to "exact"), mapOf("userId" to bob, "precision" to "city")),
        )
        assertThat(legacy.duration).isEqualTo(request.duration)
        assertThat(legacy.fix).isEqualTo(request.fix)
    }

    @Test
    fun `une echeance nulle vaut une seconde, et un doublon garde sa derniere echeance`() {
        val request = SharedLocationStartRequest.of(
            listOf(
                SharedLocationRecipient(alice, SharedLocationPrecision.EXACT, expiresInSeconds = 0),
                SharedLocationRecipient(bob, SharedLocationPrecision.CITY, expiresInSeconds = 60),
                SharedLocationRecipient(bob.uppercase(), SharedLocationPrecision.CITY, expiresInSeconds = 120),
            ),
            SharedLocationShareDuration.ONE_HOUR,
            paris,
        )!!

        assertThat(request.recipients).containsExactly(
            SharedLocationRecipient(alice, SharedLocationPrecision.EXACT, expiresInSeconds = 1),
            SharedLocationRecipient(bob, SharedLocationPrecision.CITY, expiresInSeconds = 120),
        ).inOrder()
    }
}
