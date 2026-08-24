package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import org.junit.Test

/**
 * Fige le contrat de fil de `conversation:participant-left` et
 * `conversation:participant-banned`.
 *
 * Un visiteur venu par un lien partagé n'a AUCUNE ligne `User` : la passerelle
 * émet `userId: null` et le nomme par son `participantId`. Tant que `userId`
 * était déclaré `String` non-nullable, kotlinx échouait sur le document ENTIER —
 * l'événement n'atteignait aucun collecteur, sans erreur visible. C'est le même
 * défaut que `ParticipantRoleUpdatedEvent`, dont le `role` de premier niveau
 * n'avait jamais existé sur le fil : **un modèle plus strict que le fil ne
 * dégrade pas, il fait disparaître.**
 *
 * Le décodeur reproduit celui du `MessageSocketManager` (mêmes options), sans
 * quoi ces témoins attesteraient un contrat que la production n'applique pas.
 */
class ParticipantRemovalEventTest {

    private val json = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    // ── conversation:participant-left ────────────────────────────────────────

    @Test
    fun `decodes a departure with no account behind it`() {
        val raw = """
            {"conversationId":"c1","participantId":"p-anon","userId":null,
             "displayName":"ano_john_doe799","leftAt":"2026-08-24T10:00:00.000Z"}
        """.trimIndent()

        val event = json.decodeFromString<ParticipantLeftEvent>(raw)

        assertThat(event.userId).isNull()
        assertThat(event.participantId).isEqualTo("p-anon")
    }

    @Test
    fun `decodes a departure of a registered account`() {
        val raw = """
            {"conversationId":"c1","participantId":"p-1","userId":"u-1",
             "displayName":"Grace","leftAt":"2026-08-24T10:00:00.000Z"}
        """.trimIndent()

        val event = json.decodeFromString<ParticipantLeftEvent>(raw)

        assertThat(event.userId).isEqualTo("u-1")
        assertThat(event.participantId).isEqualTo("p-1")
    }

    @Test
    fun `still decodes a gateway that names only the account`() {
        // Passerelle antérieure au contrat : pas de `participantId` sur le fil.
        val raw = """{"conversationId":"c1","userId":"u-1"}"""

        val event = json.decodeFromString<ParticipantLeftEvent>(raw)

        assertThat(event.participantId).isNull()
        assertThat(event.names("u-1")).isTrue()
    }

    @Test
    fun `names the reader by either face of their identity`() {
        val anonymous = json.decodeFromString<ParticipantLeftEvent>(
            """{"conversationId":"c1","participantId":"p-anon","userId":null}"""
        )

        // Une identité Android est un `User.id` pour un compte, un
        // `Participant.id` pour un visiteur de lien partagé.
        assertThat(anonymous.names("p-anon")).isTrue()
        assertThat(anonymous.names("someone-else")).isFalse()
        // Une identité vide ne nomme personne : sans cette garde, la fenêtre où
        // l'auth n'est pas encore résolue purgerait une conversation au hasard.
        assertThat(anonymous.names("")).isFalse()
    }

    // ── conversation:participant-banned ──────────────────────────────────────

    @Test
    fun `decodes a ban with no account behind it, and the link it closed`() {
        val raw = """
            {"conversationId":"c1","participantId":"p-anon","userId":null,
             "bannedAt":"2026-08-24T10:00:00.000Z","closedShareLinkId":"link-1"}
        """.trimIndent()

        val event = json.decodeFromString<ParticipantBannedEvent>(raw)

        assertThat(event.userId).isNull()
        assertThat(event.participantId).isEqualTo("p-anon")
        // Bannir sort de la conversation ET ferme la porte empruntée.
        assertThat(event.closedShareLinkId).isEqualTo("link-1")
    }

    @Test
    fun `a ban that closed no link carries none`() {
        // Un créateur, ou un membre ajouté à la main : il n'y avait pas de porte.
        val raw = """{"conversationId":"c1","participantId":"p-1","userId":"u-1"}"""

        val event = json.decodeFromString<ParticipantBannedEvent>(raw)

        assertThat(event.closedShareLinkId).isNull()
        assertThat(event.names("u-1")).isTrue()
    }
}
