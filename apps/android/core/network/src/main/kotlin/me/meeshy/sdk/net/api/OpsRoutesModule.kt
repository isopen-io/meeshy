package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** Les interfaces de modération et de santé ([AdminApi], [HealthApi], [ContentRemovalApi]) sur le client partagé. */
@Module
@InstallIn(SingletonComponent::class)
internal object OpsRoutesModule {

    @Provides
    fun providesAdminApi(api: MeeshyApi): AdminApi = api.service(AdminApi::class.java)

    @Provides
    fun providesHealthApi(api: MeeshyApi): HealthApi = api.service(HealthApi::class.java)

    @Provides
    fun providesContentRemovalApi(api: MeeshyApi): ContentRemovalApi = api.service(ContentRemovalApi::class.java)
}
