package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Ce que l'echelle deployee doit, et ne doit plus, offrir.
 *
 * La liste est extraite de [rememberMenuLadderItems] (qui est @Composable, donc
 * hors de portee d'un test JVM) pour que la regle soit verifiable. Parite iOS
 * stricte : 6 barreaux, Communautes differee (aucune destination Android),
 * Reels retire (appui long seul). Contacts (`menu_contacts`) est le SEUL
 * barreau retenu qui n'a pas d'equivalent iOS direct — il porte le nominal
 * a un geste vers l'onglet Contacts par defaut depuis que People a quitte
 * le TopAppBar de l'ecran Conversations.
 */
class MeeshyAppMenuItemsTest {

    @Test
    fun `the ladder offers exactly the six rungs, in order`() {
        assertThat(menuLadderLabelKeys())
            .containsExactly(
                "menu_my_links",
                "menu_notifications",
                "tab_calls",
                "menu_discover",
                "menu_contacts",
                "menu_settings",
            )
            .inOrder()
    }

    @Test
    fun `settings is always the last rung`() {
        assertThat(menuLadderLabelKeys().last()).isEqualTo("menu_settings")
    }

    @Test
    fun `the ladder no longer offers Reels`() {
        assertThat(menuLadderLabelKeys()).doesNotContain("menu_reels")
    }

    @Test
    fun `the ladder no longer offers a dedicated Messages rung`() {
        assertThat(menuLadderLabelKeys()).doesNotContain("tab_messages")
    }

    @Test
    fun `the ladder no longer offers New Conversation`() {
        assertThat(menuLadderLabelKeys()).doesNotContain("menu_new_conversation")
    }

    @Test
    fun `the ladder offers Contacts — the nominal one-gesture path since People left the header`() {
        assertThat(menuLadderLabelKeys()).contains("menu_contacts")
    }

    @Test
    fun `the ladder does not yet offer Communities`() {
        assertThat(menuLadderLabelKeys()).doesNotContain("menu_communities")
    }
}
