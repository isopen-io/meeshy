package me.meeshy.sdk.model.relation

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

/** Le Bring vu par l'expéditeur (#16617) : ce que la passerelle sert, rendu sans rien recalculer. */
class BringSenderModelsTest {

    private val json = Json { ignoreUnknownKeys = true; explicitNulls = false }
    private val now = 1_800_000_000_000L

    private fun availability(available: Boolean = true, perDay: Int? = 3, remaining: Int? = 2) =
        BringAvailability(userId = "u2", available = available, perDay = perDay, remainingToday = remaining)

    @Test
    fun `une disponibilite servie offre l'envoi tant qu'il reste un Bring`() {
        assertThat(availability().canSend).isTrue()
        assertThat(availability(remaining = 0).canSend).isFalse()
        assertThat(availability(remaining = 0).isExhausted).isTrue()
        assertThat(availability(available = false).canSend).isFalse()
    }

    @Test
    fun `l'illimite n'est jamais epuise`() {
        val unlimited = availability(perDay = null, remaining = null)
        assertThat(unlimited.isExhausted).isFalse()
        assertThat(unlimited.canSend).isTrue()
    }

    @Test
    fun `l'envoi recompte sans relire, et un refus apres coup retire la ligne`() {
        val counted = availability().counted(perDay = 3, remainingToday = 1)
        assertThat(counted.remainingToday).isEqualTo(1)
        assertThat(counted.available).isTrue()

        val withdrawn = availability().withdrawn
        assertThat(withdrawn.available).isFalse()
        assertThat(withdrawn.remainingToday).isEqualTo(0)
    }

    @Test
    fun `la disponibilite se lit sans les champs facultatifs, et un champ inconnu n'est pas fatal`() {
        val served = json.decodeFromString(
            BringAvailability.serializer(),
            """{"userId":"u2","available":false,"perDay":null,"remainingToday":0,"resetsAt":"2026-11-08T00:00:00Z","futur":1}""",
        )
        assertThat(served.available).isFalse()
        assertThat(served.perDay).isNull()
    }

    @Test
    fun `la sonnerie cesse a son echeance, jamais au-dela de la fenetre de deux minutes`() {
        fun sent(expiresAt: String) = BringSent("b1", "u2", Instant.ofEpochMilli(now).toString(), expiresAt, 3, 2)

        assertThat(sent(Instant.ofEpochMilli(now + 60_000).toString()).deadlineMillis(now)).isEqualTo(now + 60_000)
        assertThat(sent(Instant.ofEpochMilli(now + 3_600_000).toString()).deadlineMillis(now)).isEqualTo(now + 120_000)
        assertThat(sent("pas une date").deadlineMillis(now)).isEqualTo(now + 120_000)
    }

    @Test
    fun `le reglage par personne vaut non bloque quand le champ manque`() {
        val served = json.decodeFromString(RelationPersonSettings.serializer(), """{"userId":"u2","talkieBlocked":true}""")
        assertThat(served.bringBlocked).isFalse()
    }

    @Test
    fun `l'arret socket se lit avec son seul identifiant`() {
        val event = json.decodeFromString(BringStoppedEvent.serializer(), """{"bringId":"b1","reason":"recipient"}""")
        assertThat(event.bringId).isEqualTo("b1")
    }
}
