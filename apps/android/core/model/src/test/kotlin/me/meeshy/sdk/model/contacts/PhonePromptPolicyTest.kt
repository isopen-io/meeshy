package me.meeshy.sdk.model.contacts

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.MeeshyUser
import org.junit.Test

class PhonePromptPolicyTest {

    private fun user(phone: String?, anonymous: Boolean? = null) =
        MeeshyUser(id = "u1", username = "alice", phoneNumber = phone, isAnonymous = anonymous)

    @Test
    fun `une session absente ne se voit rien proposer`() {
        assertThat(PhonePromptPolicy.shouldOffer(null)).isFalse()
    }

    @Test
    fun `un visiteur anonyme ne se voit rien proposer meme sans numero`() {
        assertThat(PhonePromptPolicy.shouldOffer(user(phone = null, anonymous = true))).isFalse()
    }

    @Test
    fun `un compte qui a un numero ne voit jamais la proposition`() {
        assertThat(PhonePromptPolicy.shouldOffer(user("+33612345678"))).isFalse()
    }

    @Test
    fun `un compte sans numero se voit proposer d en ajouter un`() {
        assertThat(PhonePromptPolicy.shouldOffer(user(null))).isTrue()
        assertThat(PhonePromptPolicy.shouldOffer(user(null, anonymous = false))).isTrue()
    }

    @Test
    fun `un numero vide ou blanc compte pour absent`() {
        assertThat(PhonePromptPolicy.shouldOffer(user(""))).isTrue()
        assertThat(PhonePromptPolicy.shouldOffer(user("   "))).isTrue()
    }
}
