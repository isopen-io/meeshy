package me.meeshy.sdk.model.e2ee

import com.google.common.truth.Truth.assertThat
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import org.junit.Test

/** La charge de `GET /e2ee/devices` telle que la passerelle la sert (`E2EEDirectory.ownDevices`, #13014). */
class OwnEncryptedDevicesDecoderTest {

    private fun data(devices: String): JsonObject = Json.parseToJsonElement("""{"devices":[$devices]}""").jsonObject

    private fun device(
        deviceId: String = "2",
        registrationId: String = "4711",
        platform: String = "\"ios\"",
        label: String = "\"Tablette du salon\"",
        enrolledAt: String = "\"2026-10-20T08:00:00.000Z\"",
        lastSeenAt: String = "\"2026-10-25T09:30:00.000Z\"",
        current: String = "false",
        extra: String = "",
    ) = """{"deviceId":$deviceId,"registrationId":$registrationId,"platform":$platform,"label":$label,""" +
        """"enrolledAt":$enrolledAt,"lastSeenAt":$lastSeenAt,"current":$current$extra}"""

    @Test
    fun `decodes the served device, ignoring a key it does not know`() {
        val decoded = OwnEncryptedDevicesDecoder.decode(data(device(extra = ""","identityKey":"BQ==""")))

        assertThat(decoded).containsExactly(
            OwnEncryptedDevice(
                deviceId = 2,
                registrationId = 4711,
                platform = EncryptedDevicePlatform.IOS,
                label = "Tablette du salon",
                enrolledAt = Instant.parse("2026-10-20T08:00:00Z"),
                lastSeenAt = Instant.parse("2026-10-25T09:30:00Z"),
                isCurrent = false,
            ),
        )
    }

    @Test
    fun `an empty list is a valid answer, not a failure`() {
        assertThat(OwnEncryptedDevicesDecoder.decode(data(""))).isEmpty()
    }

    @Test
    fun `a missing or blank label is no label, and an unknown platform is never guessed`() {
        val decoded = OwnEncryptedDevicesDecoder.decode(
            data(device(deviceId = "3", label = "null", platform = "\"tv\"") + "," + device(deviceId = "4", label = "\"   \"")),
        )

        assertThat(decoded!!.map { it.label }).containsExactly(null, null).inOrder()
        assertThat(decoded.first().platform).isEqualTo(EncryptedDevicePlatform.UNKNOWN)
    }

    @Test
    fun `a device id that is coerced, out of range or served twice makes the whole answer malformed`() {
        listOf(
            data(device(deviceId = "\"2\"")),
            data(device(deviceId = "0")),
            data(device(deviceId = "128")),
            data(device(deviceId = "2.5")),
            data(device() + "," + device()),
        ).forEach { malformed ->
            assertThat(OwnEncryptedDevicesDecoder.decode(malformed)).isNull()
        }
    }

    @Test
    fun `a required field that is absent or of the wrong type is never defaulted`() {
        listOf(
            data(device(current = "\"true\"")),
            data(device(current = "null")),
            data(device(lastSeenAt = "\"hier\"")),
            data(device(registrationId = "null")),
            data(device(platform = "1")),
            data(device(label = "42")),
            Json.parseToJsonElement("""{"devices":{}}""").jsonObject,
            Json.parseToJsonElement("""{}""").jsonObject,
        ).forEach { malformed ->
            assertThat(OwnEncryptedDevicesDecoder.decode(malformed)).isNull()
        }
    }

    @Test
    fun `the current device comes first, then the most recently active`() {
        val decoded = OwnEncryptedDevicesDecoder.decode(
            data(
                device(deviceId = "1", lastSeenAt = "\"2026-10-01T00:00:00Z\"") + "," +
                    device(deviceId = "2", lastSeenAt = "\"2026-10-24T00:00:00Z\"") + "," +
                    device(deviceId = "3", lastSeenAt = "\"2026-09-01T00:00:00Z\"", current = "true"),
            ),
        )!!

        assertThat(OwnEncryptedDevicesDecoder.ordered(decoded).map { it.deviceId }).containsExactly(3, 2, 1).inOrder()
    }

    @Test
    fun `the device of the current session is not retirable from here`() {
        val decoded = OwnEncryptedDevicesDecoder.decode(data(device(current = "true")))!!

        assertThat(decoded.single().isRetirable).isFalse()
    }
}
