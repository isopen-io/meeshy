package me.meeshy.core.e2ee.wire

import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException

/** Les codes stables que la passerelle pose en `code` (`E2EE_ERROR_CODES` de `packages/shared/types/e2ee-directory.ts`). */
public object E2eeErrorCode {
    public const val DEVICES_MISMATCH: String = "E2EE_DEVICES_MISMATCH"
    public const val CLIENT_OUTDATED: String = "E2EE_CLIENT_OUTDATED"
    public const val DEVICE_NOT_BOUND: String = "E2EE_DEVICE_NOT_BOUND"
    public const val DEVICE_LIMIT_REACHED: String = "E2EE_DEVICE_LIMIT_REACHED"
    public const val ENVELOPES_INVALID: String = "E2EE_ENVELOPES_INVALID"
    public const val REGIME_CHANGED: String = "E2EE_REGIME_CHANGED"
    public const val IDENTITY_REVOKED: String = "E2EE_IDENTITY_REVOKED"
    public const val PREKEY_STOCK_FULL: String = "E2EE_PREKEY_STOCK_FULL"
    public const val DEVICE_CHANGED: String = "E2EE_DEVICE_CHANGED"
    public const val SESSION_RETIRED: String = "E2EE_SESSION_RETIRED"
    public const val KEYS_FORBIDDEN: String = "E2EE_KEYS_FORBIDDEN"
}

/**
 * Un refus de la passerelle sur une route E2EE, avec son code stable et, pour le 409 Sesame, l'écart à résoudre. Le
 * transport (Retrofit, `:sdk-core`) le construit par [E2eeRemoteException.fromResponse] ; le cœur ne connaît pas HTTP.
 */
public class E2eeRemoteException(
    public val code: String?,
    public val httpStatus: Int?,
    public val mismatch: E2eeDevicesMismatch? = null,
    message: String = "e2ee request refused (${code ?: httpStatus})",
) : Exception(message) {

    public companion object {
        @Serializable
        private data class RefusalBody(
            val code: String? = null,
            val missing: List<E2eeDeviceRef>? = null,
            val extra: List<E2eeDeviceRef>? = null,
            val stale: List<E2eeDeviceRef>? = null,
        )

        /**
         * Lit l'enveloppe d'erreur de la passerelle (`{ success:false, error, code, missing, extra, stale }`, les listes à la
         * RACINE comme le lit `APIRejection` iOS). L'écart n'existe que si les trois listes sont présentes ; un corps
         * illisible garde le statut HTTP seul.
         */
        public fun fromResponse(httpStatus: Int, body: String?): E2eeRemoteException {
            val parsed = body?.let {
                try {
                    E2eeJson.decodeFromString(RefusalBody.serializer(), it)
                } catch (_: SerializationException) {
                    null
                } catch (_: IllegalArgumentException) {
                    null
                }
            }
            val mismatch = parsed?.takeIf { it.code == E2eeErrorCode.DEVICES_MISMATCH }?.let { refusal ->
                val missing = refusal.missing ?: return@let null
                val extra = refusal.extra ?: return@let null
                val stale = refusal.stale ?: return@let null
                E2eeDevicesMismatch(missing, extra, stale)
            }
            return E2eeRemoteException(code = parsed?.code ?: "HTTP_$httpStatus", httpStatus = httpStatus, mismatch = mismatch)
        }
    }
}
