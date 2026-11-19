package me.meeshy.sdk.model.inactivity

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.push.PushPayload
import org.junit.Test

/**
 * Le décodeur de la vérification d'inactivité (#18738), nourri des charges telles que la passerelle les émet
 * (`inactivityRelay.ts` → `inactivity:alert` / `inactivity:cleared`, `GET /relations/inactivity`, `/me/wellness/…`)
 * et traversant la VRAIE couche de désérialisation, avec la configuration `Json` du client réseau.
 */
class InactivityContractTest {
    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val jacques = "64b7f0c2a1b2c3d4e5f60718"
    private val since = "2026-11-18T08:00:00.000Z"
    private val alerted = "2026-11-18T20:30:00.000Z"

    private fun alert(raw: String) = json.decodeFromString(InactivityAlertWire.serializer(), raw).served()

    @Test
    fun `inactivity alert se lit avec son etat, sa batterie, sa position et son annonce`() {
        val event = alert(
            """{"userId":"$jacques","state":{"userId":"$jacques","inactiveSince":"$since","alertedAt":"$alerted",
            "lastPosition":{"latitude":48.85,"longitude":2.35,"accuracy":12,"recordedAt":"$since"},
            "lastBattery":{"level":9,"measuredAt":"$since"}},
            "announcement":{"kind":"alert","inactiveSince":"$since","at":"$alerted"},"extra":true}""",
        )
        assertThat(event).isNotNull()
        val state = event!!.state
        assertThat(state.userId).isEqualTo(jacques)
        assertThat(state.inactiveSinceMillis).isEqualTo(Instant.parse(since).toEpochMilli())
        assertThat(state.alertedAtMillis).isEqualTo(Instant.parse(alerted).toEpochMilli())
        assertThat(state.lastBattery?.level).isEqualTo(9)
        assertThat(state.lastPosition?.latitude).isEqualTo(48.85)
        assertThat(state.lastPosition?.accuracy).isEqualTo(12.0)
        assertThat(event.announcement?.kind).isEqualTo(InactivityAnnouncementKind.ALERT)
        assertThat(event.announcement?.inactiveSinceMillis).isEqualTo(Instant.parse(since).toEpochMilli())
    }

    @Test
    fun `une position ou une batterie illisible se tait, l'etat reste lu`() {
        val event = alert(
            """{"userId":"$jacques","state":{"userId":"$jacques","inactiveSince":"$since","alertedAt":"$alerted",
            "lastPosition":{"latitude":120,"longitude":2.35,"recordedAt":"$since"},
            "lastBattery":{"level":140,"measuredAt":"$since"}}}""",
        )
        assertThat(event?.state?.userId).isEqualTo(jacques)
        assertThat(event?.state?.lastPosition).isNull()
        assertThat(event?.state?.lastBattery).isNull()
        val undated = alert(
            """{"userId":"$jacques","state":{"userId":"$jacques","inactiveSince":"$since","alertedAt":"$alerted",
            "lastPosition":{"latitude":1,"longitude":2},"lastBattery":{"level":40}}}""",
        )
        assertThat(undated?.state?.lastPosition).isNull()
        assertThat(undated?.state?.lastBattery).isNull()
    }

    @Test
    fun `une annonce d'un genre inconnu est ignoree et l'etat reste lu`() {
        val event = alert(
            """{"userId":"$jacques","state":{"userId":"$jacques","inactiveSince":"$since","alertedAt":"$alerted"},
            "announcement":{"kind":"vanished","inactiveSince":"$since","at":"$alerted"}}""",
        )
        assertThat(event?.state?.userId).isEqualTo(jacques)
        assertThat(event?.announcement).isNull()
    }

    @Test
    fun `un etat hors contrat est ecarte`() {
        assertThat(alert("""{"userId":"$jacques","state":{"userId":"$jacques","inactiveSince":"hier","alertedAt":"$alerted"}}""")).isNull()
        assertThat(alert("""{"userId":"$jacques","state":{"inactiveSince":"$since","alertedAt":"$alerted"}}""")).isNull()
        assertThat(alert("""{"userId":"$jacques","state":{"userId":"$jacques","inactiveSince":"$since"}}""")).isNull()
        assertThat(alert("""{"userId":"autre","state":{"userId":"$jacques","inactiveSince":"$since","alertedAt":"$alerted"}}""")).isNull()
    }

