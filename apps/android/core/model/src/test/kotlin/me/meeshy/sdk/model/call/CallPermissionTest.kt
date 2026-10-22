package me.meeshy.sdk.model.call

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.call.CallPermission.Context
import org.junit.Test

class CallPermissionTest {

    private fun can(
        type: String,
        creator: Boolean = false,
        role: String? = null,
        platform: String? = null,
        guest: Boolean = false,
    ) = CallPermission.canStartCall(Context(type, creator, role, platform, guest))

    @Test
    fun `direct et group sont ouverts a tout membre`() {
        assertThat(can("direct")).isTrue()
        assertThat(can("group", role = "member")).isTrue()
        assertThat(can("GROUP")).isTrue()
    }

    @Test
    fun `un invite ne lance jamais d appel quel que soit le type`() {
        listOf("direct", "group", "public", "global").forEach {
            assertThat(can(it, creator = true, role = "creator", platform = "BIGBOSS", guest = true)).isFalse()
        }
    }

    @Test
    fun `global n a d appel pour personne`() {
        assertThat(can("global", creator = true, role = "admin", platform = "ADMIN")).isFalse()
    }

    @Test
    fun `public reserve aux createur admin de conversation et admins plateforme`() {
        assertThat(can("public")).isFalse()
        assertThat(can("public", role = "member")).isFalse()
        assertThat(can("public", role = "moderator")).isFalse()
        assertThat(can("public", platform = "MODERATOR")).isFalse()
        assertThat(can("public", creator = true)).isTrue()
        assertThat(can("public", role = "creator")).isTrue()
        assertThat(can("public", role = "ADMIN")).isTrue()
        assertThat(can("public", platform = "admin")).isTrue()
        assertThat(can("public", platform = "BigBoss")).isTrue()
    }

    @Test
    fun `un type inconnu echoue ferme`() {
        assertThat(can("broadcast", creator = true, role = "admin", platform = "BIGBOSS")).isFalse()
        assertThat(can("")).isFalse()
        assertThat(can("channel")).isFalse()
    }
}
