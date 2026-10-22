package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertThrows
import org.junit.Test

/**
 * Le corps qu'Android envoie à `POST/DELETE /users/register-device-token`.
 *
 * Le schéma est celui de la passerelle (`services/gateway/src/routes/push-tokens.ts`,
 * `registerDeviceTokenSchema` / `unregisterDeviceTokenSchema`) : `platform` est
 * REQUIS, `type` vaut `fcm` par défaut côté serveur, et les longueurs sont
 * bornées (`deviceName` 100, `appVersion` 50, `deviceId`/`bundleId` 255) — un
 * dépassement est un 400, donc un jeton jamais enregistré, donc aucune
 * notification push pour cet appareil.
 *
 * Le [Json] ci-dessous reprend les réglages d'encodage de `MeeshyApi.json`
 * (`encodeDefaults` à `false`, `explicitNulls` à `false`) : c'est CE `Json` qui
 * écrit les corps de requête, et c'est lui qui rend `@EncodeDefault` nécessaire.
 */
class RegisterDeviceTokenRequestTest {

    private val wire = Json {
        ignoreUnknownKeys = true
        isLenient = true
        explicitNulls = false
        coerceInputValues = true
    }

    private val token = "fcm-token-0123456789-abcdef"

    private fun encoded(request: RegisterDeviceTokenRequest): JsonObject =
        wire.parseToJsonElement(
            wire.encodeToString(RegisterDeviceTokenRequest.serializer(), request),
        ).jsonObject

    // ── 1. Les défauts sont dans le corps, pas seulement dans le type ─────────

    /**
     * `platform` et `type` valent leur défaut : sans `@EncodeDefault`, kotlinx
     * les OMET (`encodeDefaults = false`) et la passerelle répondrait 400 faute
     * de `platform`. Le témoin lit donc le JSON ENCODÉ, jamais l'objet.
     */
    @Test
    fun `platform android and type fcm are always written to the body`() {
        val body = encoded(RegisterDeviceTokenRequest(token = token))

        assertThat(body["token"]?.jsonPrimitive?.content).isEqualTo(token)
        assertThat(body["platform"]?.jsonPrimitive?.content).isEqualTo("android")
        assertThat(body["type"]?.jsonPrimitive?.content).isEqualTo("fcm")
    }

    @Test
    fun `an Android request never says apns`() {
        val request = RegisterDeviceTokenRequest.fcm(token)

        assertThat(request.type).isEqualTo("fcm")
        assertThat(request.platform).isEqualTo("android")
        assertThat(encoded(request).keys).doesNotContain("apnsEnvironment")
    }

    // ── 2. Les champs optionnels absents ne sont pas sérialisés ───────────────

    @Test
    fun `absent optional fields are not serialized`() {
        val body = encoded(RegisterDeviceTokenRequest.fcm(token))

        assertThat(body.keys).containsExactly("token", "platform", "type")
    }

    @Test
    fun `provided optional fields travel under the gateway names`() {
        val body = encoded(
            RegisterDeviceTokenRequest.fcm(
                token = token,
                deviceId = "device-1",
                deviceName = "Pixel 8",
                appVersion = "2.0.1",
                bundleId = "me.meeshy.android",
            ),
        )

        assertThat(body["deviceId"]?.jsonPrimitive?.content).isEqualTo("device-1")
        assertThat(body["deviceName"]?.jsonPrimitive?.content).isEqualTo("Pixel 8")
        assertThat(body["appVersion"]?.jsonPrimitive?.content).isEqualTo("2.0.1")
        assertThat(body["bundleId"]?.jsonPrimitive?.content).isEqualTo("me.meeshy.android")
    }

    @Test
    fun `blank optional fields are dropped rather than sent empty`() {
        val request = RegisterDeviceTokenRequest.fcm(
            token = token,
            deviceId = "  ",
            deviceName = "",
            appVersion = "\n",
            bundleId = " ",
        )

        assertThat(encoded(request).keys).containsExactly("token", "platform", "type")
    }

    // ── 3. Les bornes du schéma de la passerelle ──────────────────────────────

    @Test
    fun `device name is capped at 100 characters`() {
        val request = RegisterDeviceTokenRequest.fcm(token, deviceName = "n".repeat(150))

        assertThat(request.deviceName).hasLength(100)
    }

    @Test
    fun `app version is capped at 50 characters`() {
        val request = RegisterDeviceTokenRequest.fcm(token, appVersion = "v".repeat(80))

        assertThat(request.appVersion).hasLength(50)
    }

    @Test
    fun `device id and bundle id are capped at 255 characters`() {
        val request = RegisterDeviceTokenRequest.fcm(
            token,
            deviceId = "d".repeat(400),
            bundleId = "b".repeat(400),
        )

        assertThat(request.deviceId).hasLength(255)
        assertThat(request.bundleId).hasLength(255)
    }

    /** Une coupe au milieu d'une paire de substitution écrirait une moitié d'emoji — un UTF-8 invalide. */
    @Test
    fun `a cap never splits a surrogate pair`() {
        val emoji = "📱"
        val name = "x".repeat(99) + emoji

        val capped = RegisterDeviceTokenRequest.fcm(token, deviceName = name).deviceName

        assertThat(capped).isEqualTo("x".repeat(99))
    }

    @Test
    fun `a value under the cap is kept verbatim`() {
        val request = RegisterDeviceTokenRequest.fcm(token, deviceName = "Pixel 8 Pro")

        assertThat(request.deviceName).isEqualTo("Pixel 8 Pro")
    }

    // ── 4. Le désenregistrement ne peut jamais viser « tout » par accident ────

    /**
     * La passerelle, face à un corps SANS `token` ni `deviceId`, SUPPRIME tous
     * les jetons de l'utilisateur (« logout from all devices »). Un client qui
     * enverrait `{}` par mégarde déconnecterait donc ses autres appareils : le
     * type interdit la construction du corps vide.
     */
    @Test
    fun `an unregister request needs a token or a device id`() {
        assertThrows(IllegalArgumentException::class.java) { UnregisterDeviceTokenRequest() }
        assertThrows(IllegalArgumentException::class.java) { UnregisterDeviceTokenRequest(token = " ") }
    }

    @Test
    fun `unregister by token writes only the token`() {
        val body = wire.parseToJsonElement(
            wire.encodeToString(
                UnregisterDeviceTokenRequest.serializer(),
                UnregisterDeviceTokenRequest.byToken(token),
            ),
        ).jsonObject

        assertThat(body.keys).containsExactly("token")
        assertThat(body["token"]?.jsonPrimitive?.content).isEqualTo(token)
    }

    @Test
    fun `unregister by device id writes only the device id`() {
        val body = wire.parseToJsonElement(
            wire.encodeToString(
                UnregisterDeviceTokenRequest.serializer(),
                UnregisterDeviceTokenRequest.byDeviceId("device-1"),
            ),
        ).jsonObject

        assertThat(body.keys).containsExactly("deviceId")
        assertThat(body["deviceId"]?.jsonPrimitive?.content).isEqualTo("device-1")
    }
}
