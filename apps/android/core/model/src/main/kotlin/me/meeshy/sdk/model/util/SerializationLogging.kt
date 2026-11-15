package me.meeshy.sdk.model.util

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import java.util.logging.Level
import java.util.logging.Logger

public data class SerializationFailure(
    val direction: Direction,
    val field: String,
    val id: String,
    val errorType: String,
    val message: String,
) {
    public enum class Direction { ENCODE, DECODE }
}

public fun interface SerializationFailureSink {
    public fun report(failure: SerializationFailure)
}

public object SerializationLogging {
    private val logger: Logger = Logger.getLogger("MeeshySerialization")

    @Volatile
    public var sink: SerializationFailureSink = SerializationFailureSink { failure ->
        logger.log(
            Level.SEVERE,
            "${failure.direction} failed for ${failure.field} [id=${failure.id}]: ${failure.errorType} ${failure.message}",
        )
    }
}

private fun Throwable.toFailure(direction: SerializationFailure.Direction, field: String, id: String) =
    SerializationFailure(
        direction = direction,
        field = field,
        id = id,
        errorType = this::class.java.simpleName,
        message = message.orEmpty(),
    )

public fun <T> Json.encodeOrLog(
    serializer: KSerializer<T>,
    value: T,
    field: String,
    id: String = "-",
    sink: SerializationFailureSink = SerializationLogging.sink,
): String? = try {
    encodeToString(serializer, value)
} catch (error: Exception) {
    runCatching { sink.report(error.toFailure(SerializationFailure.Direction.ENCODE, field, id)) }
    null
}

public inline fun <reified T> Json.encodeOrLog(
    value: T,
    field: String,
    id: String = "-",
    sink: SerializationFailureSink = SerializationLogging.sink,
): String? = encodeOrLog(serializersModule.serializer<T>(), value, field, id, sink)

/** Never returns a null that would overwrite a stored payload: on failure the [previous] payload is kept. */
public inline fun <reified T> Json.encodeOrKeep(
    value: T,
    previous: String?,
    field: String,
    id: String = "-",
    sink: SerializationFailureSink = SerializationLogging.sink,
): String? = encodeOrLog(value, field, id, sink) ?: previous

public fun <T> Json.decodeOrLog(
    deserializer: KSerializer<T>,
    payload: String,
    field: String,
    id: String = "-",
    sink: SerializationFailureSink = SerializationLogging.sink,
): T? = try {
    decodeFromString(deserializer, payload)
} catch (error: Exception) {
    runCatching { sink.report(error.toFailure(SerializationFailure.Direction.DECODE, field, id)) }
    null
}

public inline fun <reified T> Json.decodeOrLog(
    payload: String,
    field: String,
    id: String = "-",
    sink: SerializationFailureSink = SerializationLogging.sink,
): T? = decodeOrLog(serializersModule.serializer<T>(), payload, field, id, sink)
