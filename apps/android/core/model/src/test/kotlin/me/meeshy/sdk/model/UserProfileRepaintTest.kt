package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import org.junit.Test

class UserProfileRepaintTest {
    private val rename = UserUpdatedEvent(
        userId = "u1", username = "bob2", firstName = "Bob", lastName = "Two", hasNameGroup = true,
        avatar = OptionalMediaChange.Replaced("new.png"),
    )

    @Test
    fun `participant is repainted by userId with composed name`() {
        val p = PaginatedParticipant(id = "p", userId = "u1", username = "bob", displayName = "Bob", avatar = "old.png")
        val r = rename.repainted(p)!!
        assertThat(r.displayName).isEqualTo("Bob Two")
        assertThat(r.username).isEqualTo("bob2")
        assertThat(r.avatar).isEqualTo("new.png")
        assertThat(r.id).isEqualTo("p")
    }

    @Test
    fun `another user or a copy without id is untouched`() {
        assertThat(rename.repainted(PaginatedParticipant(id = "p", userId = "u2", username = "bob"))).isNull()
        assertThat(rename.repainted(PaginatedParticipant(id = "p", userId = null, username = "bob"))).isNull()
    }

    @Test
    fun `unchanged copy yields null`() {
        val p = PaginatedParticipant(id = "p", userId = "u1", username = "bob2", firstName = "Bob", lastName = "Two", displayName = "Bob Two", avatar = "new.png")
        assertThat(rename.repainted(p)).isNull()
    }

    @Test
    fun `avatar removal clears the photo and name stays outside the group`() {
        val e = UserUpdatedEvent(userId = "u1", avatar = OptionalMediaChange.Replaced(null))
        val r = e.repainted(PaginatedParticipant(id = "p", userId = "u1", displayName = "Keep", avatar = "old.png"))!!
        assertThat(r.avatar).isNull()
        assertThat(r.displayName).isEqualTo("Keep")
    }

    @Test
    fun `sender nested account follows`() {
        val s = ApiMessageSender(userId = "u1", displayName = "Bob", avatar = "old.png", user = ApiMessageSenderUser(id = "u1", avatar = "old.png"))
        val r = rename.repainted(s)!!
        assertThat(r.name).isEqualTo("Bob Two")
        assertThat(r.resolvedAvatar).isEqualTo("new.png")
        assertThat(rename.repainted(ApiMessageSender(userId = "u9"))).isNull()
    }

    @Test
    fun `api participant is repainted`() {
        assertThat(rename.repainted(ApiParticipant(id = "p", userId = "u1", displayName = "Bob"))!!.displayName).isEqualTo("Bob Two")
    }

    @Test
    fun `repaintedElements copies only touched elements and null when intact`() {
        val a = PaginatedParticipant(id = "a", userId = "u2")
        val b = PaginatedParticipant(id = "b", userId = "u1", username = "bob")
        val out = listOf(a, b).repaintedElements { rename.repainted(it) }!!
        assertThat(out[0]).isSameInstanceAs(a)
        assertThat(out[1].username).isEqualTo("bob2")
        assertThat(listOf(a).repaintedElements { rename.repainted(it) }).isNull()
    }
}
