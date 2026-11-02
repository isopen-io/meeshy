package me.meeshy.sdk.model.rootnav

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ActiveConversationReportingTest {

    private class Spy {
        val declared = mutableListOf<String?>()
        val cleared = mutableListOf<String>()
        val reporting = ActiveConversationReporting(declare = { declared += it }, clearSystemNotifications = { cleared += it })
    }

    @Test
    fun `la conversation affichee est declaree et ses notifications systeme retirees`() {
        val spy = Spy()
        spy.reporting.report("A")
        assertThat(spy.declared).containsExactly("A")
        assertThat(spy.cleared).containsExactly("A")
    }

    @Test
    fun `une meme conversation n'est declaree qu'une fois`() {
        val spy = Spy()
        spy.reporting.report("A")
        spy.reporting.report("A")
        assertThat(spy.declared).containsExactly("A")
        assertThat(spy.cleared).containsExactly("A")
    }

    @Test
    fun `quitter la conversation declare aucune conversation sans rien retirer`() {
        val spy = Spy()
        spy.reporting.report("A")
        spy.reporting.report(null)
        assertThat(spy.declared).containsExactly("A", null).inOrder()
        assertThat(spy.cleared).containsExactly("A")
    }

    @Test
    fun `passer de A a B retire les notifications de B`() {
        val spy = Spy()
        spy.reporting.report("A")
        spy.reporting.report("B")
        assertThat(spy.cleared).containsExactly("A", "B").inOrder()
    }

    @Test
    fun `un identifiant vide vaut aucune conversation`() {
        val spy = Spy()
        spy.reporting.report("")
        assertThat(spy.declared).isEmpty()
    }
}
