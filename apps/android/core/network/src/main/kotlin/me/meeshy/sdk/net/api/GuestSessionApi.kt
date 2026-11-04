package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import kotlinx.serialization.json.JsonElement
import me.meeshy.sdk.model.ApiResponse
import me.meeshy.sdk.net.MeeshyApi
import me.meeshy.sdk.net.routes.ApiRoutesGuestSessions
import retrofit2.http.PATCH

/**
 * La session d'un invité de lien (iOS `GuestSessionsEndpoint.me`, web `PATCH /guest-sessions/me`). La passerelle ne sert
 * que PATCH (relire les droits, prolonger la session) et DELETE (la terminer) : jamais GET. Sous son jeton `X-Session-Token`, elle rend
 * soit la session, soit le refus qui la TERMINE (`403 SHARE_LINK_EXPIRED`, `410 GUEST_ACCESS_REVOKED`) que
 * `GuestSessionEndInterceptor` lit au passage : c'est la sonde d'une session détenue.
 */
interface GuestSessionApi {
    @PATCH(ApiRoutesGuestSessions.ME)
    suspend fun me(): ApiResponse<JsonElement>
}

@Module
@InstallIn(SingletonComponent::class)
internal object GuestSessionRoutesModule {
    @Provides
    fun providesGuestSessionApi(api: MeeshyApi): GuestSessionApi = api.service(GuestSessionApi::class.java)
}
