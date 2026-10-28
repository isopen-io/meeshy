package me.meeshy.sdk.model.composer

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class AudienceRosterTest {

    private fun person(id: String, username: String = id, name: String? = null) =
        AudienceCandidate(id = id, username = username, displayName = name)

    @Test
    fun `les contacts excluent soi et les bloques`() {
        val contacts = AudienceRoster.contacts(
            friends = listOf(person("me"), person("a"), person("b")),
            selfId = "me",
            blocked = setOf("b"),
        )
        assertThat(contacts.map { it.id }).containsExactly("a")
    }

    @Test
    fun `une requete vide montre tous les contacts, sinon un filtre local insensible a la casse`() {
        val contacts = listOf(person("a", "ana", "Ana Lima"), person("b", "bob", "Robert"))
        assertThat(AudienceRoster.filterLocal(contacts, "  ")).isEqualTo(contacts)
        assertThat(AudienceRoster.filterLocal(contacts, "LIMA").map { it.id }).containsExactly("a")
        assertThat(AudienceRoster.filterLocal(contacts, "bo").map { it.id }).containsExactly("b")
    }

    @Test
    fun `la fusion garde le local d'abord, sans doublon, sans soi ni bloque`() {
        val local = listOf(person("a"))
        val remote = listOf(person("a"), person("c"), person("me"), person("x"))
        val merged = AudienceRoster.merge(local, remote, selfId = "me", blocked = setOf("x"))
        assertThat(merged.map { it.id }).containsExactly("a", "c").inOrder()
    }

    @Test
    fun `basculer ajoute a la fin, retire a la deuxieme fois, et respecte le plafond`() {
        assertThat(AudienceRoster.toggle(listOf("a"), "b")).containsExactly("a", "b").inOrder()
        assertThat(AudienceRoster.toggle(listOf("a", "b"), "a")).containsExactly("b")
        val full = (1..ComposerAudienceSelection.MAX_USERS).map { "u$it" }
        assertThat(AudienceRoster.toggle(full, "extra")).isEqualTo(full)
    }

    @Test
    fun `le nom affiche prefere le nom d'affichage au pseudo`() {
        assertThat(person("a", "ana", "Ana Lima").label).isEqualTo("Ana Lima")
        assertThat(person("a", "ana", "  ").label).isEqualTo("ana")
    }
}
