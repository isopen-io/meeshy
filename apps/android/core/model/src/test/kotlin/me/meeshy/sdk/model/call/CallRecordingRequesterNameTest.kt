package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.group.GroupCallMember
import me.meeshy.sdk.model.call.group.GroupCallRoster
import org.junit.Test

/** R2.2 (#17795) — la carte d'accord nomme CELUI QUI DEMANDE (`requesterId`), jamais le pair principal : iOS `requesterName(resolvedBy:)`. */
class CallRecordingRequesterNameTest {

    private fun pending(requester: String) =
        CallRecordingPhase.Pending(callId = "c1", recordingId = "r1", requesterId = requester, mine = false, mustAnswer = true)

    private val roster = GroupCallRoster(
        localUserId = "me",
        members = listOf(GroupCallMember("u-awa", displayName = "Awa"), GroupCallMember("u-karim", displayName = "Karim")),
    )

    @Test
    fun `seule une demande en attente a un demandeur`() {
        assertThat(CallRecordingPhase.Idle.requesterId).isNull()
        assertThat(CallRecordingPhase.Asking("c1").requesterId).isNull()
        assertThat(CallRecordingPhase.Recording("c1", "r1", "u-awa", mine = false).requesterId).isNull()
        assertThat(pending("u-karim").requesterId).isEqualTo("u-karim")
    }

    @Test
    fun `en groupe, la carte nomme le demandeur et non le pair principal`() {
        val names = CallParticipantNames.of(roster, primaryUserId = "u-awa", primaryName = "Awa")

        assertThat(pending("u-karim").requesterName(names)).isEqualTo("Karim")
    }

    @Test
    fun `en duo, le demandeur est le pair principal et porte le nom de l'appel`() {
        val names = CallParticipantNames.of(GroupCallRoster(localUserId = "me"), primaryUserId = "u-awa", primaryName = "Awa")

        assertThat(pending("u-awa").requesterName(names)).isEqualTo("Awa")
    }

    @Test
    fun `le registre du groupe prime sur le nom de l'appel pour le pair principal`() {
        val names = CallParticipantNames.of(roster, primaryUserId = "u-awa", primaryName = "Famille")

        assertThat(pending("u-awa").requesterName(names)).isEqualTo("Awa")
    }

    @Test
    fun `un demandeur inconnu n'a pas de nom, la carte dit Un participant`() {
        val names = CallParticipantNames.of(roster, primaryUserId = "u-awa", primaryName = "Awa")

        assertThat(pending("u-inconnu").requesterName(names)).isEmpty()
        assertThat(CallRecordingPhase.Idle.requesterName(names)).isEmpty()
    }

    @Test
    fun `un nom vide ou un identifiant vide n'entre pas dans l'annuaire`() {
        val names = CallParticipantNames.of(
            GroupCallRoster(localUserId = "me", members = listOf(GroupCallMember("u-x", displayName = ""))),
            primaryUserId = "",
            primaryName = "Awa",
        )

        assertThat(names).isEmpty()
    }
}
