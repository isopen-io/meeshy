package me.meeshy.sdk.net.api

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import retrofit2.Retrofit

@Module
@InstallIn(SingletonComponent::class)
object StickerPackApiModule {
    @Provides
    @Singleton
    fun provideStickerPackApi(retrofit: Retrofit): StickerPackApi = retrofit.create(StickerPackApi::class.java)
}
