package me.meeshy.sdk.model.battery

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Le décodeur du contrat de batterie (#14147), nourri des charges telles que la passerelle les émet
 * (`batteryRelay.ts` → `battery:changed` / `battery:cleared`, `GET /relations/battery`) et traversant la VRAIE couche
 * de désérialisation, avec la configuration `Json` du client réseau.
 */
class BatteryContractTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val alice = "64b7f0c2a1b2c3d4e5f60718"

    private fun changed(raw: String) = json.decodeFromString(BatteryChangedWire.serializer(), raw).served()

    @Test
    fun `battery changed se lit avec son etat et son annonce`() {
        val event = changed(
            """{"userId":"$alice","state":{"userId":"$alice","phase":"low","level":24,"charging":false,"lowPower":true,
            "estimatedMinutes":95,"measuredAt":"2026-11-15T10:00:00.000Z","deviceLabel":"Pixel 8"},
            "announcement":{"kind":"threshold","level":24,"threshold":25,"at":"2026-11-15T10:00:01.000Z"}}""",
        )
        assertThat(event).isNotNull()
        val state = event!!.state
        assertThat(state.phase).isEqualTo(BatteryPhase.LOW)
        assertThat(state.level).isEqualTo(24)
        assertThat(state.lowPower).isTrue()
        assertThat(state.estimatedMinutes).isEqualTo(95)
        assertThat(state.deviceLabel).isEqualTo("Pixel 8")
        assertThat(event.announcement?.kind).isEqualTo(BatteryAnnouncementKind.THRESHOLD)
        assertThat(event.announcement?.threshold).isEqualTo(25)
    }

    @Test
    fun `sans annonce l'etat se met a jour en silence`() {
        val event = changed(
            """{"userId":"$alice","state":{"userId":"$alice","phase":"critical","level":4,"charging":false,
            "lowPower":false,"measuredAt":"2026-11-15T10:00:00.000Z"}}""",
        )
        assertThat(event?.announcement).isNull()
        assertThat(event?.state?.estimatedMinutes).isNull()
    }

    @Test
    fun `une annonce d'un genre inconnu est ignoree et l'etat reste lu`() {
        val event = changed(
            """{"userId":"$alice","state":{"userId":"$alice","phase":"low","level":20,"charging":false,"lowPower":false,
            "measuredAt":"2026-11-15T10:00:00.000Z"},"announcement":{"kind":"meteor","level":20,"at":"2026-11-15T10:00:00.000Z"}}""",
        )
        assertThat(event?.state?.level).isEqualTo(20)
        assertThat(event?.announcement).isNull()
    }

    @Test
    fun `un etat hors contrat est ecarte`() {
        val unknownPhase = changed(
            """{"userId":"$alice","state":{"userId":"$alice","phase":"normal","level":20,"charging":false,"lowPower":false,
            "measuredAt":"2026-11-15T10:00:00.000Z"}}""",
        )
        val outOfRange = changed(
            """{"userId":"$alice","state":{"userId":"$alice","phase":"low","level":140,"charging":false,"lowPower":false,
            "measuredAt":"2026-11-15T10:00:00.000Z"}}""",
        )
        assertThat(unknownPhase).isNull()
        assertThat(outOfRange).isNull()
    }

    @Test
    fun `battery cleared efface et porte parfois son annonce`() {
        val cleared = json.decodeFromString(
            BatteryClearedWire.serializer(),
            """{"userId":"$alice","announcement":{"kind":"recharged","level":100,"at":"2026-11-15T11:00:00.000Z"}}""",
        ).served()
        assertThat(cleared?.userId).isEqualTo(alice)
        assertThat(cleared?.announcement?.kind).isEqualTo(BatteryAnnouncementKind.RECHARGED)
    }

    @Test
    fun `le rattrapage ecarte un element illisible sans tomber`() {
        val snapshot = json.decodeFromString(
            BatterySnapshotWire.serializer(),
            """{"items":[{"userId":"$alice","phase":"off","level":2,"charging":false,"lowPower":false,
            "measuredAt":"2026-11-15T10:00:00.000Z"},{"userId":"x","phase":"low"}]}""",
        ).served(json)
        assertThat(snapshot.map { it.phase }).containsExactly(BatteryPhase.OFF)
    }

    @Test
    fun `le mode de reception inconnu retombe sur tous`() {
        val settings = json.decodeFromString(
            BatteryPersonSettingsWire.serializer(),
            """{"userId":"$alice","shared":true,"receive":"later"}""",
        )
        assertThat(settings.receiveMode).isEqualTo(BatteryReceiveMode.ALL)
        assertThat(BatteryReceiveMode.of("pill")).isEqualTo(BatteryReceiveMode.PILL)
    }

    @Test
    fun `le releve part sans champ en trop ni libelle nul`() {
        val body = json.encodeToString(
            BatteryReportBody.serializer(),
            BatteryReportBody(level = 12, charging = false, lowPower = true, measuredAt = "2026-11-15T10:00:00Z"),
        )
        assertThat(body).isEqualTo("""{"level":12,"charging":false,"lowPower":true,"measuredAt":"2026-11-15T10:00:00Z"}""")
    }

    @Test
    fun `le reglage par personne n'envoie que le champ touche`() {
        val body = json.encodeToString(BatteryPersonSettingsBody.serializer(), BatteryPersonSettingsBody(receive = "pill"))
        assertThat(body).isEqualTo("""{"receive":"pill"}""")
    }

    @Test
    fun `reactiver partager ma batterie envoie la cle sur le fil, la valeur par defaut comprise`() {
        val on = json.encodeToString(BatteryEmitterSettingsBody.serializer(), BatteryEmitterSettingsBody(sharingEnabled = true))
        val off = json.encodeToString(BatteryEmitterSettingsBody.serializer(), BatteryEmitterSettingsBody(sharingEnabled = false))
        assertThat(on).isEqualTo("""{"sharingEnabled":true}""")
        assertThat(off).isEqualTo("""{"sharingEnabled":false}""")
    }
}
