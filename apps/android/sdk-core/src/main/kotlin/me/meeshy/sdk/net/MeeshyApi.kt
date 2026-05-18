package me.meeshy.sdk.net

import kotlinx.serialization.json.Json
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.MessageApi
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Retrofit
import retrofit2.create

/** Retrofit-backed entry point exposing every typed API surface. */
class MeeshyApi private constructor(retrofit: Retrofit) {

    val auth: AuthApi = retrofit.create()
    val conversations: ConversationApi = retrofit.create()
    val messages: MessageApi = retrofit.create()

    companion object {
        val json: Json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            explicitNulls = false
            coerceInputValues = true
        }

        fun create(config: MeeshyConfig, tokenStore: TokenStore): MeeshyApi {
            val client = OkHttpClient.Builder()
                .addInterceptor(AuthInterceptor(tokenStore))
                .apply {
                    if (config.enableLogging) {
                        addInterceptor(
                            HttpLoggingInterceptor().apply {
                                level = HttpLoggingInterceptor.Level.BODY
                            },
                        )
                    }
                }
                .build()

            val retrofit = Retrofit.Builder()
                .baseUrl(config.apiBaseUrl)
                .client(client)
                .addConverterFactory(
                    JsonConverterFactory(json, "application/json".toMediaType()),
                )
                .build()

            return MeeshyApi(retrofit)
        }
    }
}
