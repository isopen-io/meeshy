package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class ContactAccountActionsTest {

    @Test
    fun `soi n'offre aucune action`() {
        val actions = ContactAccountActions.resolve(ContactRelation.Self)
        assertThat(actions).isEqualTo(ContactAccountActions.NONE)
        assertThat(actions.canWrite).isFalse()
        assertThat(actions.connect).isNull()
    }

    @Test
    fun `un ami n'offre qu'Ecrire`() {
        val actions = ContactAccountActions.resolve(ContactRelation.Friend)
        assertThat(actions.connect).isNull()
        assertThat(actions.canWrite).isTrue()
    }

    @Test
    fun `une demande envoyee est un etat et Ecrire`() {
        val actions = ContactAccountActions.resolve(ContactRelation.RequestSent)
        assertThat(actions.connect).isEqualTo(ContactConnectAction.Pending)
        assertThat(actions.canWrite).isTrue()
    }

    @Test
    fun `une demande recue est un etat et Ecrire`() {
        val actions = ContactAccountActions.resolve(ContactRelation.RequestReceived)
        assertThat(actions.connect).isEqualTo(ContactConnectAction.Received)
        assertThat(actions.canWrite).isTrue()
    }

    @Test
    fun `aucune relation offre Se connecter et Ecrire`() {
        val actions = ContactAccountActions.resolve(ContactRelation.None)
        assertThat(actions.connect).isEqualTo(ContactConnectAction.Connect)
        assertThat(actions.canWrite).isTrue()
    }

    @Test
    fun `une relation inconnue du fil se lit comme aucune relation`() {
        assertThat(ContactRelation.fromWire("request-sent")).isEqualTo(ContactRelation.RequestSent)
        assertThat(ContactRelation.fromWire("self")).isEqualTo(ContactRelation.Self)
        assertThat(ContactRelation.fromWire("blocked-by-aliens")).isEqualTo(ContactRelation.None)
        assertThat(ContactRelation.fromWire(null)).isEqualTo(ContactRelation.None)
    }
}
