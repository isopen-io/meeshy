package me.meeshy.sdk.net

import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okhttp3.MediaType
import okhttp3.RequestBody
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import retrofit2.Converter
import retrofit2.Retrofit
import java.lang.reflect.Type

/** Minimal Retrofit converter backed by kotlinx.serialization [Json]. */
internal class JsonConverterFactory(
    private val json: Json,
    private val contentType: MediaType,
) : Converter.Factory() {

    override fun responseBodyConverter(
        type: Type,
        annotations: Array<out Annotation>,
        retrofit: Retrofit,
    ): Converter<ResponseBody, *> {
        val deserializer = json.serializersModule.serializer(type)
        return Converter<ResponseBody, Any?> { body ->
            body.use { json.decodeFromString(deserializer, it.string()) }
        }
    }

    override fun requestBodyConverter(
        type: Type,
        parameterAnnotations: Array<out Annotation>,
        methodAnnotations: Array<out Annotation>,
        retrofit: Retrofit,
    ): Converter<*, RequestBody> {
        val serializer = json.serializersModule.serializer(type)
        return Converter<Any?, RequestBody> { value ->
            json.encodeToString(serializer, value).toRequestBody(contentType)
        }
    }
}
