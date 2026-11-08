package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ProfileAuthorTapTest {
    private val objectId = "64f0a1b2c3d4e5f607182930"

    @Test
    fun `un auteur avec compte ouvre sa fiche par son identifiant`() {
        val user = ProfileSheetUser.ofAuthor(userId = objectId, username = "alice", displayName = "Alice", avatarUrl = "https://x/a.png")!!
        assertThat(user.id).isEqualTo(objectId)
        assertThat(user.displayName).isEqualTo("Alice")
        assertThat(user.avatarUrl).isEqualTo("https://x/a.png")
    }

    @Test
    fun `sans compte le pseudo sert d identite`() {
        val user = ProfileSheetUser.ofAuthor(userId = null, username = "bob")!!
        assertThat(user.id).isEqualTo("bob")
    }

    @Test
    fun `un auteur sans identifiant ni pseudo n est pas cliquable`() {
        assertThat(ProfileSheetUser.ofAuthor(userId = null, username = null, displayName = null)).isNull()
        assertThat(ProfileSheetUser.ofAuthor(userId = "  ", username = "")).isNull()
    }

    @Test
    fun `un nom affiche seul sert de pseudo`() {
        assertThat(ProfileSheetUser.ofAuthor(userId = null, displayName = "Carole")!!.username).isEqualTo("Carole")
    }

    @Test
    fun `le pseudo de repli n est pas une identite`() {
        assertThat(ProfileSheetUser(username = "?").isOpenable).isFalse()
        assertThat(ProfileSheetUser(username = "?", participantId = "p1").isOpenable).isTrue()
    }

    @Test
    fun `une mention ouvre la fiche par pseudo`() {
        val user = ProfileSheetUser.ofMention("@dave")!!
        assertThat(user.userId).isNull()
        assertThat(user.id).isEqualTo("dave")
    }

    @Test
    fun `une mention dont le compte est connu ouvre le compte`() {
        assertThat(ProfileSheetUser.ofMention("dave", knownUserId = objectId)!!.userId).isEqualTo(objectId)
    }

    @Test
    fun `une mention vide n ouvre rien`() {
        assertThat(ProfileSheetUser.ofMention("  @ ")).isNull()
    }
}
