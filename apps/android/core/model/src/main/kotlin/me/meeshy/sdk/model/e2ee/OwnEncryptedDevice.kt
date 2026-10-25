package me.meeshy.sdk.model.e2ee

import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.intOrNull

/** La plateforme qu'un appareil a déclarée à son enrôlement ; `UNKNOWN` n'est jamais devinée. */
enum class EncryptedDevicePlatform(val wire: String) {
    IOS("ios"),
    MACOS("macos"),
    ANDROID("android"),
    WEB("web"),
    UNKNOWN("unknown"),
    ;

    companion object {
        fun fromWire(raw: String): EncryptedDevicePlatform = values().firstOrNull { it.wire == raw } ?: UNKNOWN
    }
}

/**
 * Un de MES appareils chiffrés, tel que `GET /e2ee/devices` le sert à son seul propriétaire
 * (`E2EEOwnDevice`, `packages/shared/types/e2ee-directory.ts`, #13014). Aucune clé : de quoi le
 * reconnaître, et savoir s'il est celui de la session qui lit la liste.
 */
data class OwnEncryptedDevice(
    val deviceId: Int,
    val registrationId: Int,
    val platform: EncryptedDevicePlatform,
    val label: String?,
    val enrolledAt: Instant,
    val lastSeenAt: Instant,
    val isCurrent: Boolean,
) {
    /** L'appareil de la session courante ne se retire pas depuis lui-même : c'est la déconnexion qui le fait. */
    val isRetirable: Boolean get() = !isCurrent
}

/**
 * Décodage STRICT de la `data` de `GET /e2ee/devices` : un `deviceId` est l'adresse du retrait
 * (`DELETE /e2ee/devices/:deviceId`), il ne se coerce jamais. Un champ requis absent ou du mauvais
 * type, un `deviceId` hors de 1…127 ou servi deux fois rendent `null` : la réponse est malformée,
 * jamais partiellement crue. Une clé inconnue est tolérée et jamais lue.
 */
object OwnEncryptedDevicesDecoder {
    const val DEVICE_ID_MIN: Int = 1
    const val DEVICE_ID_MAX: Int = 127
    const val LABEL_MAX_LENGTH: Int = 64

    fun decode(data: JsonObject): List<OwnEncryptedDevice>? {
        val array = data["devices"] as? JsonArray ?: return null
        val devices = array.map { element -> (element as? JsonObject)?.let(::device) ?: return null }
        return devices.takeIf { list -> list.distinctBy { it.deviceId }.size == list.size }
    }

    /** Ce que l'écran montre d'abord : l'appareil courant, puis le plus récemment actif. */
    fun ordered(devices: List<OwnEncryptedDevice>): List<OwnEncryptedDevice> =
        devices.sortedWith(
            compareByDescending<OwnEncryptedDevice> { it.isCurrent }
                .thenByDescending { it.lastSeenAt }
                .thenBy { it.deviceId },
        )

    private fun device(json: JsonObject): OwnEncryptedDevice? {
        val deviceId = json.int("deviceId")?.takeIf { it in DEVICE_ID_MIN..DEVICE_ID_MAX } ?: return null
        val registrationId = json.int("registrationId")?.takeIf { it > 0 } ?: return null
        val platform = json.string("platform") ?: return null
        val label = json.nullableString("label") ?: return null
        val enrolledAt = json.instant("enrolledAt") ?: return null
        val lastSeenAt = json.instant("lastSeenAt") ?: return null
        val current = (json["current"] as? JsonPrimitive)?.takeIf { !it.isString }?.booleanOrNull ?: return null
        return OwnEncryptedDevice(
            deviceId = deviceId,
            registrationId = registrationId,
            platform = EncryptedDevicePlatform.fromWire(platform),
            label = label.value?.trim()?.take(LABEL_MAX_LENGTH)?.takeIf { it.isNotEmpty() },
            enrolledAt = enrolledAt,
            lastSeenAt = lastSeenAt,
            isCurrent = current,
        )
    }

    private class Present(val value: String?)

    private fun JsonObject.string(key: String): String? =
        (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull && it.isString }?.content

    private fun JsonObject.int(key: String): Int? =
        (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull && !it.isString }?.intOrNull

    private fun JsonObject.nullableString(key: String): Present? = when (val element = this[key]) {
        null, JsonNull -> Present(null)
        is JsonPrimitive -> if (element.isString) Present(element.content) else null
        else -> null
    }

    private fun JsonObject.instant(key: String): Instant? = string(key)?.let { raw ->
        try {
            Instant.parse(raw)
        } catch (_: DateTimeParseException) {
            null
        }
    }
}
