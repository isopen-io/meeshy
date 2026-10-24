package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class SmsInviteTest {

    @Test
    fun `le gabarit personnalise est exactement celui d'iOS`() {
        assertThat(SmsInvite.personalized("Awa"))
            .isEqualTo("Salut Awa ! Rejoins-moi sur Meeshy : https://meeshy.me/download")
    }

    @Test
    fun `le gabarit generique est exactement celui d'iOS`() {
        assertThat(SmsInvite.generic)
            .isEqualTo("Rejoins-moi sur Meeshy ! Telecharge l'app : https://meeshy.me/download")
    }

    @Test
    fun `un nom vide retombe sur le salut sans nom`() {
        assertThat(SmsInvite.personalized("  "))
            .isEqualTo("Salut ! Rejoins-moi sur Meeshy : https://meeshy.me/download")
    }

    @Test
    fun `un nom a caracteres speciaux est conserve tel quel`() {
        assertThat(SmsInvite.personalized("Zoë O'Brien-Müller 😀"))
            .isEqualTo("Salut Zoë O'Brien-Müller 😀 ! Rejoins-moi sur Meeshy : https://meeshy.me/download")
    }
}
