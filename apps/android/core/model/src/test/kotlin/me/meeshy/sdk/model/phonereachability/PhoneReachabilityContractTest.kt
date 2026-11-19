package me.meeshy.sdk.model.phonereachability

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le décodeur du contrat du téléphone injoignable (#18737), nourri des charges telles que la passerelle les émet
 * (`phoneReachabilityRelay.ts` → `phone:unreachable` / `phone:reachable`, `GET /relations/phone-reachability`) et
 * traversant la VRAIE couche de désérialisation, avec la configuration `Json` du client réseau.
 */
class PhoneReachabilityContractTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val alice = "64b7f0c2a1b2c3d4e5f60718"
    private val since = "2026-11-15T14:10:00.000Z"

    private fun unreachable(raw: String) = json.decodeFromString(PhoneUnreachableWire.serializer(), raw).served()

    @Test
    fun `phone unreachable se lit avec son etat, sa cause et son annonce`() {
        val event = unreachable(
            """{"userId":"$alice","state":{"userId":"$alice","unreachableSince":"$since","cause":"battery"},
            "announcement":{"kind":"unreachable","at":"2026-11-15T14:30:00.000Z"},"extra":1}""",
        )
        assertThat(event).isNotNull()
        assertThat(event!!.state.userId).isEqualTo(alice)
        assertThat(event.state.unreachableSinceMillis).isEqualTo(Instant.parse(since).toEpochMilli())
        assertThat(event.state.cause).isEqualTo(PhoneUnreachableCause.BATTERY)
        assertThat(event.announcement?.kind).isEqualTo(PhoneReachabilityAnnouncementKind.UNREACHABLE)
    }

    @Test
    fun `une cause inconnue se lit unknown et l'etat reste servi`() {
        val event = unreachable("""{"userId":"$alice","state":{"userId":"$alice","unreachableSince":"$since","cause":"meteor"}}""")
        assertThat(event?.state?.cause).isEqualTo(PhoneUnreachableCause.UNKNOWN)
        assertThat(event?.announcement).isNull()
    }

    @Test
    fun `une annonce d'un genre inconnu est ignoree et l'etat reste lu`() {
        val event = unreachable(
            """{"userId":"$alice","state":{"userId":"$alice","unreachableSince":"$since","cause":"network"},
            "announcement":{"kind":"vanished","at":"2026-11-15T14:30:00.000Z"}}""",
        )
        assertThat(event?.state?.cause).isEqualTo(PhoneUnreachableCause.NETWORK)
        assertThat(event?.announcement).isNull()
    }

    @Test
    fun `un etat hors contrat est ecarte`() {
        assertThat(unreachable("""{"userId":"$alice","state":{"userId":"$alice","unreachableSince":"hier"}}""")).isNull()
        assertThat(unreachable("""{"userId":"$alice","state":{"unreachableSince":"$since"}}""")).isNull()
        assertThat(unreachable("""{"userId":"other","state":{"userId":"$alice","unreachableSince":"$since"}}""")).isNull()
    }

    @Test
    fun `phone reachable efface et porte parfois son annonce`() {
        val reachable = json.decodeFromString(
            PhoneReachableWire.serializer(),
            """{"userId":"$alice","announcement":{"kind":"reachable","at":"2026-11-15T15:00:00.000Z"}}""",
        ).served()
        assertThat(reachable?.userId).isEqualTo(alice)
        assertThat(reachable?.announcement?.kind).isEqualTo(PhoneReachabilityAnnouncementKind.REACHABLE)
        val silent = json.decodeFromString(PhoneReachableWire.serializer(), """{"userId":"$alice"}""").served()
        assertThat(silent).isEqualTo(PhoneReachabilityEvent.Reachable(alice, null))
        assertThat(json.decodeFromString(PhoneReachableWire.serializer(), """{"userId":"  "}""").served()).isNull()
    }

    @Test
    fun `le rattrapage ecarte un element illisible sans tomber`() {
        val snapshot = json.decodeFromString(
            PhoneReachabilitySnapshotWire.serializer(),
            """{"items":[{"userId":"$alice","unreachableSince":"$since","cause":"network"},{"userId":"x"},42]}""",
        ).served(json)
        assertThat(snapshot.map { it.userId }).containsExactly(alice)
    }

    @Test
    fun `les reglages se lisent et le corps par personne ne porte que shared`() {
        val person = json.decodeFromString(PhoneReachabilityPersonSettingsWire.serializer(), """{"userId":"$alice","shared":true}""")
        assertThat(person.shared).isTrue()
        assertThat(json.decodeFromString(PhoneReachabilityEmitterSettings.serializer(), "{}").sharingEnabled).isTrue()
        assertThat(json.encodeToString(PhoneReachabilityPersonSettingsBody.serializer(), PhoneReachabilityPersonSettingsBody(false)))
            .isEqualTo("""{"shared":false}""")
        assertThat(json.decodeFromString(PhoneAliveResultWire.serializer(), """{"tracked":true}""").tracked).isTrue()
    }

    @Test
    fun `les types de push sont ceux du contrat`() {
        assertThat(PhoneReachabilityContract.NOTIFICATION_TYPE).isEqualTo("device_unreachable")
        assertThat(PhoneReachabilityContract.PROBE_PUSH_TYPE).isEqualTo("device_probe")
    }

    @Test
    fun `reactiver prevenir mes Proches envoie la cle sur le fil, la valeur par defaut comprise`() {
        val on = json.encodeToString(PhoneReachabilityEmitterSettingsBody.serializer(), PhoneReachabilityEmitterSettingsBody(sharingEnabled = true))
        val off = json.encodeToString(PhoneReachabilityEmitterSettingsBody.serializer(), PhoneReachabilityEmitterSettingsBody(sharingEnabled = false))
        assertThat(on).isEqualTo("""{"sharingEnabled":true}""")
        assertThat(off).isEqualTo("""{"sharingEnabled":false}""")
    }
}
