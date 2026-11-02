package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json
import org.junit.Test

class ModeratorPermissionsTest {

    private val json = Json { ignoreUnknownKeys = true }

    @Test
    fun `une charge vide n accorde aucun droit`() {
        val mine = json.decodeFromString<MyPermissions>("{}")

        assertThat(mine.permissions).isEqualTo(ModeratorPermissions())
        assertThat(ModerationAccess.from(mine)).isEqualTo(ModerationAccess.None)
    }

    @Test
    fun `canModerateContent ouvre la moderation et les champs inconnus sont tolérés`() {
        val mine = json.decodeFromString<MyPermissions>(
            """{"role":"MODERATOR","permissions":{"canModerateContent":true,"canFly":true}}""",
        )

        assertThat(ModerationAccess.from(mine).canRemoveContent).isTrue()
    }

    @Test
    fun `sans permissions lues aucun controle n est expose`() {
        assertThat(ModerationAccess.from(null).canRemoveContent).isFalse()
        assertThat(ModerationAccess.from(MyPermissions(role = "USER")).canRemoveContent).isFalse()
        val analyst = MyPermissions("ANALYST", ModeratorPermissions(canViewAnalytics = true))
        assertThat(ModerationAccess.from(analyst).canRemoveContent).isFalse()
    }
}
