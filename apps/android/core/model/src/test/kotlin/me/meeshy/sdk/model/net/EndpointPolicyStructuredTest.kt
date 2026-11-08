package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EndpointPolicyStructuredTest {

    private fun structured(path: String) = EndpointPolicy.of(path).rejectionPolicy == EndpointRejectionPolicy.STRUCTURED

    @Test
    fun `le partage d'une traduction rend un refus typé`() {
        assertThat(structured("/api/v1/conversations/c1/shared-translations")).isTrue()
    }

    @Test
    fun `la date de naissance rend un refus typé`() {
        assertThat(structured("/api/v1/me/birth-date")).isTrue()
    }

    @Test
    fun `les routes du jeu rendent un refus typé`() {
        listOf("/api/v1/me/game/duo/d1/accept", "/api/v1/me/game/season/steps/3/claim", "/api/v1/users/u1/game", "/api/v1/users/u1/game/showcase")
            .forEach { assertThat(structured(it)).isTrue() }
    }

    @Test
    fun `les routes voisines gardent un refus opaque`() {
        listOf("/api/v1/conversations/c1/messages", "/api/v1/conversations/c1", "/api/v1/me/profile", "/api/v1/users/u1", "/api/v1/users/u1/gamer")
            .forEach { assertThat(structured(it)).isFalse() }
    }

    @Test
    fun `l'inscription reste typée`() {
        assertThat(structured("/api/v1/auth/register")).isTrue()
    }
}
