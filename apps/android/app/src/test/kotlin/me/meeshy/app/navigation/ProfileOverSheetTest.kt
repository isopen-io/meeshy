package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.ui.profile.ProfileSheetOpener
import org.junit.Test

/** #13369 — une personne touchée dans une feuille ouvre sa fiche PAR-DESSUS la feuille, sans navigation qui la retirerait. */
class ProfileOverSheetTest {

    private class Spy {
        val opened = mutableListOf<ProfileSheetUser>()
        var ownPageOpenings = 0
        val opener = ProfileSheetOpener { opened += it }
        fun open(target: String, self: String = "me") = openProfileOverSheet(
            target = target,
            isSelf = { it == self },
            opener = opener,
            navigateOwn = { ownPageOpenings++ },
        )
    }

    @Test
    fun `someone else opens the profile sheet and navigates nowhere`() {
        val spy = Spy()
        spy.open("u42")
        assertThat(spy.opened).containsExactly(ProfileSheetUser.from("u42"))
        assertThat(spy.ownPageOpenings).isEqualTo(0)
    }

    @Test
    fun `myself opens my own page`() {
        val spy = Spy()
        spy.open(" me ")
        assertThat(spy.opened).isEmpty()
        assertThat(spy.ownPageOpenings).isEqualTo(1)
    }

    @Test
    fun `a blank target opens nothing`() {
        val spy = Spy()
        spy.open("  ")
        assertThat(spy.opened).isEmpty()
        assertThat(spy.ownPageOpenings).isEqualTo(0)
    }
}
