package me.meeshy.sdk.model.call.group

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le texte du nom d'un appel de groupe, UNE fonction pour l'écran, la pilule et la notification d'appel en cours
 * (#13768) — iOS `GroupCallRoster.callTitle`, que lisent l'en-tête, la pastille et la bulle par `remoteUsername`.
 */
class GroupCallTitleWordingTest {

    private val wording = GroupCallTitleWording(
        unknownMember = "Participant",
        everyone = "Participants à l'appel",
        more = { shown, count -> "$shown +$count" },
    )

    @Test
    fun `the group's own title wins`() {
        assertThat(GroupCallTitle.Group("Famille").text(wording)).isEqualTo("Famille")
    }

    @Test
    fun `two named members then the count of the others`() {
        assertThat(GroupCallTitle.Members(listOf("Ada", "Bruno"), more = 2).text(wording)).isEqualTo("Ada, Bruno +2")
    }

    @Test
    fun `an unknown member reads Participant, and no count without others`() {
        assertThat(GroupCallTitle.Members(listOf("Ada", " "), more = 0).text(wording)).isEqualTo("Ada, Participant")
    }

    @Test
    fun `nobody left reads the call's participants`() {
        assertThat(GroupCallTitle.Everyone.text(wording)).isEqualTo("Participants à l'appel")
    }
}
