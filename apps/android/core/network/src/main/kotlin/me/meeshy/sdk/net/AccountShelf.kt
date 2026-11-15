package me.meeshy.sdk.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString

/**
 * Un compte gardé « Rester connecté sur cet appareil », tel qu'il survit à la réinstallation (#14079) : sa session (le
 * PAIR que `POST /auth/refresh` exige, jamais le mot de passe) et ce que le sélecteur de comptes en montre. Le pendant
 * d'une entrée de Keychain iOS par compte (`meeshy_token_<id>`), liée à CET appareil comme [BackedUpSession].
 */
@Serializable
data class BackedUpAccount(
    val session: BackedUpSession,
    val username: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
) {
    val userId: String get() = session.userId

    /** La charge écrite au coffre, liée à l'appareil ; `null` quand elle dépasse ce qu'une entrée du Block Store porte. */
    fun encode(deviceId: String): ByteArray? =
        MeeshyApi.json.encodeToString(DeviceBound(deviceId, this)).toByteArray(Charsets.UTF_8)
            .takeIf { it.size <= MAX_ENTRY_BYTES }

    @Serializable
    private data class DeviceBound(val deviceId: String, val account: BackedUpAccount)

    companion object {
        /** La taille maximale d'une entrée du Block Store. */
        const val MAX_ENTRY_BYTES: Int = 4 * 1024

        /** Le compte gardé pour CET appareil ; une charge illisible, incomplète ou venue d'un autre appareil se lit comme une absence. */
        fun decode(bytes: ByteArray, deviceId: String): BackedUpAccount? {
            val bound = try {
                MeeshyApi.json.decodeFromString<DeviceBound>(bytes.toString(Charsets.UTF_8))
            } catch (_: SerializationException) {
                return null
            } catch (_: IllegalArgumentException) {
                return null
            }
            if (deviceId.isBlank() || bound.deviceId != deviceId) return null
            val session = bound.account.session
            val complete = session.userId.isNotBlank() && session.jwt.isNotBlank() && session.sessionToken.isNotBlank()
            return bound.account.takeIf { complete && it.username.isNotBlank() }
        }
    }
}

/**
 * Le coffre hors de l'app où dorment les comptes gardés, une entrée par compte (#14079). Comme [SessionBackup] : écrire
 * et effacer ne bloquent jamais, un coffre indisponible ne lève jamais, ne garde rien et ne rend rien.
 */
interface AccountShelf {
    suspend fun readAll(): List<BackedUpAccount>

    /** Pose l'entrée du compte ; une charge trop grosse pour une entrée efface l'ancienne plutôt que de la laisser vieillir. */
    fun save(account: BackedUpAccount)
    fun erase(userId: String)

    companion object {
        /** Le Block Store porte seize entrées ; l'une est la session active ([SessionBackup]). */
        const val MAX_ACCOUNTS: Int = 15
    }
}

/** Aucun coffre : les comptes gardés ne survivent pas à la réinstallation, comme avant #14079. */
object NoAccountShelf : AccountShelf {
    override suspend fun readAll(): List<BackedUpAccount> = emptyList()
    override fun save(account: BackedUpAccount) = Unit
    override fun erase(userId: String) = Unit
}
