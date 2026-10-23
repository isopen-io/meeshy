package me.meeshy.ui.icons

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class MeeshyIconsDirectionalTest {
    private val table = IconsTestSupport.table()
    private val icons = IconsTestSupport.properties(MeeshyIcons)

    @Test fun `les roles de navigation et d'envoi sont directionnels et AutoMirrored`() {
        val required = listOf("Back", "Forward", "ChevronBackward", "ChevronForward", "Send", "Reply", "ForwardMessage", "Undo", "Redo", "OpenExternal")
        required.forEach { role ->
            assertThat(table.roles.getValue(role).directional).isTrue()
            assertThat(icons.getValue(role).autoMirror).isTrue()
        }
    }

    @Test fun `tous les roles declares directionnels sont AutoMirrored`() {
        table.roles.filterValues { it.directional }.keys.forEach { role ->
            assertThat(icons.getValue(role).autoMirror).isTrue()
        }
    }

    @Test fun `un role AutoMirrored est declare directionnel et inversement un role neutre n'est pas miroite`() {
        icons.forEach { (role, vector) ->
            assertThat(vector.autoMirror).isEqualTo(table.roles.getValue(role).directional)
        }
    }

    @Test fun `les variantes Filled et Outlined d'un meme symbole sont deux roles distincts`() {
        assertThat(icons.getValue("Heart")).isNotSameInstanceAs(icons.getValue("HeartFilled"))
        assertThat(icons.getValue("Lock")).isNotSameInstanceAs(icons.getValue("LockFilled"))
    }
}