    @Test
    fun `inactivity cleared efface et porte parfois l'annonce du retour`() {
        val cleared = json.decodeFromString(
            InactivityClearedWire.serializer(),
            """{"userId":"$jacques","announcement":{"kind":"responded","inactiveSince":"$since","at":"$alerted"}}""",
        ).served()
        assertThat(cleared?.userId).isEqualTo(jacques)
        assertThat(cleared?.announcement?.kind).isEqualTo(InactivityAnnouncementKind.RESPONDED)
        val silent = json.decodeFromString(InactivityClearedWire.serializer(), """{"userId":"$jacques"}""").served()
        assertThat(silent).isEqualTo(InactivityEvent.Cleared(jacques, null))
        assertThat(json.decodeFromString(InactivityClearedWire.serializer(), """{"userId":"  "}""").served()).isNull()
    }

    @Test
    fun `le rattrapage ecarte un element illisible sans tomber`() {
        val snapshot = json.decodeFromString(
            InactivitySnapshotWire.serializer(),
            """{"items":[{"userId":"$jacques","inactiveSince":"$since","alertedAt":"$alerted"},{"userId":"x"},42]}""",
        ).served(json)
        assertThat(snapshot.map { it.userId }).containsExactly(jacques)
    }

    @Test
    fun `le delai se lit 6, 12, 24 ou coupe, et absent vaut le defaut`() {
        fun read(raw: String) = json.decodeFromString(WellnessSettingsWire.serializer(), raw).choice()
        assertThat(read("""{"delayHours":6}""")).isEqualTo(InactivityDelayChoice.SIX_HOURS)
        assertThat(read("""{"delayHours":24}""")).isEqualTo(InactivityDelayChoice.TWENTY_FOUR_HOURS)
        assertThat(read("""{"delayHours":null}""")).isEqualTo(InactivityDelayChoice.OFF)
        assertThat(read("{}")).isEqualTo(InactivityDelayChoice.TWELVE_HOURS)
        assertThat(read("""{"delayHours":7}""")).isEqualTo(InactivityDelayChoice.TWELVE_HOURS)
        assertThat(InactivityDelayChoice.entries.map { it.hours }).containsExactly(6, 12, 24, null).inOrder()
    }

    @Test
    fun `couper la verification envoie un null explicite, malgre l'encodeur qui tait les nuls`() {
        val off = json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), WellnessSettingsBody.of(InactivityDelayChoice.OFF))
        assertThat(off).isEqualTo("""{"delayHours":null}""")
        val six = json.encodeToString(kotlinx.serialization.json.JsonObject.serializer(), WellnessSettingsBody.of(InactivityDelayChoice.SIX_HOURS))
        assertThat(six).isEqualTo("""{"delayHours":6}""")
    }

    @Test
    fun `les reglages par personne et l'accuse de je vais bien se lisent`() {
        val person = json.decodeFromString(InactivityPersonSettingsWire.serializer(), """{"userId":"$jacques","shared":true}""")
        assertThat(person.shared).isTrue()
        assertThat(json.encodeToString(InactivityPersonSettingsBody.serializer(), InactivityPersonSettingsBody(false)))
            .isEqualTo("""{"shared":false}""")
        assertThat(json.decodeFromString(WellnessOkResultWire.serializer(), """{"tracked":true}""").tracked).isTrue()
        assertThat(json.decodeFromString(WellnessOkResultWire.serializer(), "{}").tracked).isFalse()
    }

    @Test
    fun `les deux evenements descendants sont au catalogue des noms`() {
        assertThat(me.meeshy.sdk.model.socket.SocketEventNames.INACTIVITY_ALERT).isEqualTo("inactivity:alert")
        assertThat(me.meeshy.sdk.model.socket.SocketEventNames.INACTIVITY_CLEARED).isEqualTo("inactivity:cleared")
        assertThat(me.meeshy.sdk.model.socket.SocketEventNames.all).containsAtLeast("inactivity:alert", "inactivity:cleared")
    }

    @Test
    fun `les types de notification sont ceux du contrat, et seule la question appelle la reponse`() {
        assertThat(InactivityContract.WELLNESS_CHECK_NOTIFICATION_TYPE).isEqualTo("wellness_check")
        assertThat(InactivityContract.ALERT_NOTIFICATION_TYPE).isEqualTo("inactivity_alert")
        assertThat(InactivityContract.answersWellness(PushPayload(type = "wellness_check"))).isTrue()
        assertThat(InactivityContract.answersWellness(PushPayload(type = "WELLNESS_CHECK"))).isTrue()
        assertThat(InactivityContract.answersWellness(PushPayload(type = "inactivity_alert"))).isFalse()
        assertThat(InactivityContract.answersWellness(PushPayload())).isFalse()
    }
}
