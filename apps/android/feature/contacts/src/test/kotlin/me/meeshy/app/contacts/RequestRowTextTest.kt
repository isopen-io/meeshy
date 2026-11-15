package me.meeshy.app.contacts

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.FriendRequest
import org.junit.Test

class RequestRowTextTest {

    @Test
    fun `a personal note is shown trimmed`() {
        assertThat(FriendRequest(id = "r1", message = "  Salut, on s'est vus hier  ").personalMessage())
            .isEqualTo("Salut, on s'est vus hier")
    }

    @Test
    fun `no note, or a blank one, lets the row state the intent`() {
        assertThat(FriendRequest(id = "r1", message = null).personalMessage()).isNull()
        assertThat(FriendRequest(id = "r2", message = "   ").personalMessage()).isNull()
    }
}
