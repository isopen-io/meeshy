package me.meeshy.sdk.model.fall

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le décodeur de la chute détectée (#18748, SAN-01), nourri des charges telles que la passerelle les émet
 * (`fallRelay.ts` → `fall:detected` / `fall:cleared`, `GET /relations/falls`, `/relations/:userId/fall/settings`) et
 * traversant la VRAIE couche de désérialisation, avec la configuration `Json` du client réseau.
 */
class FallContractTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val awa = "64b7f0c2a1b2c3d4e5f60718"
    private val detected = "2026-11-19T16:42:00.000Z"
    private val expires = "2026-11-19T22:42:00.000Z"
    private val millis = { iso: String -> Instant.parse(iso).toEpochMilli() }

    private fun detectedEvent(raw: String) = json.decodeFromString(FallDetectedWire.serializer(), raw).served()

    private fun clearedEvent(raw: String) = json.decodeFromString(FallClearedWire.serializer(), raw).served()

    @Test
    fun `fall detected se lit avec son etat, sa batterie, sa position et son annonce`() {
        val event = detectedEvent(
            """{"userId":"$awa","state":{"userId":"$awa","detectedAt":"$detected","expiresAt":"$expires",
            "lastPosition":{"latitude":48.85,"longitude":2.35,"accuracy":20,"recordedAt":"$detected"},
            "lastBattery":{"level":41,"measuredAt":"$detected"}},"announcement":{"kind":"detected","at":"$detected"}}""",
        )
        assertThat(event?.state?.detectedAtMillis).isEqualTo(millis(detected))
        assertThat(event?.state?.expiresAtMillis).isEqualTo(millis(expires))
        assertThat(event?.state?.lastBattery?.level).isEqualTo(41)
        assertThat(event?.state?.lastPosition?.latitude).isEqualTo(48.85)
        assertThat(event?.announcedAtMillis).isEqualTo(millis(detected))
    }

    @Test
    fun `une position ou une batterie illisible se tait, l etat reste lu, une annonce inconnue est ecartee`() {
        val event = detectedEvent(
            """{"userId":"$awa","state":{"userId":"$awa","detectedAt":"$detected","expiresAt":"$expires",
            "lastPosition":{"latitude":200,"longitude":2},"lastBattery":{"level":"neuf"}},"announcement":{"kind":"tumbled","at":"$detected"}}""",
        )
        assertThat(event?.state?.lastPosition).isNull()
        assertThat(event?.state?.lastBattery).isNull()
        assertThat(event?.announcedAtMillis).isNull()
    }

    @Test
    fun `un etat d'une autre personne, sans identite ou a la date illisible est refuse`() {
        assertThat(detectedEvent("""{"userId":"autre","state":{"userId":"$awa","detectedAt":"$detected","expiresAt":"$expires"}}""")).isNull()
        assertThat(detectedEvent("""{"userId":"$awa","state":{"userId":"$awa","detectedAt":"hier","expiresAt":"$expires"}}""")).isNull()
        assertThat(detectedEvent("""{"userId":"$awa","state":{"userId":"$awa","detectedAt":"$detected"}}""")).isNull()
    }

    @Test
    fun `fall cleared nomme la personne et sa raison, une raison inconnue vaut withdrawn`() {
        assertThat(clearedEvent("""{"userId":"$awa","reason":"responded"}""")).isEqualTo(FallEvent.Cleared(awa, FallClearedReason.RESPONDED))
        assertThat(clearedEvent("""{"userId":"$awa","reason":"teleported"}""")?.reason).isEqualTo(FallClearedReason.WITHDRAWN)
        assertThat(clearedEvent("""{"userId":"$awa"}""")?.reason).isEqualTo(FallClearedReason.WITHDRAWN)
        assertThat(clearedEvent("""{}""")).isNull()
    }

    @Test
    fun `le rattrapage ecarte un element illisible sans perdre les autres`() {
        val snapshot = json.decodeFromString(
            FallSnapshotWire.serializer(),
            """{"items":[{"userId":"$awa","detectedAt":"$detected","expiresAt":"$expires"},{"userId":"x","detectedAt":"jamais"}]}""",
        )
        assertThat(snapshot.served(json).map { it.userId }).containsExactly(awa)
    }

    @Test
    fun `le reglage par personne est faux tant que le serveur ne dit pas vrai`() {
        assertThat(json.decodeFromString(FallPersonSettingsWire.serializer(), """{"userId":"$awa"}""").shared).isFalse()
        assertThat(json.encodeToString(FallPersonSettingsBody.serializer(), FallPersonSettingsBody(shared = true))).isEqualTo("""{"shared":true}""")
    }

    @Test
    fun `les pushes de securite sont generiques et la levee retire l'etat de la personne nommee`() {
        assertThat(FallContract.SAFETY_ALERT_PUSH_TYPE).isEqualTo("safety_alert")
        assertThat(FallContract.SAFETY_ALERT_CLEARED_PUSH_TYPE).isEqualTo("safety_alert_cleared")
        assertThat(FallContract.clearedUserId(mapOf("type" to "safety_alert_cleared", "userId" to awa))).isEqualTo(awa)
        assertThat(FallContract.clearedUserId(mapOf("type" to "safety_alert", "userId" to awa))).isNull()
        assertThat(FallContract.clearedUserId(mapOf("type" to "safety_alert_cleared", "userId" to " "))).isNull()
    }
}
