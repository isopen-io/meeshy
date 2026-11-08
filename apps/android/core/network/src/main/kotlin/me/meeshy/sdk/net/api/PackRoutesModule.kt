package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import retrofit2.Retrofit

/** Les interfaces Retrofit du moteur générique des packs (un module par lot : `NetworkModule` reste gelé). */
@Module
@InstallIn(SingletonComponent::class)
object PackRoutesModule {
    @Provides
    @Singleton
    fun providePackRawApi(retrofit: Retrofit): PackRawApi = retrofit.create(PackRawApi::class.java)

    @Provides
    @Singleton
    fun provideStickerPackRawApi(retrofit: Retrofit): StickerPackRawApi = retrofit.create(StickerPackRawApi::class.java)

    @Provides
    @Singleton
    fun providePackAssetsApi(retrofit: Retrofit): PackAssetsApi = retrofit.create(PackAssetsApi::class.java)
}
