package me.meeshy.app.navigation

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Ce que le menu deploye doit, et ne doit plus, offrir.
 *
 * La liste est extraite de `rememberRadialMenuItems` (qui est @Composable, donc
 * hors de portee d'un test JVM) pour que la regle soit verifiable.
 */
class MeeshyAppMenuItemsTest {

    // "Feed" quitte le menu : un simple tap du bouton gauche y mene desormais.
    // L'y laisser offrirait deux chemins pour un meme geste.
    @Test
    fun `the deployed menu no longer offers Feed`() {
        assertFalse(menuItemLabelKeys().contains("tab_feed"))
    }

    // "Reels" RESTE : il n'est atteignable que par appui long, un geste non
    // decouvrable, qui ne doit pas etre le seul chemin vers une section entiere.
    @Test
    fun `the deployed menu still offers Reels`() {
        assertTrue(menuItemLabelKeys().contains("menu_reels"))
    }

    // L'entree reglages dit ce qu'elle FAIT : libelle "Settings", icone engrenage,
    // route settings. L'ancien libelle "Profile" sous un engrenage menant aux
    // reglages cumulait trois signaux contradictoires pour une meme entree.
    @Test
    fun `the deployed menu labels the settings entry as settings, not profile`() {
        assertTrue(menuItemLabelKeys().contains("menu_settings"))
        assertFalse(menuItemLabelKeys().contains("tab_profile"))
    }

    // Le menu reste la voie d'acces aux sections sans bouton dedie.
    @Test
    fun `the deployed menu keeps the sections that have no dedicated button`() {
        val keys = menuItemLabelKeys()
        assertTrue(keys.contains("tab_messages"))
        assertTrue(keys.contains("tab_calls"))
        assertTrue(keys.contains("tab_activity"))
        assertTrue(keys.contains("menu_contacts"))
        assertTrue(keys.contains("menu_new_conversation"))
    }
}
