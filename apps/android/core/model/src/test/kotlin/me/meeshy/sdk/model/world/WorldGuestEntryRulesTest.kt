package me.meeshy.sdk.model.world

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class WorldGuestEntryRulesTest {

    @Test
    fun `la langue proposee est celle de l'appareil quand elle est l'une des sept`() {
        assertThat(WorldGuestEntryRules.proposedLanguage("pt-BR")).isEqualTo("pt")
        assertThat(WorldGuestEntryRules.proposedLanguage("en_US")).isEqualTo("en")
        assertThat(WorldGuestEntryRules.proposedLanguage("AR")).isEqualTo("ar")
    }

    @Test
    fun `une langue inconnue ou absente retombe sur le francais`() {
        assertThat(WorldGuestEntryRules.proposedLanguage("ja-JP")).isEqualTo("fr")
        assertThat(WorldGuestEntryRules.proposedLanguage("")).isEqualTo("fr")
        assertThat(WorldGuestEntryRules.proposedLanguage(null)).isEqualTo("fr")
    }

    @Test
    fun `le nom doit etre non vide une fois rogne et tenir dans le plafond`() {
        assertThat(WorldGuestEntryRules.canContinue("   ")).isFalse()
        assertThat(WorldGuestEntryRules.canContinue(" Amina ")).isTrue()
        assertThat(WorldGuestEntryRules.canContinue("a".repeat(50))).isTrue()
        assertThat(WorldGuestEntryRules.canContinue("a".repeat(51))).isFalse()
        assertThat(WorldGuestEntryRules.boundedName("a".repeat(80))).hasLength(50)
    }

    @Test
    fun `les sept langues de l'interface sont dans l'ordre de la planche`() {
        assertThat(WorldGuestEntryRules.interfaceLanguages.map { it.code })
            .containsExactly("fr", "en", "es", "pt", "de", "it", "ar").inOrder()
    }

    @Test
    fun `un echec dit sa raison`() {
        assertThat(WorldGuestEntryRules.failure("NETWORK", null, "timeout")).isEqualTo(WorldEntryFailure.Offline)
        assertThat(WorldGuestEntryRules.failure(null, 403, "Lien fermé")).isEqualTo(WorldEntryFailure.Refused("Lien fermé"))
        assertThat(WorldGuestEntryRules.failure(null, 403, "  ")).isEqualTo(WorldEntryFailure.EnterFailed)
        assertThat(WorldGuestEntryRules.failure(null, 500, "boom")).isEqualTo(WorldEntryFailure.EnterFailed)
    }

    @Test
    fun `seul un 404 ferme la porte`() {
        assertThat(WorldGuestEntryRules.closesTheDoor(404)).isTrue()
        assertThat(WorldGuestEntryRules.closesTheDoor(500)).isFalse()
        assertThat(WorldGuestEntryRules.closesTheDoor(null)).isFalse()
    }
}
