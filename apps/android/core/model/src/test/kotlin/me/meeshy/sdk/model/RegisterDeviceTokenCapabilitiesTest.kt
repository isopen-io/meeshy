package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Test

/** The data-only capability the push pipeline declares when it registers its FCM token. */
class RegisterDeviceTokenCapabilitiesTest {

    private val wire = Json {
        ignoreUnknownKeys = true
        explicitNulls = false
    }

    private fun encoded(request: RegisterDeviceTokenRequest) =
        wire.parseToJsonElement(wire.encodeToString(RegisterDeviceTokenRequest.serializer(), request)).jsonObject

    @Test
    fun `sans capacite declaree le corps reste celui d aujourd hui`() {
        assertThat(encoded(RegisterDeviceTokenRequest.fcm("fcm-token-0123456789")).keys).doesNotContain("capabilities")
    }

    @Test
    fun `la capacite data-only part dans le corps`() {
        val request = RegisterDeviceTokenRequest.fcm("fcm-token-0123456789")
            .copy(capabilities = listOf(RegisterDeviceTokenRequest.CAPABILITY_DATA_ONLY))

        val capabilities = encoded(request)["capabilities"]!!.jsonArray.map { it.jsonPrimitive.content }

        assertThat(capabilities).containsExactly("data-only")
    }
}
