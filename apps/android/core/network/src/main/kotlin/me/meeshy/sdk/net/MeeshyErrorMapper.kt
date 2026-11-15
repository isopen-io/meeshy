package me.meeshy.sdk.net

import kotlinx.serialization.SerializationException
import me.meeshy.sdk.model.error.MeeshyError
import me.meeshy.sdk.model.error.NetworkErrorKind
import retrofit2.HttpException
import java.io.IOException
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * Le SITE UNIQUE qui range une exception du transport dans la taxonomie [MeeshyError]
 * (miroir de `MeeshyError.from`, iOS).
 *
 * Un défaut de décodage cite le CHEMIN du champ fautif et jamais le fragment de JSON
 * que `SerializationException.message` recopie : ce fragment est une réponse serveur.
 */
object MeeshyErrorMapper {

    fun map(error: Throwable): MeeshyError = when (error) {
        is InvalidUrlException -> MeeshyError.INVALID_URL
        is SocketTimeoutException -> MeeshyError.Network(NetworkErrorKind.TIMEOUT)
        is UnknownHostException, is ConnectException -> MeeshyError.Network(NetworkErrorKind.SERVER_UNREACHABLE)
        is IOException -> MeeshyError.Network(NetworkErrorKind.NO_CONNECTION)
        is SerializationException -> MeeshyError.Server(0, decodingMessage(error))
        is HttpException -> MeeshyError.fromHttp(error.code(), error.message())
        else -> MeeshyError.Unknown(error.message)
    }

    fun map(error: ApiError): MeeshyError {
        val status = error.httpStatus ?: return MeeshyError.Unknown(error.message)
        return MeeshyError.fromHttp(
            statusCode = status,
            message = error.message,
            code = error.code,
            fieldName = error.fieldName,
            suggestions = error.suggestions,
        )
    }

    /** « at path: $.data.items[2].id » → `$.data.items[2].id`. */
    fun decodingPath(error: SerializationException): String? =
        error.message?.let { PATH.find(it)?.groupValues?.get(1) }

    fun decodingMessage(error: SerializationException): String =
        decodingPath(error)?.let { "${MeeshyError.DECODING.label} (champ : $it)" } ?: MeeshyError.DECODING.label

    private val PATH = Regex("""at path: (\S+)""")
}

internal fun ioApiError(e: IOException): ApiError = when (e) {
    is InvalidUrlException -> ApiError(message = MeeshyError.INVALID_URL.label, code = "INVALID_URL")
    else -> ApiError(message = e.message ?: "Network unavailable", code = "NETWORK")
}

internal fun parseApiError(e: SerializationException): ApiError =
    ApiError(message = MeeshyErrorMapper.decodingMessage(e), code = "PARSE")
