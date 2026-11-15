package me.meeshy.sdk.net

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import java.security.MessageDigest

/**
 * La session d'un COMPTE, telle qu'elle survit à la désinstallation de l'app (#14058) — le pendant
 * Android du Keychain d'iOS (`ThisDeviceOnly`). Ce qui renouvelle une session Meeshy, c'est le PAIR que
 * `POST /auth/refresh` exige : le JWT signé (son échéance y est ignorée, sa signature et sa session nommée non)
 * et le jeton de session de l'appareil. Jamais le mot de passe.
 */
@Serializable
data class BackedUpSession(
    val userId: String,
    val jwt: String,
    val sessionToken: String,
) {
    /** La charge écrite au coffre, LIÉE à l'appareil qui l'a écrite : un transfert vers un autre téléphone ne l'ouvre pas. */
    fun encode(deviceId: String): ByteArray =
        MeeshyApi.json.encodeToString(DeviceBound(deviceId, this)).toByteArray(Charsets.UTF_8)

    @Serializable
    private data class DeviceBound(val deviceId: String, val session: BackedUpSession)

    companion object {
        /** La session décrite par un porte-jetons, ou `null` tant qu'elle n'est pas celle d'un compte complet. */
        fun of(store: TokenStore): BackedUpSession? {
            val userId = store.userId?.takeIf { it.isNotBlank() } ?: return null
            val jwt = store.jwt?.takeIf { it.isNotBlank() } ?: return null
            val sessionToken = store.sessionToken?.takeIf { it.isNotBlank() } ?: return null
            return BackedUpSession(userId = userId, jwt = jwt, sessionToken = sessionToken)
        }

        /**
         * La session gardée pour CET appareil. Une charge illisible, incomplète ou écrite par un autre appareil
         * (transfert d'un téléphone à l'autre) se lit comme une absence : l'app montre la connexion.
         */
        fun decode(bytes: ByteArray, deviceId: String): BackedUpSession? {
            val bound = try {
                MeeshyApi.json.decodeFromString<DeviceBound>(bytes.toString(Charsets.UTF_8))
            } catch (_: SerializationException) {
                return null
            } catch (_: IllegalArgumentException) {
                return null
            }
            if (deviceId.isBlank() || bound.deviceId != deviceId) return null
            return bound.session.takeIf { it.userId.isNotBlank() && it.jwt.isNotBlank() && it.sessionToken.isNotBlank() }
        }
    }
}

/**
 * Le coffre hors de l'app où dort la session d'un compte. Écrire et effacer ne bloquent jamais l'appelant
 * (les setters du [TokenStore] sont synchrones) ; un coffre indisponible (pas de Play Services) ne lève
 * jamais : il ne garde rien et ne rend rien.
 */
interface SessionBackup {
    suspend fun read(): BackedUpSession?
    fun save(session: BackedUpSession)
    fun erase()
}

/** Aucun coffre : le comportement d'avant #14058, et celui des tests qui n'en parlent pas. */
object NoSessionBackup : SessionBackup {
    override suspend fun read(): BackedUpSession? = null
    override fun save(session: BackedUpSession) = Unit
    override fun erase() = Unit
}

/** L'emplacement du coffre, propre à UN serveur : une session de staging ne s'ouvre jamais contre la production. */
object SessionBackupKey {
    private const val PREFIX = "me.meeshy.session."
    private const val DIGEST_HEX_LENGTH = 32

    fun of(apiBaseUrl: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(apiBaseUrl.trimEnd('/').toByteArray(Charsets.UTF_8))
        return PREFIX + digest.joinToString("") { "%02x".format(it) }.take(DIGEST_HEX_LENGTH)
    }
}
