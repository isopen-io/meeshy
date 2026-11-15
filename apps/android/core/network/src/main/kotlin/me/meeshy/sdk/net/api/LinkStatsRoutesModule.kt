package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi
import javax.inject.Singleton

/** Les interfaces Retrofit du tableau « MES LIENS » : une interface neuve = son module (NetworkModule est gelé). */
@Module
@InstallIn(SingletonComponent::class)
internal object LinkStatsRoutesModule {

    @Provides
    @Singleton
    fun providesTrackingLinkApi(api: MeeshyApi): TrackingLinkApi = api.service(TrackingLinkApi::class.java)

    @Provides
    @Singleton
    fun providesAffiliateApi(api: MeeshyApi): AffiliateApi = api.service(AffiliateApi::class.java)

    @Provides
    @Singleton
    fun providesCommunityLinksApi(api: MeeshyApi): CommunityLinksApi = api.service(CommunityLinksApi::class.java)

    @Provides
    @Singleton
    fun providesRedirectApi(api: MeeshyApi): RedirectApi = api.service(RedirectApi::class.java)

    @Provides
    @Singleton
    fun providesLinkDetailApi(api: MeeshyApi): LinkDetailApi = api.service(LinkDetailApi::class.java)

    @Provides
    @Singleton
    fun providesTrackingLinkTokenApi(api: MeeshyApi): TrackingLinkTokenApi = api.service(TrackingLinkTokenApi::class.java)

    @Provides
    @Singleton
    fun providesAffiliateReferralApi(api: MeeshyApi): AffiliateReferralApi = api.service(AffiliateReferralApi::class.java)
}
