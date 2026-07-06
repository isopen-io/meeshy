package me.meeshy.sdk.net

import kotlinx.serialization.json.Json
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.api.BlockApi
import me.meeshy.sdk.net.api.CallHistoryApi
import me.meeshy.sdk.net.api.CommunityApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.FriendApi
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.api.UserApi
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
    val reactions: ReactionApi = retrofit.create()
    val posts: PostApi = retrofit.create()
    val users: UserApi = retrofit.create()
    val friends: FriendApi = retrofit.create()
    val blocks: BlockApi = retrofit.create()
    val notifications: NotificationApi = retrofit.create()
    val communities: CommunityApi = retrofit.create()
    val stories: StoryApi = retrofit.create()
    val callHistory: CallHistoryApi = retrofit.create()
    val translation: TranslationApi = retrofit.create()
    val media: MediaApi = retrofit.create()
    val preferences: PreferencesApi = retrofit.create()

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
