package me.meeshy.app.push

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.RegisterDeviceTokenRequest
import org.junit.Test

/**
 * Le jeton FCM dit QUEL client il est (#13936) : la passerelle ne route un type à plancher (`bring_stopped`) que vers
 * un jeton dont le bundle se lit natif et dont la version atteint le plancher (`push-type-routing.ts`).
 */
class PushTokenRequestTest {

    @Test
    fun `le jeton declare sa version et son bundle, et toujours le rendu data-only`() {
        val request = dataOnlyCapableRequest("tok", appVersion = "3.1.0", bundleId = "me.meeshy.app")

        assertThat(request.appVersion).isEqualTo("3.1.0")
        assertThat(request.bundleId).isEqualTo("me.meeshy.app")
        assertThat(request.capabilities).containsExactly(RegisterDeviceTokenRequest.CAPABILITY_DATA_ONLY)
        assertThat(request.platform).isEqualTo(RegisterDeviceTokenRequest.PLATFORM_ANDROID)
    }

    @Test
    fun `le bundle du build en cours se lit natif pour la passerelle`() {
        assertThat(me.meeshy.app.BuildConfig.APPLICATION_ID).matches("^me\\.meeshy\\.(app|android)(\\..*)?$")
    }
}
