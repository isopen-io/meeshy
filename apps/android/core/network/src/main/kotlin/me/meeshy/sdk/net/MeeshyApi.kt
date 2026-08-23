package me.meeshy.sdk.net

import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import me.meeshy.sdk.model.RefreshTokenRequest
import me.meeshy.sdk.net.api.ActiveCallApi
import me.meeshy.sdk.net.api.AuthApi
import me.meeshy.sdk.net.api.BlockApi
import me.meeshy.sdk.net.api.CallHistoryApi
import me.meeshy.sdk.net.api.CommunityApi
import me.meeshy.sdk.net.api.ConversationApi
import me.meeshy.sdk.net.api.DataExportApi
import me.meeshy.sdk.net.api.FriendApi
import me.meeshy.sdk.net.api.LinkApi
import me.meeshy.sdk.net.api.MediaApi
import me.meeshy.sdk.net.api.MessageApi
import me.meeshy.sdk.net.api.NotificationApi
import me.meeshy.sdk.net.api.PostApi
import me.meeshy.sdk.net.api.PreferencesApi
import me.meeshy.sdk.net.api.ReactionApi
import me.meeshy.sdk.net.api.ReportApi
import me.meeshy.sdk.net.api.ShareLinkApi
import me.meeshy.sdk.net.api.StoryApi
import me.meeshy.sdk.net.api.TranslationApi
import me.meeshy.sdk.net.api.TusApi
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
    val activeCall: ActiveCallApi = retrofit.create()
    val translation: TranslationApi = retrofit.create()
    val media: MediaApi = retrofit.create()
    val tus: TusApi = retrofit.create()
    val preferences: PreferencesApi = retrofit.create()
    val reports: ReportApi = retrofit.create()
    val dataExport: DataExportApi = retrofit.create()
    val shareLinks: ShareLinkApi = retrofit.create()
    val links: LinkApi = retrofit.create()

    companion object {
        val json: Json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            explicitNulls = false
            coerceInputValues = true
        }

        /**
         * @param onSessionExpired appele quand la passerelle refuse l'identite
         *   (401/403) hors des routes d'authentification. Sans lui, une session
         *   expiree remontait comme une erreur de chargement et l'utilisateur
         *   lisait « verifiez votre connexion » alors que le reseau allait bien.
         */
        fun create(
            config: MeeshyConfig,
            tokenStore: TokenStore,
            onSessionExpired: () -> Unit = {},
        ): MeeshyApi {
            // The authenticator needs to call `auth.refresh` on the very instance it
            // guards; the instance does not exist yet. The refresher closure is only
            // invoked on a 401 — long after `api` is assigned — so a lateinit binding
            // safely breaks the cycle. `/auth/refresh` is a handshake endpoint the
            // policy marks ineligible, so the refresh call never re-enters the
            // authenticator (no recursion).
            lateinit var api: MeeshyApi
            val refresher = TokenRefresher {
                val session = tokenStore.sessionToken ?: return@TokenRefresher null
                runCatching {
                    runBlocking { api.auth.refresh(RefreshTokenRequest(session)) }
                }.getOrNull()
                    ?.takeIf { it.success }
                    ?.data
                    ?.token
            }

            val client = OkHttpClient.Builder()
                .addInterceptor(AuthInterceptor(tokenStore))
                // Annonce ce que ce binaire sait LIRE. Ne se pose qu'apres que
                // la lecture v3 existe : l'inverse echangerait une sentinelle
                // lisible contre un ecran vide.
                .addInterceptor(ClientCapabilitiesInterceptor())
                // Apres l'authenticator: si le rafraichissement a pu sauver la
                // session, la reponse finale n'est plus un 401 et rien ne se
                // declenche. On ne signale donc que les expirations REELLES.
                .addInterceptor(AuthExpiryInterceptor(onSessionExpired))
                .authenticator(RefreshAuthenticator(tokenStore, refresher))
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

            api = MeeshyApi(retrofit)
            return api
        }
    }
}
