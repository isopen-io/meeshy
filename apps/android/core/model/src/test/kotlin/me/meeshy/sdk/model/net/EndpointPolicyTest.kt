package me.meeshy.sdk.model.net

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class EndpointPolicyTest {

    private fun auth(path: String) = EndpointPolicy.of(path).authKind

    @Test
    fun `login et verification status sont des identifiants`() {
        assertThat(auth("/auth/login")).isEqualTo(EndpointAuthKind.CREDENTIALS)
        assertThat(auth("/auth/login/2fa")).isEqualTo(EndpointAuthKind.CREDENTIALS)
        assertThat(auth("/auth/verification/status")).isEqualTo(EndpointAuthKind.CREDENTIALS)
    }

    @Test
    fun `refresh register et magic-link n'ont aucune authentification`() {
        listOf("/auth/refresh", "/auth/register", "/auth/register/check", "/auth/magic-link/request")
            .forEach { assertThat(auth(it)).isEqualTo(EndpointAuthKind.NONE) }
    }

    @Test
    fun `les quatre routes publiques du parrainage n'ont pas de bearer, les autres l'exigent`() {
        listOf("/affiliate/click/tok", "/affiliate/track-visit", "/affiliate/validate/tok", "/affiliate/tok/og")
            .forEach { assertThat(auth(it)).isEqualTo(EndpointAuthKind.NONE) }
        listOf("/affiliate/tokens", "/affiliate/tokens/42", "/affiliate/stats", "/affiliate/register")
            .forEach { assertThat(auth(it)).isEqualTo(EndpointAuthKind.BEARER) }
    }

    @Test
    fun `le reste est bearer`() {
        listOf("/conversations", "/auth/logout", "/auth/verification/status/x", "/auth/me")
            .forEach { assertThat(auth(it)).isEqualTo(EndpointAuthKind.BEARER) }
    }

    @Test
    fun `le prefixe d'API est ignore`() {
        assertThat(auth("/api/v1/auth/login")).isEqualTo(EndpointAuthKind.CREDENTIALS)
        assertThat(EndpointPolicy.of("/api/v1/signal/keys").retryPolicy).isEqualTo(EndpointRetryPolicy.NEVER)
    }

    @Test
    fun `toute route signal est jamais reessayee`() {
        assertThat(EndpointPolicy.of("/signal/prekeys").retryPolicy).isEqualTo(EndpointRetryPolicy.NEVER)
        assertThat(EndpointPolicy.of("/signals").retryPolicy).isEqualTo(EndpointRetryPolicy.STANDARD)
        assertThat(EndpointPolicy.of("/conversations").retryPolicy).isEqualTo(EndpointRetryPolicy.STANDARD)
    }

    @Test
    fun `register verify-email et reset-password rendent des refus structures`() {
        listOf("/auth/register", "/auth/verify-email", "/auth/reset-password")
            .forEach { assertThat(EndpointPolicy.of(it).rejectionPolicy).isEqualTo(EndpointRejectionPolicy.STRUCTURED) }
        listOf("/auth/login", "/auth/forgot-password", "/conversations")
            .forEach { assertThat(EndpointPolicy.of(it).rejectionPolicy).isEqualTo(EndpointRejectionPolicy.OPAQUE) }
    }

    @Test
    fun `segment vide double slash et slash final sont detectes`() {
        assertThat(EndpointPolicy.hasEmptyPathSegment("/api/v1/conversations/")).isTrue()
        assertThat(EndpointPolicy.hasEmptyPathSegment("/api/v1//conversations")).isTrue()
        assertThat(EndpointPolicy.hasEmptyPathSegment("/api/v1/conversations")).isFalse()
        assertThat(EndpointPolicy.hasEmptyPathSegment("/")).isFalse()
    }
}
