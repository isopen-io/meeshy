package me.meeshy.sdk.model.auth

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.net.EndpointAuthKind
import org.junit.Test

class UnauthorizedStepTest {

    @Test
    fun `sans jeton present la session est expiree quelle que soit la route`() {
        EndpointAuthKind.values().forEach { kind ->
            assertThat(UnauthorizedStep.decide(presentsBearer = false, authKind = kind))
                .isEqualTo(UnauthorizedStep.SESSION_EXPIRED)
        }
    }

    @Test
    fun `un jeton present sur une route bearer renouvelle puis rejoue`() {
        assertThat(UnauthorizedStep.decide(true, EndpointAuthKind.BEARER))
            .isEqualTo(UnauthorizedStep.REFRESH_AND_REPLAY)
    }

    @Test
    fun `un jeton present sur une route qui ne renouvelle pas termine la session`() {
        assertThat(UnauthorizedStep.decide(true, EndpointAuthKind.NONE)).isEqualTo(UnauthorizedStep.EXPIRE_SESSION)
        assertThat(UnauthorizedStep.decide(true, EndpointAuthKind.CREDENTIALS)).isEqualTo(UnauthorizedStep.EXPIRE_SESSION)
    }
}
