package me.meeshy.sdk.model.profile

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.UserUpdatedEvent
import me.meeshy.sdk.model.UserUpdatedEvent.OptionalMediaChange
import org.junit.Test

class ProfileUserRepaintTest {
    private val user = MeeshyUser(id = "u1", username = "bob", displayName = "Bob", avatar = "old.png", bio = "hello")

    @Test
    fun `le profil ouvert est repeint par nom et photo sans toucher au reste`() {
        val event = UserUpdatedEvent(
            userId = "u1", username = "bob2", displayName = "Bobby", hasNameGroup = true,
            avatar = OptionalMediaChange.Replaced("new.png"),
        )
        val repainted = event.repainted(user)!!
        assertThat(repainted.username).isEqualTo("bob2")
        assertThat(repainted.displayName).isEqualTo("Bobby")
        assertThat(repainted.avatar).isEqualTo("new.png")
        assertThat(repainted.bio).isEqualTo("hello")
    }

    @Test
    fun `l'evenement d'un autre utilisateur est ignore`() {
        val event = UserUpdatedEvent(userId = "u2", avatar = OptionalMediaChange.Replaced("x.png"))
        assertThat(event.repainted(user)).isNull()
    }

    @Test
    fun `une photo retiree efface l'avatar et une copie intacte rend null`() {
        val removal = UserUpdatedEvent(userId = "u1", avatar = OptionalMediaChange.Replaced(null))
        assertThat(removal.repainted(user)!!.avatar).isNull()
        assertThat(UserUpdatedEvent(userId = "u1").repainted(user)).isNull()
    }
}
