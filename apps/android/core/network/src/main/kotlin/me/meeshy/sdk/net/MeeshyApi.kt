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
import retrofit2.Retrofit
import retrofit2.create

/** Retrofit-backed entry point exposing every typed API surface. */
class MeeshyApi private constructor(private val retrofit: Retrofit) {

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

    /**
     * Une interface Retrofit neuve sur le MÊME client authentifié (jeton, rafraîchissement,
     * expiration de session). Un lot qui apporte son interface l'expose par un module Hilt
     * qui l'appelle (`CallRoutesModule`), au lieu d'ajouter un champ ici.
     */
    fun <T : Any> service(type: Class<T>): T = retrofit.create(type)

    companion object {
        val json: Json = Json {
            ignoreUnknownKeys = true
            isLenient = true
            explicitNulls = false
            coerceInputValues = true
        }

        /**
         * @param onSessionExpired appele quand la passerelle refuse l'identite
         *   (401) hors des routes d'authentification. Un 403 (refus de permission) ne
         *   declenche plus ceci depuis #4862 : ce n'est pas une session expiree.
         * @param extraContributors intercepteurs / authenticator supplementaires, ordonnes
         *   par priorite avec le socle ([HttpClientContributor]). Le graphe Hilt n'appelle
         *   pas cette fonction : il assemble le MEME socle via `HttpClientModule`.
         */
        fun create(
            config: MeeshyConfig,
            tokenStore: TokenStore,
            onSessionExpired: () -> Unit = {},
            extraContributors: Collection<HttpClientContributor> = emptyList(),
        ): MeeshyApi {
            // L'authenticator appelle `auth.refresh` sur l'instance qu'il garde, qui n'existe
            // pas encore : le rafraichissement ne s'execute que sur un 401, bien apres
            // l'affectation, et `/auth/refresh` est une route sans authentification.
            lateinit var api: MeeshyApi
            val contributors = builtInContributors(
                config, tokenStore, onSessionExpired, tokenRefresher(tokenStore) { api },
            ) + extraContributors
            api = from(buildRetrofit(config, HttpClientAssembler.build(contributors)))
            return api
        }

        /** Le MEME `MeeshyApi` sur un Retrofit deja assemble (singleton Hilt). */
        fun from(retrofit: Retrofit): MeeshyApi = MeeshyApi(retrofit)

        fun buildRetrofit(config: MeeshyConfig, client: OkHttpClient): Retrofit =
            Retrofit.Builder()
                .baseUrl(config.apiBaseUrl)
                .client(client)
                .addConverterFactory(JsonConverterFactory(json, "application/json".toMediaType()))
                .build()

        internal fun tokenRefresher(tokenStore: TokenStore, api: () -> MeeshyApi): TokenRefresher =
            TokenRefresher {
                val session = tokenStore.sessionToken ?: return@TokenRefresher null
                runCatching {
                    runBlocking { api().auth.refresh(RefreshTokenRequest(session)) }
                }.getOrNull()
                    ?.takeIf { it.success }
                    ?.data
                    ?.token
            }
    }
}
