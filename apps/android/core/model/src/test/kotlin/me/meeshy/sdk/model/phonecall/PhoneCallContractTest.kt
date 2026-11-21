package me.meeshy.sdk.model.phonecall

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.socket.SocketEventNames
import org.junit.Test

/**
 * Le décodeur d'« en appel » (#18753), nourri des charges telles que la passerelle les émet (`phoneCallRelay.ts` →
 * `phone-call:started` / `phone-call:ended`, `GET /relations/phone-calls`, `/me/device/call…`) et traversant la VRAIE
 * couche de (dé)sérialisation, avec la configuration `Json` du client réseau (qui tait les défauts et les nuls).
 */
class PhoneCallContractTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val jacques = "64b7f0c2a1b2c3d4e5f60718"
    private val since = "2026-11-19T14:00:00.000Z"
    private val expires = "2026-11-19T17:02:00.000Z"
    private val at = "2026-11-19T14:02:13.000Z"

    private fun started(raw: String) = json.decodeFromString(PhoneCallStartedWire.serializer(), raw).served()

    @Test
    fun `phone-call started se lit avec son etat, son expiration et son annonce`() {
        val event = started(
            """{"userId":"$jacques","state":{"userId":"$jacques","since":"$since","expiresAt":"$expires"},
            "announcement":{"kind":"started","at":"$at"},"extra":1}""",
        )
        assertThat(event).isNotNull()
        assertThat(event!!.state).isEqualTo(
            PhoneCallState(jacques, Instant.parse(since).toEpochMilli(), Instant.parse(expires).toEpochMilli()),
        )
        assertThat(event.announcement).isEqualTo(PhoneCallAnnouncement(PhoneCallAnnouncementKind.STARTED, Instant.parse(at).toEpochMilli()))
    }

    @Test
    fun `un started sans annonce est une mise a jour silencieuse`() {
        val event = started("""{"userId":"$jacques","state":{"userId":"$jacques","since":"$since","expiresAt":"$expires"}}""")
        assertThat(event?.state?.userId).isEqualTo(jacques)
        assertThat(event?.announcement).isNull()
    }

    @Test
    fun `une annonce d'un genre inconnu est ignoree et l'etat reste lu`() {
        val event = started(
            """{"userId":"$jacques","state":{"userId":"$jacques","since":"$since","expiresAt":"$expires"},
            "announcement":{"kind":"ringing","at":"$at"}}""",
        )
        assertThat(event?.state?.userId).isEqualTo(jacques)
        assertThat(event?.announcement).isNull()
    }

    @Test
    fun `un etat hors contrat est ecarte`() {
        assertThat(started("""{"userId":"$jacques","state":{"userId":"$jacques","since":"hier","expiresAt":"$expires"}}""")).isNull()
        assertThat(started("""{"userId":"$jacques","state":{"userId":"$jacques","since":"$since"}}""")).isNull()
        assertThat(started("""{"userId":"$jacques","state":{"since":"$since","expiresAt":"$expires"}}""")).isNull()
        assertThat(started("""{"userId":"autre","state":{"userId":"$jacques","since":"$since","expiresAt":"$expires"}}""")).isNull()
        assertThat(started("""{"userId":"$jacques"}""")).isNull()
    }

    @Test
    fun `phone-call ended efface et porte parfois l'annonce du raccroche`() {
        val ended = json.decodeFromString(
            PhoneCallEndedWire.serializer(),
            """{"userId":"$jacques","announcement":{"kind":"ended","at":"$at"}}""",
        ).served()
        assertThat(ended?.userId).isEqualTo(jacques)
        assertThat(ended?.announcement?.kind).isEqualTo(PhoneCallAnnouncementKind.ENDED)
        val silent = json.decodeFromString(PhoneCallEndedWire.serializer(), """{"userId":"$jacques"}""").served()
        assertThat(silent).isEqualTo(PhoneCallEvent.Ended(jacques, null))
        assertThat(json.decodeFromString(PhoneCallEndedWire.serializer(), """{"userId":" "}""").served()).isNull()
    }

    @Test
    fun `le rattrapage ecarte un element illisible sans tomber`() {
        val items = json.decodeFromString(
            PhoneCallSnapshotWire.serializer(),
            """{"items":[{"userId":"$jacques","since":"$since","expiresAt":"$expires"},{"userId":"x"},42]}""",
        ).served(json)
        assertThat(items.map { it.userId }).containsExactly(jacques)
    }

    @Test
    fun `le rapport part avec son booleen, meme faux, et rien d'autre`() {
        assertThat(json.encodeToString(PhoneCallReportBody.serializer(), PhoneCallReportBody(active = false)))
            .isEqualTo("""{"active":false}""")
        assertThat(json.encodeToString(PhoneCallReportBody.serializer(), PhoneCallReportBody(active = true)))
            .isEqualTo("""{"active":true}""")
        assertThat(json.decodeFromString(PhoneCallAckWire.serializer(), """{"tracked":true}""").tracked).isTrue()
        assertThat(json.decodeFromString(PhoneCallAckWire.serializer(), "{}").tracked).isFalse()
    }

    @Test
    fun `le reglage global part toujours explicite, malgre l'encodeur qui tait les defauts`() {
        assertThat(json.encodeToString(PhoneCallEmitterSettingsBody.serializer(), PhoneCallEmitterSettingsBody(true)))
            .isEqualTo("""{"sharingEnabled":true}""")
        assertThat(json.encodeToString(PhoneCallEmitterSettingsBody.serializer(), PhoneCallEmitterSettingsBody(false)))
            .isEqualTo("""{"sharingEnabled":false}""")
        assertThat(json.decodeFromString(PhoneCallEmitterSettingsWire.serializer(), """{"sharingEnabled":false}""").sharingEnabled).isFalse()
        assertThat(json.decodeFromString(PhoneCallEmitterSettingsWire.serializer(), "{}").sharingEnabled).isTrue()
    }

    @Test
    fun `les reglages par personne se lisent et partent stricts`() {
        val person = json.decodeFromString(PhoneCallPersonSettingsWire.serializer(), """{"userId":"$jacques","shared":true}""")
        assertThat(person.shared).isTrue()
        assertThat(json.encodeToString(PhoneCallPersonSettingsBody.serializer(), PhoneCallPersonSettingsBody(false)))
            .isEqualTo("""{"shared":false}""")
    }

    @Test
    fun `les deux evenements descendants sont au catalogue des noms`() {
        assertThat(SocketEventNames.PHONE_CALL_STARTED).isEqualTo("phone-call:started")
        assertThat(SocketEventNames.PHONE_CALL_ENDED).isEqualTo("phone-call:ended")
        assertThat(SocketEventNames.all).containsAtLeast("phone-call:started", "phone-call:ended")
    }
}
