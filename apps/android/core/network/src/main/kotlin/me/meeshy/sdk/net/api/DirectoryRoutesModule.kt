package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.net.MeeshyApi

/** Les interfaces du carnet, de la presence et des mentions sur le client authentifie partage. */
@Module
@InstallIn(SingletonComponent::class)
internal object DirectoryRoutesModule {

    @Provides
    fun providesContactDirectoryApi(api: MeeshyApi): ContactDirectoryApi = api.service(ContactDirectoryApi::class.java)

    @Provides
    fun providesContactMatchApi(api: MeeshyApi): ContactMatchApi = api.service(ContactMatchApi::class.java)

    @Provides
    fun providesContactsApi(api: MeeshyApi): ContactsApi = api.service(ContactsApi::class.java)

    @Provides
    fun providesDirectoryApi(api: MeeshyApi): DirectoryApi = api.service(DirectoryApi::class.java)

    @Provides
    fun providesMentionsApi(api: MeeshyApi): MentionsApi = api.service(MentionsApi::class.java)
}
